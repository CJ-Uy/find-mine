'use client';

import { useEffect, useMemo, useState } from 'react';

// Refresh cadence on the page itself. The device only updates the
// server when it boots or after each SMS — polling faster than that
// just wastes requests, but 30 s feels responsive when watching.
const POLL_MS = 30_000;
const DEFAULT_DEVICE = 'bracelet-001';

type BalanceRow = {
  device_id: string;
  balance: string | null;
  ts: string | null;
};

// Best-effort parse of carrier USSD replies. Smart returns text like
// "Your balance is P 47.00 valid until 2026-06-01...". We pull the
// peso amount + expiry separately so the UI can render them big,
// while still showing the raw text for transparency.
function parseBalance(text: string | null) {
  if (!text) return { amount: null as string | null, expiry: null as string | null };

  // Match P 47.00 / P47.00 / ₱47.00 / PHP 47.00
  const amountMatch = text.match(/(?:₱|PHP|P)\s*([0-9]+(?:\.[0-9]+)?)/i);
  const amount = amountMatch ? amountMatch[1] : null;

  // Match "valid until <stuff>" up to next sentence boundary
  const expiryMatch = text.match(/valid\s+(?:until|thru|through)\s+([^.;\n]+)/i);
  const expiry = expiryMatch ? expiryMatch[1].trim() : null;

  return { amount, expiry };
}

function relativeTime(iso: string | null) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function BalancePage() {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE);
  const [row, setRow] = useState<BalanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Re-render every 10s so the "X seconds ago" line ticks up live
  // without re-fetching from the server.
  const [, setTick] = useState(0);

  // Read device_id from ?device=... so multiple bracelets can be checked.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('device');
    if (d) setDeviceId(d);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchBalance() {
      try {
        const res = await fetch(`/api/balance?device_id=${encodeURIComponent(deviceId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BalanceRow;
        if (!cancelled) {
          setRow(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'fetch failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(fetchBalance, POLL_MS);
    }

    fetchBalance();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [deviceId]);

  // Live "X ago" ticker.
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(i);
  }, []);

  const parsed = useMemo(() => parseBalance(row?.balance ?? null), [row]);
  const stale = useMemo(() => {
    if (!row?.ts) return false;
    return Date.now() - new Date(row.ts).getTime() > 24 * 60 * 60 * 1000;
  }, [row]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#e0e0e0',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          background: '#14141e',
          border: '1px solid #2a2a3e',
          borderRadius: 16,
          padding: '2rem',
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.78rem', color: '#666', letterSpacing: '0.08em' }}>
              NAVIO · SIM BALANCE
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 4 }}>
              {deviceId}
            </div>
          </div>
          <Pill loading={loading} error={!!error} stale={stale} />
        </header>

        {loading && !row ? (
          <Skeleton />
        ) : error && !row ? (
          <ErrorBox message={error} />
        ) : !row?.balance ? (
          <EmptyBox />
        ) : (
          <>
            <BigAmount amount={parsed.amount} />
            {parsed.expiry && (
              <div style={{ marginTop: '0.5rem', color: '#aaa', fontSize: '0.9rem' }}>
                Valid until <span style={{ color: '#fff' }}>{parsed.expiry}</span>
              </div>
            )}

            <RawBlock text={row.balance} />

            <div
              style={{
                marginTop: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: '#666',
              }}
            >
              <span>Updated {relativeTime(row.ts)}</span>
              <span>auto-refresh {POLL_MS / 1000}s</span>
            </div>
          </>
        )}

        <footer
          style={{
            marginTop: '1.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid #2a2a3e',
            fontSize: '0.72rem',
            color: '#555',
            textAlign: 'center',
          }}
        >
          Device queries USSD on boot &amp; after each SMS — refresh on the
          tracker side, not here.
        </footer>
      </div>
    </main>
  );
}

// ── Sub-components (kept inline to keep the page self-contained) ──

function Pill({ loading, error, stale }: { loading: boolean; error: boolean; stale: boolean }) {
  let label = 'live';
  let color = '#22c55e';
  if (error) {
    label = 'error';
    color = '#ef4444';
  } else if (stale) {
    label = 'stale';
    color = '#f59e0b';
  } else if (loading) {
    label = 'loading';
    color = '#6456ff';
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: '#1a1a2a',
        border: `1px solid ${color}40`,
        borderRadius: 999,
        fontSize: '0.7rem',
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

function BigAmount({ amount }: { amount: string | null }) {
  if (!amount) {
    return (
      <div style={{ fontSize: '1.2rem', color: '#888' }}>
        (couldn&apos;t parse amount — see raw reply below)
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: '1.5rem', color: '#888' }}>₱</span>
      <span style={{ fontSize: '3.5rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {amount}
      </span>
    </div>
  );
}

function RawBlock({ text }: { text: string }) {
  return (
    <details
      style={{
        marginTop: '1.5rem',
        background: '#0e0e16',
        border: '1px solid #232336',
        borderRadius: 10,
        padding: '0.6rem 0.85rem',
      }}
    >
      <summary
        style={{
          fontSize: '0.78rem',
          color: '#888',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        Raw carrier reply
      </summary>
      <pre
        style={{
          margin: '0.6rem 0 0',
          fontSize: '0.78rem',
          color: '#bbb',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        }}
      >
        {text}
      </pre>
    </details>
  );
}

function Skeleton() {
  return (
    <div>
      <div
        style={{
          height: 56,
          width: '70%',
          background: '#1a1a2a',
          borderRadius: 8,
          animation: 'pulse 1.4s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        background: '#2a1414',
        border: '1px solid #5a2424',
        borderRadius: 10,
        padding: '1rem',
        color: '#fca5a5',
        fontSize: '0.9rem',
      }}
    >
      Failed to load: {message}
    </div>
  );
}

function EmptyBox() {
  return (
    <div
      style={{
        background: '#1a1a2a',
        border: '1px dashed #333',
        borderRadius: 10,
        padding: '1.25rem',
        color: '#888',
        fontSize: '0.9rem',
        textAlign: 'center',
      }}
    >
      No balance recorded yet. Boot the tracker on WiFi and wait a few
      seconds — the first USSD query runs right after WiFi connects.
    </div>
  );
}
