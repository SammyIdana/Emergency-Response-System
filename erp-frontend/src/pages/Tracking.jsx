import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { getVehicles, getOpenIncidents, TRACKING_WS_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';
import { MapPin, Radio, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { VEHICLE_STATUSES, formatRelative } from '../lib/utils';
import GoogleMapComponent from '../components/ui/GoogleMapComponent';

export default function TrackingPage() {
  const [vehicles, setVehicles]   = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [connected, setConnected] = useState(false);
  const [flyTo, setFlyTo]         = useState(null);
  const [filter, setFilter]       = useState('all');
  const socketRef = useRef(null);

  async function loadData() {
    try {
      const [vRes, iRes] = await Promise.allSettled([getVehicles(), getOpenIncidents()]);
      if (vRes.status === 'fulfilled') setVehicles(vRes.value.data.data?.vehicles || vRes.value.data.data || []);
      if (iRes.status === 'fulfilled') setIncidents(iRes.value.data.data?.incidents || iRes.value.data.data || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const token = localStorage.getItem('access_token');
    const socket = io(TRACKING_WS_URL, {
      path: '/tracking',
      query: { token },
      transports: ['websocket'],
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

    socket.on('dispatch_created', () => loadData());

    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  const { isPolice, isHospital, isFire, isAdmin } = useAuth();
  const roleFilter = isPolice ? 'police' : isHospital ? 'ambulance' : isFire ? 'fire' : 'all';

  const filtered = vehicles.filter(v => {
    if (isAdmin) return filter === 'all' ? true : v.unit_type === filter;
    return v.unit_type === roleFilter;
  });

  const activeCnt = filtered.filter(v => ['en_route', 'on_scene'].includes(v.status)).length;

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
          <div className="flex gap-1">
            {['all', 'police', 'ambulance', 'fire'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize
                  ${filter === f ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200'}`}>
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
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
              <GoogleMapComponent 
                center={flyTo || { lat: 5.5502, lng: -0.2174 }} 
                zoom={13}
                markers={[
                  ...incidents.map(inc => ({
                    lat: parseFloat(inc.latitude),
                    lng: parseFloat(inc.longitude),
                    title: `${inc.incident_type} Incident`,
                    icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                  })),
                  ...filtered.map(v => ({
                    lat: parseFloat(v.current_latitude || v.latitude),
                    lng: parseFloat(v.current_longitude || v.longitude),
                    title: `${v.vehicle_id} (${v.status})`,
                    icon: v.unit_type === 'police' ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' : 
                          v.unit_type === 'ambulance' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 
                          'https://maps.google.com/mapfiles/ms/icons/orange-dot.png'
                  }))
                ]}
              />
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
              const emojis = { police: '🚔', ambulance: '🚑', fire: '🚒' };
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
                  {v.driver_name && (
                    <p className="text-[10px] text-zinc-600">Driver: {v.driver_name}</p>
                  )}
                  {lat && lng && (
                    <p className="text-[10px] text-zinc-600 font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
