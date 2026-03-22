import { useState, useEffect } from 'react';
import { getResponders, createResponder, updateResponder } from '../lib/api';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import { Shield, Plus, X, Loader2, RefreshCw, CheckCircle, XCircle, Edit2, Save } from 'lucide-react';
import { RESPONDER_TYPES } from '../lib/utils';

const EMPTY_FORM = {
  unit_type: 'police', name: '', latitude: '', longitude: '',
  hospital_name: '', available_beds: '', total_beds: '',
};

// Role → allowed responder types
const ROLE_RESPONDER_TYPES = {
  hospital_admin: ['ambulance'],
  police_admin: ['police'],
  fire_admin: ['fire'],
  system_admin: null, // all
};

export default function RespondersPage() {
  const { user, isAdmin } = useAuth();
  const allowedTypes = ROLE_RESPONDER_TYPES[user?.role] || null;

  const roleLabel = {
    hospital_admin: '🏥 Hospital Admin — Ambulance units only',
    police_admin: '🚔 Police Admin — Police units only',
    fire_admin: '🚒 Fire Admin — Fire units only',
    system_admin: null,
  }[user?.role];

  const [responders, setResponders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, unit_type: allowedTypes?.[0] || 'police' });
  const [submitting, setSubmitting] = useState(false);
  const [filterAvail, setFilterAvail] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filterAvail) params.is_available = filterAvail;
      if (allowedTypes) params.unit_type = allowedTypes[0];
      const res = await getResponders(params);
      let data = res.data.data?.units || res.data.data || [];
      if (allowedTypes) data = data.filter(r => allowedTypes.includes(r.unit_type));
      setResponders(data);
    } catch { showToast('Failed to load responders', 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterAvail]);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        unit_type: form.unit_type,
        name: form.name,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      };
      if (form.unit_type === 'ambulance') {
        if (form.hospital_name) body.hospital_name = form.hospital_name;
        if (form.available_beds) body.available_beds = parseInt(form.available_beds);
        if (form.total_beds) body.total_beds = parseInt(form.total_beds);
      }
      await createResponder(body);
      showToast('Responder registered');
      setForm({ ...EMPTY_FORM, unit_type: allowedTypes?.[0] || 'police' });
      setShowForm(false); load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    setSubmitting(false);
  }

  async function handleUpdate(id) {
    try { await updateResponder(id, editData); showToast('Updated'); setEditId(null); setEditData({}); load(); }
    catch { showToast('Update failed', 'error'); }
  }

  async function toggleAvailability(r) {
    try { await updateResponder(r.unit_id, { is_available: !r.is_available }); showToast(`Marked as ${!r.is_available ? 'available' : 'unavailable'}`); load(); }
    catch { showToast('Update failed', 'error'); }
  }

  const availCount = responders.filter(r => r.is_available).length;
  const availableTypes = allowedTypes
    ? RESPONDER_TYPES.filter(t => allowedTypes.includes(t.value))
    : RESPONDER_TYPES;

  return (
    <AppLayout>
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl border text-sm font-medium shadow-xl
          ${toast.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-100">Responders</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {roleLabel || `${responders.length} units · ${availCount} available`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Register Unit'}
          </button>
        </div>
      </div>

      {/* Register form */}
      {showForm && (
        <div className="card mb-6 border-orange-500/20">
          <h2 className="font-display font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Shield size={16} className="text-orange-400" /> Register Responder Unit
          </h2>
          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="label">Unit Type *</label>
                <select className="input" value={form.unit_type}
                  onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}
                  disabled={availableTypes.length === 1}>
                  {availableTypes.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Station / Unit Name *</label>
                <input className="input" required placeholder="Accra Central Police"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
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
              {form.unit_type === 'ambulance' && (
                <>
                  <div>
                    <label className="label">Hospital Name</label>
                    <input className="input" placeholder="Korle Bu Teaching Hospital"
                      value={form.hospital_name} onChange={e => setForm(f => ({ ...f, hospital_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Total Beds</label>
                    <input className="input" type="number" placeholder="20"
                      value={form.total_beds} onChange={e => setForm(f => ({ ...f, total_beds: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Available Beds</label>
                    <input className="input" type="number" placeholder="10"
                      value={form.available_beds} onChange={e => setForm(f => ({ ...f, available_beds: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <button type="submit" disabled={submitting} className="btn-primary mt-4">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {submitting ? 'Registering…' : 'Register Unit'}
            </button>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select className="input w-auto text-xs py-1.5" value={filterAvail} onChange={e => setFilterAvail(e.target.value)}>
          <option value="">All Availability</option>
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {availableTypes.map(t => {
          const units = responders.filter(r => r.unit_type === t.value);
          const avail = units.filter(r => r.is_available).length;
          return (
            <div key={t.value} className="card flex items-center gap-3 py-3">
              <span className="text-2xl">{t.icon}</span>
              <div>
                <p className="text-lg font-display font-bold text-zinc-100">{units.length}</p>
                <p className="text-xs text-zinc-500">{t.label} · {avail} available</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-orange-500" size={24} /></div>
        ) : responders.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <Shield size={32} className="mx-auto mb-3 opacity-30" />
            <p>No responder units found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-zinc-800">
                  {['Unit', 'Type', 'Location', 'Capacity', 'Status', 'Actions'].map(h => (
                    <th key={h} className="pb-2.5 pr-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {responders.map(r => {
                  const typeInfo = RESPONDER_TYPES.find(t => t.value === r.unit_type);
                  const isEditing = editId === r.unit_id;
                  return (
                    <tr key={r.unit_id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 pr-4">
                        <p className="text-zinc-200 font-medium">{r.name}</p>
                        <p className="text-[10px] text-zinc-600 font-mono">{r.unit_id?.slice(0, 12)}…</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="badge badge-zinc capitalize">{typeInfo?.icon} {r.unit_type}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input className="input py-1 px-2 text-xs w-20 font-mono" placeholder="Lat"
                              defaultValue={r.latitude} onChange={e => setEditData(d => ({ ...d, latitude: parseFloat(e.target.value) }))} />
                            <input className="input py-1 px-2 text-xs w-20 font-mono" placeholder="Lng"
                              defaultValue={r.longitude} onChange={e => setEditData(d => ({ ...d, longitude: parseFloat(e.target.value) }))} />
                          </div>
                        ) : (
                          <p className="text-zinc-500 text-xs font-mono">{parseFloat(r.latitude).toFixed(4)}, {parseFloat(r.longitude).toFixed(4)}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {r.unit_type === 'ambulance' ? (
                          <div>
                            <p className="text-xs text-zinc-300">{r.available_beds ?? '—'} / {r.total_beds ?? '—'} beds</p>
                            {r.hospital_name && <p className="text-[10px] text-zinc-600">{r.hospital_name}</p>}
                          </div>
                        ) : <span className="text-zinc-600 text-xs">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={r.is_available ? 'badge-green' : 'badge-red'}>
                          {r.is_available ? <><CheckCircle size={10} /> Available</> : <><XCircle size={10} /> Busy</>}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditing ? (
                            <>
                              <button onClick={() => handleUpdate(r.unit_id)} className="btn-primary py-1 px-2.5 text-xs"><Save size={12} /> Save</button>
                              <button onClick={() => { setEditId(null); setEditData({}); }} className="btn-secondary py-1 px-2.5 text-xs"><X size={12} /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditId(r.unit_id); setEditData({}); }} className="btn-secondary py-1 px-2.5 text-xs"><Edit2 size={12} /> Edit</button>
                              <button onClick={() => toggleAvailability(r)}
                                className={`py-1 px-2.5 text-xs rounded-lg border font-medium transition-all flex items-center gap-1
                                  ${r.is_available ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'}`}>
                                {r.is_available ? <XCircle size={12} /> : <CheckCircle size={12} />}
                                {r.is_available ? 'Set Busy' : 'Set Available'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
