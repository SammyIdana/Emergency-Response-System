import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) return;

    const TRACKING_URL = import.meta.env.VITE_TRACKING_URL || 'http://localhost:3003';
    const token = localStorage.getItem('access_token');

    const newSocket = io(TRACKING_URL, {
      path: '/tracking',
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Notification socket connected');
    });

    newSocket.on('new_notification', (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);
      
      // Also show a temporary in-app toast for immediate visibility
      toast(notif.message, {
        icon: notif.type === 'incident' ? '🚨' : '✅',
        style: {
          borderRadius: '12px',
          background: '#18181b',
          color: '#fff',
          border: '1px solid #27272a'
        },
      });
    });

    // Also listen to direct dispatch events
    newSocket.on('dispatch_created', (payload) => {
      const notif = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'dispatch',
        title: 'Unit Dispatched',
        message: `Unit ${payload.unit_type} dispatched to incident #${payload.incident_id.slice(0,8)}`,
        timestamp: new Date().toISOString(),
        severity: 'medium'
      };
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, [user]);

  const markAllRead = () => {
    setUnreadCount(0);
  };

  const clearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
