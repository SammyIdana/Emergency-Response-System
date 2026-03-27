import { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { getResponders, updateResponder } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Flame, MapPin, Plus, Siren, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import AddUnitModal from '../components/ui/AddUnitModal';
import { deleteResponder } from '../lib/api';

export default function FireAdmin() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUnits = () => {
    setLoading(true);
    getResponders({ unit_type: 'fire' })
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
      toast.success("Station status updated");
    } catch (err) {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete(unitId) {
    if (!window.confirm("Remove this fire truck from the fleet?")) return;
    try {
      await deleteResponder(unitId);
      toast.success("Truck removed");
      setUnits(units.filter(u => u.unit_id !== unitId));
    } catch (err) {
      toast.error("Failed to remove truck");
    }
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold text-gradient text-red-500">Fire Service Control</h1>
          <p className="text-zinc-500 text-sm">Manage fire trucks, hydrants, and station availability.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit) => (
            <div key={unit.unit_id} className="card border-red-900/20 bg-red-900/5 group relative">
              <button 
                onClick={() => handleDelete(unit.unit_id)}
                className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-500">
                      <Flame size={24} />
                  </div>
                  <div className={`mr-10 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${unit.is_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {unit.is_available ? 'In Station' : 'On Mission'}
                  </div>
              </div>
              
              <h3 className="font-bold text-zinc-100">{unit.name}</h3>
              <p className="text-xs text-zinc-500 flex items-center gap-1 mb-4">
                  <MapPin size={12} /> {unit.station_name || 'Sector HQ'}
              </p>

              <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Water Capacity</span>
                    <span className="text-zinc-200 font-mono">5,000L / 10,000L</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-1/2"></div>
                  </div>
              </div>

              <button 
                onClick={() => toggleAvailability(unit.unit_id, unit.is_available)}
                className="btn-danger w-full text-xs py-2 shadow-none border-red-500/10"
              >
                  Toggle Station Status
              </button>
            </div>
          ))}

          <button 
            onClick={() => setIsModalOpen(true)}
            className="card border-dashed border-red-900/30 bg-transparent flex flex-col items-center justify-center p-12 text-zinc-500 hover:text-red-500 hover:border-red-500/50 transition-all group"
          >
            <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm tracking-wide text-zinc-500">Add Fire Truck</span>
          </button>
        </div>

        <AddUnitModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            unitType="fire" 
            onUnitAdded={fetchUnits} 
        />
      </div>
    </AppLayout>
  );
}
