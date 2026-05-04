'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
  useMap,
} from '@vis.gl/react-google-maps';

interface LocationRecord {
  device_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  satellites: number;
  ts: string;
  online: boolean;
}

interface TrailPoint {
  lat: number;
  lng: number;
}

const POLL_MS = 5_000;

function HistoryPolyline({ trail }: { trail: TrailPoint[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLib || trail.length < 2) return;

    if (polylineRef.current) polylineRef.current.setMap(null);

    polylineRef.current = new mapsLib.Polyline({
      path: trail,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      map,
    });

    return () => {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  }, [map, mapsLib, trail]);

  return null;
}

function TrailDots({ trail }: { trail: TrailPoint[] }) {
  return (
    <>
      {trail.slice(0, -1).map((pt, i) => (
        <AdvancedMarker key={i} position={pt}>
          <div className="w-2 h-2 rounded-full bg-blue-400 opacity-60 border border-blue-200" />
        </AdvancedMarker>
      ))}
    </>
  );
}

function LiveMarker({ position, online }: { position: { lat: number; lng: number }; online: boolean }) {
  return (
    <AdvancedMarker position={position}>
      <div className="relative flex items-center justify-center">
        {online && (
          <div className="absolute w-8 h-8 rounded-full bg-blue-500 opacity-30 animate-ping" />
        )}
        <div
          className={`w-5 h-5 rounded-full border-2 border-white shadow-lg z-10 ${
            online ? 'bg-blue-500' : 'bg-gray-400'
          }`}
        />
      </div>
    </AdvancedMarker>
  );
}

export default function TrackerMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [location, setLocation] = useState<LocationRecord | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setDevices(data.devices ?? []);
      if (data.devices?.length && !selectedDevice) {
        setSelectedDevice(data.devices[0]);
      }
    } catch {
      // silently retry next tick
    }
  }, [selectedDevice]);

  const fetchLocation = useCallback(async (deviceId: string) => {
    try {
      const res = await fetch(`/api/location/${encodeURIComponent(deviceId)}`);
      if (res.status === 404) {
        setLocation(null);
        setError('Device not found or offline');
        return;
      }
      const data = await res.json();
      setLocation(data);
      setError(null);
    } catch {
      setError('Failed to fetch location');
    }
  }, []);

  const fetchHistory = useCallback(async (deviceId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(deviceId)}`);
      const data = await res.json();
      setTrail(data.trail ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (!selectedDevice) return;
    fetchLocation(selectedDevice);
    const id = setInterval(() => fetchLocation(selectedDevice), POLL_MS);
    return () => clearInterval(id);
  }, [selectedDevice, fetchLocation]);

  useEffect(() => {
    if (!selectedDevice || !showHistory) {
      setTrail([]);
      return;
    }
    fetchHistory(selectedDevice);
  }, [selectedDevice, showHistory, fetchHistory]);

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Missing Google Maps API key</p>
          <p className="text-sm text-gray-400">
            Set <code className="bg-gray-800 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{' '}
            <code className="bg-gray-800 px-1 rounded">.env.local</code>
          </p>
        </div>
      </div>
    );
  }

  const center = location ? { lat: location.lat, lng: location.lng } : { lat: 1.3521, lng: 103.8198 };

  const lastSeen = location
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        -Math.round((Date.now() - new Date(location.ts).getTime()) / 1000),
        'second'
      )
    : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId="findmine-map"
          defaultCenter={center}
          defaultZoom={15}
          center={location ? center : undefined}
          gestureHandling="greedy"
          disableDefaultUI
          className="h-full w-full"
        >
          {location && <LiveMarker position={center} online={location.online} />}
          {showHistory && trail.length > 0 && (
            <>
              <HistoryPolyline trail={trail} />
              <TrailDots trail={trail} />
            </>
          )}
        </Map>
      </APIProvider>

      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl px-4 py-2.5 pointer-events-auto">
          <span className="text-white font-bold text-lg tracking-tight">FindMine</span>
        </div>

        {devices.length > 0 && (
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-gray-900/90 backdrop-blur border border-gray-700 text-white text-sm rounded-xl px-3 py-2 pointer-events-auto focus:outline-none focus:border-blue-500"
          >
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}

        {location && (
          <div
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold pointer-events-auto ${
              location.online
                ? 'bg-green-900/80 border border-green-600 text-green-300'
                : 'bg-gray-900/80 border border-gray-600 text-gray-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${location.online ? 'bg-green-400' : 'bg-gray-500'}`}
            />
            {location.online ? 'Online' : 'Offline'}
          </div>
        )}
      </div>

      {/* Bottom info card */}
      <div className="absolute bottom-6 left-4 right-4 pointer-events-none">
        <div className="bg-gray-900/90 backdrop-blur border border-gray-700 rounded-2xl p-4 pointer-events-auto max-w-sm mx-auto space-y-3">
          {error && !location ? (
            <p className="text-gray-400 text-sm text-center">{error}</p>
          ) : location ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Latitude" value={location.lat.toFixed(6)} />
                <Stat label="Longitude" value={location.lng.toFixed(6)} />
                <Stat label="Speed" value={`${location.speed_kmh.toFixed(1)} km/h`} />
                <Stat label="Satellites" value={String(location.satellites)} />
              </div>
              {lastSeen && (
                <p className="text-gray-500 text-xs text-center">Updated {lastSeen}</p>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center">Waiting for device…</p>
          )}

          {/* History toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-700">
            <span className="text-gray-300 text-sm">Show history trail</span>
            <button
              onClick={() => setShowHistory((v) => !v)}
              disabled={loadingHistory}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                showHistory ? 'bg-blue-600' : 'bg-gray-600'
              } ${loadingHistory ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  showHistory ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
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
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white text-sm font-mono font-medium">{value}</p>
    </div>
  );
}
