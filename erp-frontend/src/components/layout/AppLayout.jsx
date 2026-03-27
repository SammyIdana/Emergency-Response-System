import Sidebar from './Sidebar';
import NotificationDrawer from '../ui/NotificationDrawer';
import DarkModeToggle from '../ui/DarkModeToggle';
import { User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout({ children }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[240px] min-h-screen" role="main" aria-label="Main content">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-4 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Emergency Response Platform
            </span>
          </div>
          <div className="flex items-center gap-4">
            <DarkModeToggle />
            <NotificationDrawer />
            <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
              <div className="text-right">
                <p className="text-xs font-bold text-zinc-100">{user?.name}</p>
                <p className="text-[10px] text-zinc-500 font-medium capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <User size={16} />
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-[1400px] mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
