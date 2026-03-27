import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { logEvent } from './lib/eventLogger';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

import ProtectedRoute from './components/ui/ProtectedRoute';
import ErrorBoundary from './components/ui/ErrorBoundary';

import { Toaster } from 'react-hot-toast';

import LoginPage      from './pages/Login';
import DashboardPage  from './pages/Dashboard';
import IncidentsPage  from './pages/Incidents';
import TrackingPage   from './pages/Tracking';
import AnalyticsPage  from './pages/Analytics';
import RespondersPage from './pages/Responders';
import DriverMap      from './pages/DriverMap.jsx';
import HospitalAdmin  from './pages/HospitalAdmin.jsx';
import PoliceAdmin    from './pages/PoliceAdmin.jsx';
import FireAdmin      from './pages/FireAdmin.jsx';

function AnalyticsListener() {
  const location = useLocation();
  useEffect(() => {
    logEvent('pageview', { path: location.pathname });
  }, [location]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#18181b', color: '#fff', border: '1px solid #27272a' } }} />
            <AnalyticsListener />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/incidents" element={<ProtectedRoute><IncidentsPage /></ProtectedRoute>} />
              <Route path="/tracking"  element={<ProtectedRoute><TrackingPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
              <Route path="/responders" element={<ProtectedRoute><RespondersPage /></ProtectedRoute>} />
              <Route path="/driver"     element={<ProtectedRoute><DriverMap /></ProtectedRoute>} />
              <Route path="/mgmt/hospital" element={<ProtectedRoute><HospitalAdmin /></ProtectedRoute>} />
              <Route path="/mgmt/police"   element={<ProtectedRoute><PoliceAdmin /></ProtectedRoute>} />
              <Route path="/mgmt/fire"     element={<ProtectedRoute><FireAdmin /></ProtectedRoute>} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
