import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET(_req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const result = await env.DB.prepare(
    `SELECT lat, lng, speed_kmh, satellites, ts
     FROM locations
     WHERE device_id = ?
     ORDER BY ts DESC
     LIMIT 200`
  )
    .bind(deviceId)
    .all<{ lat: number; lng: number; speed_kmh: number; satellites: number; ts: string }>();

  const trail = (result.results ?? []).reverse();

  return NextResponse.json({ device_id: deviceId, trail }, { headers: CORS });
}
