import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, getProfile } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      getProfile()
        .then((r) => setUser(r.data.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email, password) {
    const res = await apiLogin({ email, password });
    const { access_token, refresh_token, user: u } = res.data.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setUser(u);
    return u;
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  const isAdmin    = user?.role === 'system_admin';
  const isHospital = user?.role === 'hospital_admin';
  const isPolice   = user?.role === 'police_admin';
  const isFire     = user?.role === 'fire_admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isHospital, isPolice, isFire }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
