'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
  useMap,
} from '@vis.gl/react-google-maps';

const C = {
  yellow: '#fbbd40',
  teal:   '#108ab1',
  purple: '#2f0c33',
  white:  '#ffffff',
};

function MapController({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  const centeredOnce = useRef(false);
  useEffect(() => {
    if (!map || !target) return;
    if (!centeredOnce.current) { map.panTo(target); centeredOnce.current = true; }
  }, [map, target]);
  return null;
}

function RecenterButton({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  if (!target) return null;
  return (
    <button
      onClick={() => map?.panTo(target)}
      style={{
        position: 'absolute', bottom: 196, right: 16, zIndex: 10,
        background: C.teal, border: 'none', borderRadius: 9999,
        color: C.white, fontSize: '0.78rem', fontWeight: 700,
        padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.03em',
        boxShadow: `0 4px 14px rgba(16,138,177,0.4)`,
      }}
    >
      ⊙ Recenter
    </button>
  );
}

interface LocationRecord {
  device_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  satellites: number;
  ts: string;
  online: boolean;
}

interface TrailPoint { lat: number; lng: number; }

const POLL_MS = 5_000;

function HistoryPolyline({ trail }: { trail: TrailPoint[] }) {
  const map     = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLib || trail.length < 2) return;
    polyRef.current?.setMap(null);
    polyRef.current = new mapsLib.Polyline({
      path: trail, strokeColor: C.teal, strokeOpacity: 0.9, strokeWeight: 4, map,
    });
    return () => { polyRef.current?.setMap(null); polyRef.current = null; };
  }, [map, mapsLib, trail]);

  return null;
}

function TrailDots({ trail }: { trail: TrailPoint[] }) {
  return (
    <>
      {trail.slice(0, -1).map((pt, i) => (
        <AdvancedMarker key={i} position={pt}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.yellow, border: '2px solid white', opacity: 0.8 }} />
        </AdvancedMarker>
      ))}
    </>
  );
}

function LiveMarker({ position, online }: { position: { lat: number; lng: number }; online: boolean }) {
  return (
    <AdvancedMarker position={position}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {online && (
          <div style={{ position: 'absolute', width: 32, height: 32, borderRadius: '50%', background: C.teal, opacity: 0.25 }} className="animate-ping" />
        )}
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: online ? C.teal : '#9ca3af', border: '3px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }} />
      </div>
    </AdvancedMarker>
  );
}

export default function TrackerMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [devices,        setDevices]        = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [location,       setLocation]       = useState<LocationRecord | null>(null);
  const [trail,          setTrail]          = useState<TrailPoint[]>([]);
  const [showHistory,    setShowHistory]    = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res  = await fetch('/api/devices');
      const data = (await res.json()) as { devices: string[] };
      setDevices(data.devices ?? []);
      if (data.devices?.length && !selectedDevice) setSelectedDevice(data.devices[0]);
    } catch { /* retry next tick */ }
  }, [selectedDevice]);

  const fetchLocation = useCallback(async (deviceId: string) => {
    try {
      const res = await fetch(`/api/location/${encodeURIComponent(deviceId)}`);
      if (res.status === 404) { setLocation(null); setError('Device not found or offline'); return; }
      setLocation((await res.json()) as LocationRecord);
      setError(null);
    } catch { setError('Failed to fetch location'); }
  }, []);

  const fetchHistory = useCallback(async (deviceId: string) => {
    setLoadingHistory(true);
    try {
      const res  = await fetch(`/api/history/${encodeURIComponent(deviceId)}`);
      const data = (await res.json()) as { trail: TrailPoint[] };
      setTrail(data.trail ?? []);
    } finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    if (!selectedDevice) return;
    fetchLocation(selectedDevice);
    const id = setInterval(() => fetchLocation(selectedDevice), POLL_MS);
    return () => clearInterval(id);
  }, [selectedDevice, fetchLocation]);

  useEffect(() => {
    if (!selectedDevice || !showHistory) { setTrail([]); return; }
    fetchHistory(selectedDevice);
  }, [selectedDevice, showHistory, fetchHistory]);

  if (!apiKey) {
    return (
      <div style={{ background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: C.white }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Missing Google Maps API key</p>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>
            Set <code style={{ background: 'rgba(251,189,64,.15)', color: C.yellow, padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code style={{ background: 'rgba(251,189,64,.15)', color: C.yellow, padding: '2px 6px', borderRadius: 4 }}>.env.local</code>
          </p>
        </div>
      </div>
    );
  }

  const center  = location ? { lat: location.lat, lng: location.lng } : { lat: 14.6401, lng: 121.0773 };
  const lastSeen = location
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        -Math.round((Date.now() - new Date(location.ts).getTime()) / 1000), 'second'
      )
    : null;

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden', background: C.purple }}>
      <APIProvider apiKey={apiKey}>
        <Map mapId="navio-map" defaultCenter={center} defaultZoom={15} gestureHandling="greedy" disableDefaultUI className="h-full w-full">
          <MapController target={location ? center : null} />
          <RecenterButton target={location ? center : null} />
          {location && <LiveMarker position={center} online={location.online} />}
          {showHistory && trail.length > 0 && <><HistoryPolyline trail={trail} /><TrailDots trail={trail} /></>}
        </Map>
      </APIProvider>

      {/* ── Top bar ── */}
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>

        {/* Back + wordmark */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          background: 'rgba(255,255,255,0.95)', borderRadius: 9999,
          boxShadow: '0 2px 12px rgba(47,12,51,0.12)', pointerEvents: 'auto',
          overflow: 'hidden',
        }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRight: '1px solid rgba(47,12,51,.08)',
            color: C.purple, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            transition: 'background .15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(47,12,51,.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ← Home
          </Link>
          <span style={{ padding: '8px 16px', fontWeight: 800, fontSize: 16, letterSpacing: '-.01em' }}>
            <span style={{ color: C.yellow }}>Nav</span><span style={{ color: C.teal }}>io</span>
          </span>
        </div>

        {/* Device selector */}
        {devices.length > 0 && (
          <select
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.95)', border: 'none',
              borderRadius: 9999, padding: '8px 16px',
              fontSize: 13, fontWeight: 600, color: C.purple,
              boxShadow: '0 2px 12px rgba(47,12,51,.12)',
              pointerEvents: 'auto', cursor: 'pointer', outline: 'none',
            }}
          >
            {devices.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        {/* Online status chip */}
        {location && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 9999, padding: '8px 14px',
            boxShadow: '0 2px 12px rgba(47,12,51,.12)',
            fontSize: 12, fontWeight: 700, pointerEvents: 'auto',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: location.online ? C.teal : '#9ca3af', display: 'inline-block' }} />
            <span style={{ color: location.online ? C.teal : '#9ca3af' }}>
              {location.online ? 'Online' : 'Offline'}
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom info card ── */}
      <div style={{ position: 'absolute', bottom: 24, left: 16, right: 16, pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 24, padding: 20,
          boxShadow: '0 8px 32px rgba(47,12,51,0.15)',
          maxWidth: 360, margin: '0 auto',
          pointerEvents: 'auto',
        }}>
          {error && !location ? (
            <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>{error}</p>
          ) : location ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Stat label="Latitude"   value={location.lat.toFixed(6)} />
                <Stat label="Longitude"  value={location.lng.toFixed(6)} />
                <Stat label="Speed"      value={`${location.speed_kmh.toFixed(1)} km/h`} />
                <Stat label="Satellites" value={String(location.satellites)} />
              </div>
              {lastSeen && (
                <p style={{ color: 'rgba(47,12,51,.35)', fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
                  Updated {lastSeen}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: 'rgba(47,12,51,.4)', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>
              Waiting for device…
            </p>
          )}

          {/* History toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(47,12,51,.07)' }}>
            <span style={{ color: 'rgba(47,12,51,.6)', fontSize: 13, fontWeight: 500 }}>Show history trail</span>
            <button
              onClick={() => setShowHistory(v => !v)}
              disabled={loadingHistory}
              style={{
                width: 44, height: 24, borderRadius: 9999, border: 'none', cursor: loadingHistory ? 'not-allowed' : 'pointer',
                background: showHistory ? C.teal : 'rgba(47,12,51,.15)',
                transition: 'background .2s', position: 'relative', opacity: loadingHistory ? 0.5 : 1,
              }}
            >
              <span style={{
                position: 'absolute', top: 4, left: showHistory ? 24 : 4,
                width: 16, height: 16, borderRadius: '50%', background: C.white,
                boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s',
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: 'rgba(47,12,51,.35)', fontSize: 11, marginBottom: 2 }}>{label}</p>
      <p style={{ color: C.purple, fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>{value}</p>
    </div>
  );
}
