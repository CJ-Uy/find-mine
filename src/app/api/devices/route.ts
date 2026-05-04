import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });

  const result = await env.DB.prepare(
    'SELECT DISTINCT device_id FROM locations ORDER BY device_id'
  ).all<{ device_id: string }>();

  const devices = (result.results ?? []).map((r) => r.device_id);

  return NextResponse.json({ devices }, { headers: CORS });
}
