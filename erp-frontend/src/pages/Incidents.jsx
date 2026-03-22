import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createIncident, dispatchIncident, getIncidents, updateIncidentStatus } from '../lib/api';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle, Plus, X, MapPin, Loader2,
  Send, CheckCircle, Clock, Filter, RefreshCw
} from 'lucide-react';
import {
  INCIDENT_TYPES, INCIDENT_STATUSES, formatRelative,
  incidentBadgeClass, getIncidentIcon
} from '../lib/utils';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const pinIcon = L.divIcon({
  html: `<div style="background:#f97316;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 3px rgba(249,115,22,0.4)"></div>`,
  className: '', iconSize: [14, 14], iconAnchor: [7, 7],
});

function LocationPicker({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

const EMPTY_FORM = {
  citizen_name: '', citizen_phone: '', incident_type: 'crime',
  latitude: '', longitude: '', location_address: '', notes: '',
};

// Role → allowed incident types
const ROLE_INCIDENT_TYPES = {
  hospital_admin: ['medical'],
  police_admin: ['crime', 'accident'],
  fire_admin: ['fire'],
  system_admin: null, // null = all
};

export default function IncidentsPage() {
  const { user, isAdmin } = useAuth();

  // Determine which incident types this role can see
  const allowedTypes = ROLE_INCIDENT_TYPES[user?.role] || null;
  const roleLabel = {
    hospital_admin: '🏥 Hospital Admin — Medical incidents only',
    police_admin: '🚔 Police Admin — Crime & Accident incidents only',
    fire_admin: '🚒 Fire Admin — Fire incidents only',
    system_admin: null,
  }[user?.role];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, incident_type: allowedTypes?.[0] || 'crime' });
  const [pinPos, setPinPos] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dispatching, setDispatching] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadIncidents() {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      // Role-based filter: if not system_admin, only show their type
      if (allowedTypes && !filterType) {
        params.incident_type = allowedTypes[0]; // primary type
      } else if (filterType) {
        params.incident_type = filterType;
      }
      const res = await getIncidents(params);
      let data = res.data.data?.incidents || res.data.data || [];
      // Client-side filter for roles with multiple types (e.g. police sees crime + accident)
      if (allowedTypes && allowedTypes.length > 1) {
        data = data.filter(inc => allowedTypes.includes(inc.incident_type));
      }
      setIncidents(data);
    } catch { showToast('Failed to load incidents', 'error'); }
    setLoading(false);
  }

  useEffect(() => { loadIncidents(); }, [filterStatus, filterType]);

  function handleMapPick(lat, lng) {
    setPinPos({ lat, lng });
    setForm(f => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createIncident({ ...form, latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude) });
      showToast('Incident created successfully');
      setForm({ ...EMPTY_FORM, incident_type: allowedTypes?.[0] || 'crime' });
      setPinPos(null); setShowForm(false);
      loadIncidents();
    } catch (err) { showToast(err.response?.data?.message || 'Failed to create incident', 'error'); }
    setSubmitting(false);
  }

  async function handleDispatch(id) {
    setDispatching(id);
    try {
      await dispatchIncident(id);
      showToast('Dispatched nearest responder');
      loadIncidents();
    } catch (err) { showToast(err.response?.data?.message || 'Dispatch failed — no available responders?', 'error'); }
    setDispatching(null);
  }

  async function handleStatusChange(id, status) {
    try {
      await updateIncidentStatus(id, status);
      showToast(`Status updated to ${status}`);
      loadIncidents();
    } catch (err) { showToast('Update failed', 'error'); }
  }

  // Filter types available in the form dropdown based on role
  const availableIncidentTypes = allowedTypes
    ? INCIDENT_TYPES.filter(t => allowedTypes.includes(t.value))
    : INCIDENT_TYPES;

  return (
    <AppLayout>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl border text-sm font-medium shadow-xl
          ${toast.type === 'error'
            ? 'bg-red-500/15 border-red-500/30 text-red-300'
            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-100">Incidents</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {roleLabel || `${incidents.length} total records`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadIncidents} className="btn-secondary">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'New Incident'}
          </button>
        </div>
      </div>

      {/* New Incident Form */}
      {showForm && (
        <div className="card mb-6 border-orange-500/20">
          <h2 className="font-display font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400" />
            Report New Incident
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Citizen Name *</label>
                    <input className="input" required placeholder="Ama Owusu"
                      value={form.citizen_name} onChange={e => setForm(f => ({ ...f, citizen_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" placeholder="024xxxxxxx"
                      value={form.citizen_phone} onChange={e => setForm(f => ({ ...f, citizen_phone: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="label">Incident Type *</label>
                  <select className="input" required value={form.incident_type}
                    onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))}
                    disabled={availableIncidentTypes.length === 1}>
                    {availableIncidentTypes.map(t => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Latitude *</label>
                    <input className="input font-mono text-xs" required placeholder="5.5502"
                      value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Longitude *</label>
                    <input className="input font-mono text-xs" required placeholder="-0.2174"
                      value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="label">Location Address</label>
                  <input className="input" placeholder="Makola Market, Accra"
                    value={form.location_address} onChange={e => setForm(f => ({ ...f, location_address: e.target.value }))} />
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea className="input min-h-[80px] resize-none" placeholder="Describe the incident..."
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {submitting ? 'Creating…' : 'Create Incident'}
                </button>
              </div>

              <div>
                <label className="label flex items-center gap-1.5">
                  <MapPin size={12} className="text-orange-400" />
                  Click map to set location
                </label>
                <div className="h-[340px] rounded-xl overflow-hidden border border-zinc-700">
                  <MapContainer center={[5.5502, -0.2174]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationPicker onPick={handleMapPick} />
                    {pinPos && <Marker position={[pinPos.lat, pinPos.lng]} icon={pinIcon} />}
                  </MapContainer>
                </div>
                <p className="text-xs text-zinc-600 mt-1.5">Centered on Accra, Ghana · Click anywhere to pin location</p>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select className="input w-auto text-xs py-1.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(INCIDENT_STATUSES).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        {/* Only show type filter for system_admin */}
        {isAdmin && (
          <select className="input w-auto text-xs py-1.5" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="animate-spin text-orange-500" size={24} />
          </div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <AlertTriangle size={32} className="mx-auto mb-3 opacity-30" />
            <p>No incidents found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-zinc-800">
                  {['Type', 'Citizen', 'Location', 'Status', 'Reported', 'Actions'].map(h => (
                    <th key={h} className="pb-3 pr-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {incidents.map((inc) => (
                  <tr key={inc.incident_id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 pr-4">
                      <span className={`${incidentBadgeClass(inc.incident_type)} capitalize text-sm px-3 py-1`}>
                        {getIncidentIcon(inc.incident_type)} {inc.incident_type}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="text-zinc-200 font-semibold text-base">{inc.citizen_name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{inc.citizen_phone}</p>
                    </td>
                    <td className="py-4 pr-4 max-w-[200px]">
                      <p className="text-zinc-400 text-sm truncate">
                        {inc.location_address || `${parseFloat(inc.latitude).toFixed(4)}, ${parseFloat(inc.longitude).toFixed(4)}`}
                      </p>
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`${INCIDENT_STATUSES[inc.status]?.badge || 'badge-zinc'} text-sm px-3 py-1`}>
                        {INCIDENT_STATUSES[inc.status]?.label || inc.status}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-zinc-400 text-sm whitespace-nowrap">{formatRelative(inc.created_at)}</td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        {inc.status === 'created' && (
                          <button onClick={() => handleDispatch(inc.incident_id)}
                            disabled={dispatching === inc.incident_id}
                            className="btn-primary py-1.5 px-3 text-sm">
                            {dispatching === inc.incident_id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Dispatch
                          </button>
                        )}
                        {inc.status === 'dispatched' && (
                          <button onClick={() => handleStatusChange(inc.incident_id, 'in_progress')}
                            className="btn-secondary py-1.5 px-3 text-sm">
                            <Clock size={13} /> In Progress
                          </button>
                        )}
                        {['dispatched', 'in_progress'].includes(inc.status) && (
                          <button onClick={() => handleStatusChange(inc.incident_id, 'resolved')}
                            className="btn-secondary py-1.5 px-3 text-sm text-emerald-400 border-emerald-500/30">
                            <CheckCircle size={13} /> Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
