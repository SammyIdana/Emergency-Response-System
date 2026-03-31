import { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { getResponders, updateResponder } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Save, Bed, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import AddUnitModal from '../components/ui/AddUnitModal';
import { deleteResponder, deleteVehicle } from '../lib/api';

export default function HospitalAdmin() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUnits = () => {
    setLoading(true);
    getResponders({ unit_type: 'ambulance' })
      .then(res => setUnits(res.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  async function handleUpdate(unitId, data) {
    setSaving(true);
    try {
      await updateResponder(unitId, data);
      toast.success("Capacity updated");
      setUnits(units.map(u => u.unit_id === unitId ? { ...u, ...data } : u));
    } catch (err) {
      toast.error("Failed to update capacity");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(unitId) {
    if (!window.confirm("Are you sure you want to delete this unit? This will also remove it from live tracking.")) return;
    try {
      await deleteResponder(unitId);
      try { await deleteVehicle(unitId); } catch (e) { console.error("Map delete sync failed", e); }
      toast.success("Unit deleted");
      setUnits(units.filter(u => u.unit_id !== unitId));
    } catch (err) {
      toast.error("Failed to delete unit");
    }
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold text-gradient">Hospital Administration</h1>
          <p className="text-zinc-500 text-sm">Manage emergency capacity and ambulance units for your facility.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit) => (
            <div key={unit.unit_id} className="card group relative">
              <button 
                onClick={() => handleDelete(unit.unit_id)}
                className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                title="Delete Unit"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-bold text-zinc-100">{unit.name}</h3>
                    <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Unit ID: {unit.unit_id.slice(0,8)}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full mr-12 ${unit.is_available ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}></div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Bed Capacity</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <p className="text-xs text-zinc-500 mb-1">Available</p>
                        <input 
                            type="number" 
                            className="input" 
                            defaultValue={unit.available_beds}
                            onBlur={(e) => handleUpdate(unit.unit_id, { available_beds: parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-zinc-500 mb-1">Total</p>
                        <input 
                            type="number" 
                            className="input opacity-50" 
                            defaultValue={unit.total_beds} 
                            disabled 
                        />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                    <button 
                        onClick={() => handleUpdate(unit.unit_id, { is_available: !unit.is_available })}
                        className={`w-full py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${unit.is_available ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/30'}`}
                    >
                        {unit.is_available ? 'Mark Unavailable' : 'Mark Available'}
                    </button>
                </div>
              </div>
            </div>
          ))}

          <button 
            onClick={() => setIsModalOpen(true)}
            className="card border-dashed border-zinc-700 bg-transparent flex flex-col items-center justify-center p-12 text-zinc-500 hover:text-orange-400 hover:border-orange-500/50 transition-all group lg:min-h-[300px]"
          >
            <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm tracking-wide">Add New Unit</span>
          </button>
        </div>

        <AddUnitModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            unitType="ambulance" 
            onUnitAdded={fetchUnits} 
        />
      </div>
    </AppLayout>
  );
}
