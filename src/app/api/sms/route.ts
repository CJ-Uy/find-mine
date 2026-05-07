import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
//  Twilio inbound SMS webhook receiver.
//
//  Twilio POSTs application/x-www-form-urlencoded with fields:
//      From, To, Body, MessageSid, AccountSid, NumMedia, ...
//
//  Device payload in `Body`:
//      NAVIO|<device_id>|<lat>|<lng>|<speed_kmh>|<sats>
//
//  AUTH: Twilio signs every request with X-Twilio-Signature.
//        signature = base64( HMAC-SHA1( authToken, fullUrl + sortedParamsConcat ) )
//        Reject mismatched signatures — otherwise anyone who finds the
//        URL can forge GPS points into your DB.
//        Set TWILIO_AUTH_TOKEN as a Cloudflare secret to enable.
// ─────────────────────────────────────────────────────────────

async function verifyTwilioSignature(
  req: NextRequest,
  rawForm: URLSearchParams,
  authToken: string,
): Promise<boolean> {
  const sig = req.headers.get('x-twilio-signature');
  if (!sig) return false;

  // Twilio signs the public URL it actually called. Behind Cloudflare
  // we reconstruct from x-forwarded-proto + host so the URL matches
  // what Twilio used (req.url may show the internal worker URL).
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('host') ?? url.host;
  const fullUrl = `${proto}://${host}${url.pathname}${url.search}`;

  // Algorithm: alphabetically sort the POST param keys, concat
  // (key + value) pairs onto fullUrl, HMAC-SHA1 with auth token,
  // base64-encode. Compare to X-Twilio-Signature header.
  const keys = Array.from(rawForm.keys()).sort();
  let data = fullUrl;
  for (const k of keys) data += k + (rawForm.get(k) ?? '');

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(macBuf)));
  return expected === sig;
}

export async function POST(req: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });

  const text = await req.text();
  const form = new URLSearchParams(text);

  const authToken = (env as { TWILIO_AUTH_TOKEN?: string }).TWILIO_AUTH_TOKEN;
  if (authToken) {
    const ok = await verifyTwilioSignature(req, form, authToken);
    if (!ok) return new NextResponse('Forbidden', { status: 403 });
  }
  // No token set → verification skipped. OK in dev. NEVER in prod.

  const from = form.get('From') ?? '';
  const body = (form.get('Body') ?? '').trim();

  const parts = body.split('|');
  if (parts.length < 6 || parts[0] !== 'NAVIO') {
    // Unknown sender / format — reply empty TwiML so Twilio sends
    // nothing back to the originator and stops retrying.
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const [, device_id, latS, lngS, spdS, satS] = parts;
  const lat = Number(latS);
  const lng = Number(lngS);
  const speed_kmh = Number(spdS);
  const satellites = Number(satS);

  if (!device_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const ts = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO locations (device_id, lat, lng, speed_kmh, satellites, ts, source, sms_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(device_id, lat, lng, speed_kmh, satellites, ts, 'sms', from)
    .run();

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
