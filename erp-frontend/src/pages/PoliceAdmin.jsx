import { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { getResponders, updateResponder } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Users, Shield, Plus, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import AddUnitModal from '../components/ui/AddUnitModal';
import { deleteResponder } from '../lib/api';

export default function PoliceAdmin() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUnits = () => {
    setLoading(true);
    getResponders({ unit_type: 'police' })
      .then(res => setUnits(res.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  async function toggleAvailability(unitId, current) {
    try {
      await updateResponder(unitId, { is_available: !current });
      setUnits(units.map(u => u.unit_id === unitId ? { ...u, is_available: !current } : u));
      toast.success("Status updated");
    } catch (err) {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete(unitId) {
    if (!window.confirm("Delete this patrol unit?")) return;
    try {
      await deleteResponder(unitId);
      toast.success("Unit removed");
      setUnits(units.filter(u => u.unit_id !== unitId));
    } catch (err) {
      toast.error("Failed to remove unit");
    }
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold text-gradient">Police Service Admin</h1>
          <p className="text-zinc-500 text-sm">Manage police units, stations, and officer assignments.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit) => (
            <div key={unit.unit_id} className="card group relative">
              <button 
                onClick={() => handleDelete(unit.unit_id)}
                className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                      <Shield size={24} />
                  </div>
                  <div className={`mr-10 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${unit.is_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {unit.is_available ? 'Ready' : 'Dispatched'}
                  </div>
              </div>
              
              <h3 className="font-bold text-zinc-100">{unit.name}</h3>
              <p className="text-xs text-zinc-500 flex items-center gap-1 mb-4">
                  <MapPin size={12} /> {unit.station_name || 'Central Command'}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Officers</p>
                    <p className="text-lg font-display text-zinc-100">4</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Patrols</p>
                    <p className="text-lg font-display text-zinc-100">12</p>
                  </div>
              </div>

              <button 
                onClick={() => toggleAvailability(unit.unit_id, unit.is_available)}
                className="btn-secondary w-full text-xs py-2"
              >
                  Update Unit Status
              </button>
            </div>
          ))}

          <button 
            onClick={() => setIsModalOpen(true)}
            className="card border-dashed border-zinc-700 bg-transparent flex flex-col items-center justify-center p-12 text-zinc-500 hover:text-blue-400 hover:border-blue-500/50 transition-all group"
          >
            <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm tracking-wide">Register Patrol Unit</span>
          </button>
        </div>

        <AddUnitModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            unitType="police" 
            onUnitAdded={fetchUnits} 
        />
      </div>
    </AppLayout>
  );
}
