import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
//  Device → server: prepaid SIM balance update.
//
//  POST { device_id: string, balance: string }
//
//  The device queries the carrier via USSD (*214# on Smart) and
//  forwards the raw reply text. We don't try to parse a number out
//  of it — carriers change wording often. Just store the latest
//  reply per device and let the UI render it as-is.
//
//  Schema (sim_balances): one row per device, upserted.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: { device_id?: string; balance?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  const { device_id, balance } = body;
  if (!device_id || typeof balance !== 'string') {
    return NextResponse.json(
      { error: 'Missing required fields: device_id, balance' },
      { status: 400, headers: CORS },
    );
  }

  const ts = new Date().toISOString();
  const { env } = await getCloudflareContext({ async: true });

  // Upsert: one row per device. Latest text + timestamp wins.
  await env.DB.prepare(
    `INSERT INTO sim_balances (device_id, balance, ts)
     VALUES (?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET balance=excluded.balance, ts=excluded.ts`,
  )
    .bind(device_id, balance, ts)
    .run();

  return NextResponse.json({ ok: true, ts }, { headers: CORS });
}

// Convenience GET for the frontend — returns latest balance for a device.
//   GET /api/balance?device_id=bracelet-001
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const device_id = url.searchParams.get('device_id');
  if (!device_id) {
    return NextResponse.json({ error: 'device_id required' }, { status: 400, headers: CORS });
  }

  const { env } = await getCloudflareContext({ async: true });
  const row = await env.DB.prepare(
    'SELECT device_id, balance, ts FROM sim_balances WHERE device_id = ?',
  )
    .bind(device_id)
    .first();

  if (!row) {
    return NextResponse.json({ device_id, balance: null, ts: null }, { headers: CORS });
  }
  return NextResponse.json(row, { headers: CORS });
}
