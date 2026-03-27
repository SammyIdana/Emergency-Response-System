import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { createResponder } from '../../lib/api';
import { toast } from 'react-hot-toast';
import LocationSearch from './LocationSearch';

export default function AddUnitModal({ isOpen, onClose, unitType, onUnitAdded }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    station_name: '',
    latitude: 5.6037,
    longitude: -0.1870,
    total_beds: 10,
    available_beds: 10
  });

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, unit_type: unitType };
      // Backend handles cross-service vehicle registration
      await createResponder(payload);
      toast.success(`${unitType} unit registered successfully`);
      onUnitAdded();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to register unit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
      <div className="card w-full max-w-md border-orange-500/20 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-zinc-100 capitalize">Register {unitType}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Unit Name *</label>
            <input 
              className="input" 
              placeholder={unitType === 'ambulance' ? 'St. John Ambulance A1' : 'Sector 4 Patrol'} 
              required
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
            />
          </div>

          <div>
            <label className="label">Station / Facility Name</label>
            <input 
              className="input" 
              placeholder="Central Station"
              value={form.station_name}
              onChange={e => setForm({...form, station_name: e.target.value})}
            />
          </div>

          <div>
            <label className="label text-zinc-400">Search Base Location (Ghana) *</label>
            <LocationSearch 
              onSelect={({ lat, lng, address }) => {
                setForm(f => ({ ...f, latitude: lat, longitude: lng, station_name: f.station_name || address }));
              }} 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label opacity-50 text-[10px] uppercase">Latitude</label>
              <input 
                type="number" step="any" className="input bg-zinc-900/50" 
                value={form.latitude}
                onChange={e => setForm({...form, latitude: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="label opacity-50 text-[10px] uppercase">Longitude</label>
              <input 
                type="number" step="any" className="input bg-zinc-900/50" 
                value={form.longitude}
                onChange={e => setForm({...form, longitude: parseFloat(e.target.value)})}
              />
            </div>
          </div>

          {unitType === 'ambulance' && (
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="label">Total Beds</label>
                    <input 
                        type="number" className="input" 
                        value={form.total_beds}
                        onChange={e => setForm({...form, total_beds: parseInt(e.target.value), available_beds: parseInt(e.target.value)})}
                    />
                </div>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Save Unit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
