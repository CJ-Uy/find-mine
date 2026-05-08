import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

type LogRow = {
  id: number;
  device_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  satellites: number;
  ts: string;
  source: string;
  sms_from: string | null;
};

export async function GET(req: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);
  const offset = Number(searchParams.get('offset') ?? 0);
  const source = searchParams.get('source'); // 'sms' | 'http' | null (all)
  const device = searchParams.get('device_id');

  let query = `SELECT id, device_id, lat, lng, speed_kmh, satellites, ts, source, sms_from
               FROM locations`;
  const bindings: (string | number)[] = [];
  const clauses: string[] = [];

  if (source) {
    clauses.push('source = ?');
    bindings.push(source);
  }
  if (device) {
    clauses.push('device_id = ?');
    bindings.push(device);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY ts DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query)
    .bind(...bindings)
    .all<LogRow>();

  return NextResponse.json(
    { rows: result.results ?? [], limit, offset },
    { headers: CORS }
  );
}
