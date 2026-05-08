'use client';

import { useEffect, useRef, useState } from 'react';

const PAGE = 50;

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

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

const SOURCE_COLOR: Record<string, string> = {
  sms: '#a78bfa',
  http: '#34d399',
};

export default function LogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sms' | 'http'>('all');
  const [, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function buildUrl(off: number, src: string) {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
    if (src !== 'all') p.set('source', src);
    return `/api/logs?${p}`;
  }

  async function load(off: number, src: string, append = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(off, src), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rows: LogRow[] };
      setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
      setHasMore(data.rows.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }

  // Initial + filter change
  useEffect(() => {
    setOffset(0);
    setRows([]);
    load(0, filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Auto-refresh newest page every 15s (only when on page 0)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (offset === 0) load(0, filter);
      setTick((t) => t + 1); // keep relative times live
    }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, offset]);

  function loadMore() {
    const next = offset + PAGE;
    setOffset(next);
    load(next, filter, true);
  }

  const smsCnt = rows.filter((r) => r.source === 'sms').length;
  const httpCnt = rows.filter((r) => r.source === 'http').length;

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e0e0e0',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.78rem', color: '#555', letterSpacing: '0.1em', marginBottom: 4 }}>
            NAVIO · UPLOAD LOGS
          </div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Location History</h1>
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#666' }}>
            {rows.length} entries shown ·{' '}
            <span style={{ color: SOURCE_COLOR.sms }}>{smsCnt} SMS</span>{' · '}
            <span style={{ color: SOURCE_COLOR.http }}>{httpCnt} WiFi</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
          {(['all', 'http', 'sms'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                border: `1px solid ${filter === s ? (s === 'all' ? '#6456ff' : SOURCE_COLOR[s] ?? '#6456ff') : '#2a2a3e'}`,
                background: filter === s ? '#1a1a2a' : 'transparent',
                color: filter === s ? (s === 'all' ? '#a5b4fc' : SOURCE_COLOR[s] ?? '#a5b4fc') : '#666',
                fontSize: '0.78rem',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              {s === 'all' ? 'All' : s === 'http' ? 'WiFi' : 'SMS'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#555', alignSelf: 'center' }}>
            auto-refresh 15s
          </span>
        </div>

        {/* Table */}
        <div style={{
          background: '#14141e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 130px 70px 60px 80px',
            padding: '8px 16px',
            borderBottom: '1px solid #2a2a3e',
            fontSize: '0.68rem',
            color: '#555',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            <span>Source</span>
            <span>Device</span>
            <span>Coordinates</span>
            <span>Speed</span>
            <span>Sats</span>
            <span style={{ textAlign: 'right' }}>When</span>
          </div>

          {loading && rows.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>Loading…</div>
          ) : error ? (
            <div style={{ padding: '1.5rem', color: '#fca5a5', textAlign: 'center' }}>
              Error: {error}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>
              No uploads recorded yet.
            </div>
          ) : (
            rows.map((row, i) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 130px 70px 60px 80px',
                  padding: '10px 16px',
                  borderBottom: i < rows.length - 1 ? '1px solid #1e1e2e' : 'none',
                  fontSize: '0.8rem',
                  alignItems: 'center',
                  background: i % 2 === 0 ? 'transparent' : '#0f0f18',
                }}
              >
                {/* Source badge */}
                <span>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: `${SOURCE_COLOR[row.source] ?? '#888'}18`,
                    color: SOURCE_COLOR[row.source] ?? '#888',
                    border: `1px solid ${SOURCE_COLOR[row.source] ?? '#888'}40`,
                  }}>
                    {row.source === 'sms' ? 'SMS' : 'WiFi'}
                  </span>
                </span>

                {/* Device + SMS from */}
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: '#ccc' }}>{row.device_id}</span>
                  {row.sms_from && (
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#666', marginTop: 1 }}>
                      from {row.sms_from}
                    </span>
                  )}
                </span>

                {/* Coords */}
                <a
                  href={`https://maps.google.com/?q=${row.lat},${row.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#6878f0', textDecoration: 'none', fontFamily: 'monospace', fontSize: '0.75rem' }}
                >
                  {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                </a>

                {/* Speed */}
                <span style={{ color: '#aaa' }}>
                  {row.speed_kmh.toFixed(1)} <span style={{ color: '#555' }}>km/h</span>
                </span>

                {/* Satellites */}
                <span style={{ color: '#aaa' }}>
                  {row.satellites} <span style={{ color: '#555' }}>sat</span>
                </span>

                {/* Time */}
                <span style={{ textAlign: 'right' }}>
                  <span style={{ color: '#aaa' }} title={formatTs(row.ts)}>
                    {relativeTime(row.ts)}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* Load more */}
        {hasMore && !loading && rows.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              onClick={loadMore}
              style={{
                padding: '8px 24px',
                background: '#1a1a2a',
                border: '1px solid #2a2a3e',
                borderRadius: 8,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Load more
            </button>
          </div>
        )}

        {loading && rows.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '1rem', color: '#555', fontSize: '0.8rem' }}>
            Loading…
          </div>
        )}

        <footer style={{
          marginTop: '2rem',
          fontSize: '0.72rem',
          color: '#444',
          textAlign: 'center',
        }}>
          WiFi = HTTP upload from ESP32 · SMS = Twilio inbound webhook · coords link to Google Maps
        </footer>
      </div>
    </main>
  );
}
