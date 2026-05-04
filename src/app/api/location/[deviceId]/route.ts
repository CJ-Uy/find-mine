import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

interface LocationRow {
  device_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  satellites: number;
  ts: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const row = await env.DB.prepare(
    'SELECT device_id, lat, lng, speed_kmh, satellites, ts FROM locations WHERE device_id = ? ORDER BY ts DESC LIMIT 1'
  )
    .bind(deviceId)
    .first<LocationRow>();

  if (!row) {
    return NextResponse.json({ error: 'Device not found or offline' }, { status: 404, headers: CORS });
  }

  const ageMs = Date.now() - new Date(row.ts).getTime();
  const online = ageMs < 3_600_000;

  return NextResponse.json({ ...row, online }, { headers: CORS });
}
