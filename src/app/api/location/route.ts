import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  const { device_id, lat, lng, speed_kmh = 0, satellites = 0 } = body as {
    device_id?: string;
    lat?: number;
    lng?: number;
    speed_kmh?: number;
    satellites?: number;
  };

  if (!device_id || lat == null || lng == null) {
    return NextResponse.json(
      { error: 'Missing required fields: device_id, lat, lng' },
      { status: 400, headers: CORS }
    );
  }

  const ts = new Date().toISOString();

  const { env } = await getCloudflareContext({ async: true });

  await env.DB.prepare(
    'INSERT INTO locations (device_id, lat, lng, speed_kmh, satellites, ts) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(device_id, lat, lng, speed_kmh, satellites, ts)
    .run();

  return NextResponse.json({ ok: true, ts }, { headers: CORS });
}
