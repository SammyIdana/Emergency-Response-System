import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import io from 'socket.io-client';
import { getVehicles, getOpenIncidents, TRACKING_WS_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';
import { MapPin, Radio, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { VEHICLE_STATUSES, formatRelative } from '../lib/utils';

// ── Vehicle emoji icons ───────────────────────────────────────────
function makeVehicleIcon(type, status) {
  const emojis = { police: '🚔', ambulance: '🚑', fire: '🚒' };
  const emoji = emojis[type] || '🚐';
  const isActive = ['en_route', 'on_scene'].includes(status);
  return L.divIcon({
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px">
        ${isActive ? `<div style="position:absolute;inset:0;border-radius:50%;background:rgba(249,115,22,0.25);animation:ping 1.5s infinite ease-out"></div>` : ''}
        <div style="position:absolute;inset:4px;border-radius:50%;background:rgba(0,0,0,0.55);border:1px solid ${isActive ? 'rgba(249,115,22,0.6)' : 'rgba(255,255,255,0.15)'}"></div>
        <span style="font-size:20px;position:relative;z-index:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8))">${emoji}</span>
      </div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20],
  });
}

const incidentIcon = L.divIcon({
  html: `<div style="position:relative">
    <div style="position:absolute;top:-3px;left:-3px;right:-3px;bottom:-3px;border-radius:50%;background:rgba(239,68,68,0.3);animation:ping 2s infinite"></div>
    <div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 0 8px rgba(239,68,68,0.7)"></div>
  </div>`,
  className: '', iconSize: [12, 12], iconAnchor: [6, 6],
});

if (typeof document !== 'undefined' && !document.getElementById('ping-style')) {
  const s = document.createElement('style');
  s.id = 'ping-style';
  s.textContent = `@keyframes ping{0%{transform:scale(1);opacity:0.8}100%{transform:scale(2.5);opacity:0}}`;
  document.head.appendChild(s);
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 14, { animate: true, duration: 1.2 });
  }, [target]);
  return null;
}

export default function TrackingPage() {
  const [vehicles, setVehicles] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [flyTo, setFlyTo] = useState(null);
  const [filter, setFilter] = useState('all');
  const socketRef = useRef(null);

  const { isPolice, isHospital, isFire, isAdmin } = useAuth();
  const roleFilter = isPolice ? 'police' : isHospital ? 'ambulance' : isFire ? 'fire' : 'all';

  async function loadData() {
    try {
      const [vRes, iRes] = await Promise.allSettled([getVehicles(), getOpenIncidents()]);
      if (vRes.status === 'fulfilled') setVehicles(vRes.value.data.data?.vehicles || vRes.value.data.data || []);
      if (iRes.status === 'fulfilled') setIncidents(iRes.value.data.data?.incidents || iRes.value.data.data || []);
    } catch { }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const token = localStorage.getItem('access_token');
    const socket = io(TRACKING_WS_URL, {
      path: '/tracking', query: { token }, transports: ['polling', 'websocket'],
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('vehicle_location_update', ({ vehicle_id, latitude, longitude, timestamp }) => {
      setVehicles(prev => prev.map(v =>
        v.vehicle_id === vehicle_id
          ? { ...v, current_latitude: latitude, current_longitude: longitude, last_updated: timestamp }
          : v
      ));
    });
    socket.on('vehicle_status_update', ({ vehicle_id, status }) => {
      setVehicles(prev => prev.map(v =>
        v.vehicle_id === vehicle_id ? { ...v, status } : v
      ));
    });
    socket.on('vehicle_deleted', ({ vehicle_id }) => {
      setVehicles(prev => prev.filter(v => v.vehicle_id !== vehicle_id));
    });
    socket.on('dispatch_created', () => loadData());
    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  const filtered = vehicles.filter(v => {
    if (isAdmin) return filter === 'all' ? true : v.unit_type === filter;
    return v.unit_type === roleFilter;
  });

  const activeCnt = filtered.filter(v => ['en_route', 'on_scene'].includes(v.status)).length;
  const emojis = { police: '🚔', ambulance: '🚑', fire: '🚒' };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-100">Live Tracking</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {connected
              ? <><Wifi size={12} className="text-emerald-400" /><span className="text-xs text-emerald-400">WebSocket connected</span></>
              : <><WifiOff size={12} className="text-zinc-600" /><span className="text-xs text-zinc-500">Connecting…</span></>}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {isAdmin && (
            <div className="flex gap-1">
              {['all', 'police', 'ambulance', 'fire'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize
                    ${filter === f
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200'}`}>
                  {f === 'all' ? 'All' : f}
                </button>
              ))}
            </div>
          )}
          <button onClick={loadData} className="btn-secondary">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Map */}
        <div className="xl:col-span-3">
          <div className="h-[600px] rounded-xl overflow-hidden border border-zinc-800">
            {loading ? (
              <div className="flex items-center justify-center h-full bg-zinc-900">
                <Loader2 className="animate-spin text-orange-500" size={28} />
              </div>
            ) : (
              <MapContainer center={[5.5502, -0.2174]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FlyTo target={flyTo} />

                {/* Incident markers */}
                {incidents.map(inc =>
                  inc.latitude && inc.longitude && (
                    <Marker key={inc.incident_id}
                      position={[parseFloat(inc.latitude), parseFloat(inc.longitude)]}
                      icon={incidentIcon}>
                      <Popup>
                        <div style={{ fontSize: 12 }}>
                          <p style={{ fontWeight: 700, textTransform: 'capitalize', marginBottom: 4 }}>{inc.incident_type} Incident</p>
                          <p style={{ color: '#666' }}>{inc.citizen_name}</p>
                          <p style={{ color: '#999', fontSize: 11 }}>{inc.location_address || 'No address'}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )
                )}

                {/* Vehicle markers */}
                {filtered.map(v => {
                  const lat = parseFloat(v.current_latitude || v.latitude);
                  const lng = parseFloat(v.current_longitude || v.longitude);
                  if (!lat || !lng) return null;
                  return (
                    <Marker key={v.vehicle_id}
                      position={[lat, lng]}
                      icon={makeVehicleIcon(v.unit_type, v.status)}>
                      <Popup>
                        <div style={{ fontSize: 12 }}>
                          <p style={{ fontWeight: 700, marginBottom: 4 }}>{v.vehicle_id}</p>
                          <p style={{ color: '#888', textTransform: 'capitalize' }}>{v.unit_type} · {v.status}</p>
                          {v.driver_name && <p style={{ color: '#999', fontSize: 11, marginTop: 4 }}>Driver: {v.driver_name}</p>}
                          {v.last_updated && <p style={{ color: '#999', fontSize: 11 }}>Updated: {formatRelative(v.last_updated)}</p>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
          <p className="text-xs text-zinc-600 mt-1.5">
            🔴 Incidents &nbsp;·&nbsp; 🚔 Police &nbsp;·&nbsp; 🚑 Ambulance &nbsp;·&nbsp; 🚒 Fire &nbsp;·&nbsp; Pulsing = active
          </p>
        </div>

        {/* Vehicle list */}
        <div className="xl:col-span-1 space-y-3">
          <div className="card py-3 px-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Active Units</p>
              <p className="font-display text-2xl font-bold text-orange-400">{activeCnt}</p>
            </div>
            <Radio size={20} className="text-orange-400 opacity-60" />
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="card text-center py-8 text-zinc-600">
                <MapPin size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No vehicles found</p>
              </div>
            ) : filtered.map(v => {
              const statusCfg = VEHICLE_STATUSES[v.status] || { label: v.status, badge: 'badge-zinc' };
              const lat = parseFloat(v.current_latitude || v.latitude);
              const lng = parseFloat(v.current_longitude || v.longitude);
              return (
                <button key={v.vehicle_id}
                  onClick={() => lat && lng && setFlyTo({ lat, lng })}
                  className="card w-full text-left hover:border-orange-500/30 transition-colors py-3 px-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{emojis[v.unit_type] || '🚐'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-200 truncate">{v.vehicle_id}</p>
                      <p className="text-[10px] text-zinc-500 capitalize">{v.unit_type}</p>
                    </div>
                    <span className={statusCfg.badge}>{statusCfg.label}</span>
                  </div>
                  {v.driver_name && <p className="text-[10px] text-zinc-600">Driver: {v.driver_name}</p>}
                  {lat && lng && <p className="text-[10px] text-zinc-600 font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</p>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
