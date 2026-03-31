import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createIncident, dispatchIncident, getIncidents, updateIncidentStatus } from '../lib/api';
import AppLayout from '../components/layout/AppLayout';
import { INCIDENT_TYPES, INCIDENT_STATUSES, formatRelative, incidentBadgeClass, getIncidentIcon } from '../lib/utils';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const pinIcon = L.divIcon({
  html: `<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(239,68,68,0.4)"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
});

function LocationPicker({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

const EMPTY = { citizen_name: '', citizen_phone: '', incident_type: 'crime', latitude: '', longitude: '', location_address: '', notes: '' };

const IconSend = <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const IconPlus = <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const IconX = <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IconRefresh = <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const IconCheck = <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const IconPin = <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const IconSpin = <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" /><path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>;

export default function IncidentsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
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

  async function load() {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.incident_type = filterType;
      const res = await getIncidents(params);
      setIncidents(res.data.data?.incidents || res.data.data || []);
    } catch { showToast('Failed to load incidents', 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterStatus, filterType]);

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
      setForm(EMPTY); setPinPos(null); setShowForm(false);
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed to create incident', 'error'); }
    setSubmitting(false);
  }

  async function handleDispatch(id) {
    setDispatching(id);
    try {
      await dispatchIncident(id);
      showToast('Dispatched nearest responder');
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Dispatch failed — no available responders?', 'error'); }
    setDispatching(null);
  }

  async function handleStatusChange(id, status) {
    try {
      await updateIncidentStatus(id, status);
      showToast(`Status updated to ${status}`);
      load();
    } catch (err) { showToast('Update failed', 'error'); }
  }

  return (
    <AppLayout>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          color: toast.type === 'error' ? '#f87171' : '#4ade80',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Incidents</h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>{incidents.length} total records</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} className="btn-secondary">{IconRefresh}</button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary">
            {showForm ? IconX : IconPlus}
            {showForm ? 'Cancel' : 'New Incident'}
          </button>
        </div>
      </div>

      {/* New Incident Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 28, borderColor: 'rgba(239,68,68,0.2)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 20 }}>Report New Incident</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  <select className="input" value={form.incident_type} onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))}>
                    {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">Latitude *</label>
                    <input className="input" required placeholder="5.5502" value={form.latitude}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                  </div>
                  <div>
                    <label className="label">Longitude *</label>
                    <input className="input" required placeholder="-0.2174" value={form.longitude}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                  </div>
                </div>
                <div>
                  <label className="label">Address</label>
                  <input className="input" placeholder="Makola Market, Accra"
                    value={form.location_address} onChange={e => setForm(f => ({ ...f, location_address: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea className="input" placeholder="Describe the incident..." style={{ minHeight: 72, resize: 'none' }}
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '11px 20px' }}>
                  {submitting ? IconSpin : IconSend}
                  {submitting ? 'Creating…' : 'Create Incident'}
                </button>
              </div>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {IconPin} Click map to pin location
                </label>
                <div style={{ height: 360, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <MapContainer center={[5.5502, -0.2174]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationPicker onPick={handleMapPick} />
                    {pinPos && <Marker position={[pinPos.lat, pinPos.lng]} icon={pinIcon} />}
                  </MapContainer>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Centered on Accra, Ghana</p>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="var(--text-3)" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        <select className="input" style={{ width: 'auto', fontSize: 13 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(INCIDENT_STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select className="input" style={{ width: 'auto', fontSize: 13 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
            {IconSpin}
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚨</div>
            <p style={{ fontSize: 15 }}>No incidents found</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                {['Type', 'Citizen', 'Location', 'Status', 'Reported', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '16px 20px', textAlign: 'left',
                    fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={inc.incident_id}
                  style={{ borderBottom: i < incidents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                  {/* Type */}
                  <td style={{ padding: '18px 20px' }}>
                    <span className={`badge ${incidentBadgeClass(inc.incident_type)}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                      {getIncidentIcon(inc.incident_type)} {inc.incident_type}
                    </span>
                  </td>

                  {/* Citizen */}
                  <td style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{inc.citizen_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{inc.citizen_phone}</div>
                  </td>

                  {/* Location */}
                  <td style={{ padding: '18px 20px', maxWidth: 200 }}>
                    <div style={{ fontSize: 14, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.location_address || `${parseFloat(inc.latitude).toFixed(4)}, ${parseFloat(inc.longitude).toFixed(4)}`}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '18px 20px' }}>
                    <span className={`badge ${INCIDENT_STATUSES[inc.status]?.badge || 'badge-zinc'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                      {INCIDENT_STATUSES[inc.status]?.label || inc.status}
                    </span>
                  </td>

                  {/* Reported */}
                  <td style={{ padding: '18px 20px', fontSize: 14, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {formatRelative(inc.created_at)}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {inc.status === 'created' && (
                        <button onClick={() => handleDispatch(inc.incident_id)}
                          disabled={dispatching === inc.incident_id}
                          className="btn-primary" style={{ padding: '7px 14px', fontSize: 13 }}>
                          {dispatching === inc.incident_id ? IconSpin : IconSend}
                          Dispatch
                        </button>
                      )}
                      {inc.status === 'dispatched' && (
                        <button onClick={() => handleStatusChange(inc.incident_id, 'in_progress')}
                          className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13 }}>
                          In Progress
                        </button>
                      )}
                      {['dispatched', 'in_progress'].includes(inc.status) && (
                        <button onClick={() => handleStatusChange(inc.incident_id, 'resolved')}
                          className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13, color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)' }}>
                          {IconCheck} Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
