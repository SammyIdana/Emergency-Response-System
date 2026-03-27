import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle, MapPin, BarChart3,
  Users, Shield, LogOut, Radio, Siren
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/tracking', icon: MapPin, label: 'Live Tracking' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/responders', icon: Shield, label: 'Responders' },
  { to: '/driver', icon: Radio, label: 'Driver Terminal', roles: ['ambulance_driver', 'police_driver', 'fire_driver'] },
  { to: '/mgmt/hospital', icon: Siren, label: 'Hospital Management', roles: ['hospital_admin'] },
  { to: '/mgmt/police', icon: Shield, label: 'Police Management', roles: ['police_admin'] },
  { to: '/mgmt/fire', icon: Siren, label: 'Fire Management', roles: ['fire_admin'] },
];

export default function Sidebar() {
  const { user, logout, isAdmin, isHospital } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-[240px] bg-zinc-900/80 backdrop-blur border-r border-zinc-800 flex flex-col z-40" role="navigation" aria-label="Sidebar navigation">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <Siren size={16} className="text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-zinc-100 leading-tight">GH Emergency</p>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Response Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
        {navItems
          .filter(item => {
            if (user?.role === 'system_admin') return !['/driver'].includes(item.to); // Admin doesn't need driver terminal
            if (item.roles && !item.roles.includes(user?.role)) return false;

            // Drivers only see Driver Terminal
            if (['ambulance_driver', 'police_driver', 'fire_driver'].includes(user?.role)) {
              return item.to === '/driver' || item.to === '/dashboard';
            }

            // Normal Admins see their mgmt and core pages
            if (item.to === '/analytics' && !isAdmin) return false;
            if (item.to === '/responders' && !isAdmin) return false;

            return true;
          })
          .map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              aria-label={label}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 border-t border-zinc-800 pt-3">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-semibold text-zinc-200 truncate">{user?.name}</p>
          <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
          <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/25 font-mono uppercase tracking-wider">
            {user?.role?.replace('_', ' ')}
          </span>
        </div>
        <button onClick={handleLogout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10" aria-label="Sign out">
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
