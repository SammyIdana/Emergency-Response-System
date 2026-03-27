import { useState, useRef, useEffect } from 'react';
import { Bell, X, Info, AlertTriangle, CheckCircle2, Send, Trash2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { formatRelative } from '../../lib/utils';

export default function NotificationDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const drawerRef = useRef(null);

  // Close drawer when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case 'incident': return <AlertTriangle className="text-red-500" size={18} />;
      case 'dispatch': return <Send className="text-orange-500" size={18} />;
      case 'resolution': return <CheckCircle2 className="text-emerald-500" size={18} />;
      default: return <Info className="text-blue-500" size={18} />;
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button 
        onClick={() => { setIsOpen(!isOpen); markAllRead(); }}
        className="relative p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all group"
      >
        <Bell size={20} className={unreadCount > 0 ? 'animate-bounce' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-zinc-950 shadow-lg shadow-orange-500/20">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {isOpen && (
        <div 
          ref={drawerRef}
          className="absolute right-0 mt-4 w-96 max-h-[600px] overflow-hidden bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl z-50 flex flex-col animate-in slide-in-from-top-4 duration-200"
        >
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <h3 className="font-display font-bold text-lg text-zinc-100 flex items-center gap-2">
              Notifications
              {notifications.length > 0 && <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500">{notifications.length}</span>}
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={clearAll}
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Clear All"
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-zinc-800/50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                  <Bell className="text-zinc-600" size={24} />
                </div>
                <p className="text-zinc-400 font-medium">No notifications yet</p>
                <p className="text-zinc-600 text-xs mt-1">Real-time alerts will appear here</p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <div key={n.id || i} className="p-4 hover:bg-white/[0.02] transition-colors group">
                  <div className="flex gap-4">
                    <div className="mt-1 flex-shrink-0">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <p className="text-sm font-bold text-zinc-200">{n.title}</p>
                        <span className="text-[10px] text-zinc-600 whitespace-nowrap">
                          {formatRelative(new Date(n.timestamp))}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-medium">{n.message}</p>
                      {n.severity === 'high' && (
                        <div className="mt-2 text-[9px] font-bold text-red-400/80 bg-red-500/5 border border-red-500/10 px-1.5 py-0.5 rounded inline-block uppercase tracking-wider">
                          Critical Priority
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 text-center">
              <button onClick={() => setIsOpen(false)} className="text-[11px] font-bold text-orange-500 uppercase tracking-widest hover:text-orange-400 transition-colors">
                Close Panel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
