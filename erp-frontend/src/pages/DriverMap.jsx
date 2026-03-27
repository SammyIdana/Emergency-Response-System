import { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import { updateVehicleLocation, getVehicle } from '../lib/api';
import { Radio, MapPin, Send, Loader2, Play, Square } from 'lucide-react';
import GoogleMapComponent from '../components/ui/GoogleMapComponent';
import { toast } from 'react-hot-toast';

export default function DriverMap() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [location, setLocation] = useState({ lat: 5.6037, lng: -0.1870 });
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt to find the vehicle assigned to this driver
    getVehicle(user.user_id)
      .then(res => setVehicle(res.data.data))
      .catch(() => setVehicle(null)) // Might not be registered yet
      .finally(() => setLoading(false));

    // Get current position
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("Could not get GPS location")
    );
  }, [user.user_id]);

  useEffect(() => {
    let interval;
    if (tracking) {
      interval = setInterval(() => {
        navigator.geolocation.getCurrentPosition((pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(newPos);
          updateVehicleLocation(user.user_id, newPos)
            .catch(err => console.error("Tracking update failed", err));
        });
      }, 5000); // Every 5 seconds
    }
    return () => clearInterval(interval);
  }, [tracking, user.user_id]);

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-gradient">Driver Terminal</h1>
            <p className="text-zinc-500 text-sm">Transmitting live location for {vehicle?.vehicle_id || 'unregistered vehicle'}</p>
          </div>
          <button 
            onClick={() => setTracking(!tracking)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${tracking ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'}`}
          >
            {tracking ? <><Square size={18} /> Stop Transmission</> : <><Play size={18} /> Start Mission</>}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-0 overflow-hidden relative" style={{ height: '500px' }}>
             <GoogleMapComponent 
               center={location}
               zoom={16}
               markers={[{ lat: location.lat, lng: location.lng, title: "Your Location", id: 'curr' }]} 
             />
             {tracking && (
                <div className="absolute top-4 right-4 bg-zinc-950/80 backdrop-blur border border-emerald-500/30 px-3 py-1.5 rounded-full flex items-center gap-2 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live GPS Active</span>
                </div>
             )}
          </div>

          <div className="space-y-6">
            <div className="card">
                <h3 className="label mb-4">Unit Details</h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 text-xl">
                            {user.role === 'ambulance_driver' ? '🚑' : user.role === 'police_driver' ? '🚔' : '🚒'}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-zinc-200">{user.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{user.role.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card border-orange-500/20 bg-orange-500/5">
                <h3 className="label text-orange-400 mb-4">Active Mission</h3>
                {vehicle?.incident_id ? (
                    <div className="space-y-3">
                        <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                            <p className="text-xs text-zinc-500 mb-1">Incident ID</p>
                            <p className="text-sm font-mono text-orange-400">{vehicle.incident_id.slice(0,8)}...</p>
                        </div>
                        <button className="btn-primary w-full">View Incident Details</button>
                    </div>
                ) : (
                    <p className="text-xs text-zinc-500 italic">Standing by for dispatch...</p>
                )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
