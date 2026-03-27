import axios from 'axios';

const AUTH_URL     = import.meta.env.VITE_AUTH_URL     || 'http://localhost:3001';
const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || 'http://localhost:3002';
const TRACKING_URL = import.meta.env.VITE_TRACKING_URL || 'http://localhost:3003';
const ANALYTICS_URL= import.meta.env.VITE_ANALYTICS_URL|| 'http://localhost:3004';

function makeClient(baseURL) {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401) {
        localStorage.clear();
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }
  );

  return client;
}

export const authApi      = makeClient(AUTH_URL);
export const incidentApi  = makeClient(INCIDENT_URL);
export const trackingApi  = makeClient(TRACKING_URL);
export const analyticsApi = makeClient(ANALYTICS_URL);

// ── Auth ──────────────────────────────────────────────────────────
export const login    = (data) => authApi.post('/auth/login', data);
export const register = (data) => authApi.post('/auth/register', data);
export const getProfile = ()   => authApi.get('/auth/profile');
export const getUsers   = ()   => authApi.get('/auth/users');
export const deactivateUser = (id) => authApi.put(`/auth/users/${id}/deactivate`);

// ── Incidents ─────────────────────────────────────────────────────
export const getIncidents     = (params) => incidentApi.get('/incidents', { params });
export const getOpenIncidents = ()       => incidentApi.get('/incidents/open');
export const getIncident      = (id)     => incidentApi.get(`/incidents/${id}`);
export const createIncident   = (data)   => incidentApi.post('/incidents', data);
export const updateIncidentStatus = (id, status) => incidentApi.put(`/incidents/${id}/status`, { status });
export const dispatchIncident = (id)     => incidentApi.post(`/incidents/${id}/dispatch`);
export const assignResponder  = (id, unit_id) => incidentApi.put(`/incidents/${id}/assign`, { unit_id });

// ── Responders ────────────────────────────────────────────────────
export const getResponders  = (params) => incidentApi.get('/responders', { params });
export const createResponder= (data)   => incidentApi.post('/responders', data);
export const updateResponder= (id, data) => incidentApi.put(`/responders/${id}`, data);
export const deleteResponder= (id)       => incidentApi.delete(`/responders/${id}`);
export const getNearestResponders = (params) => incidentApi.get('/responders/nearest', { params });

// ── Tracking ──────────────────────────────────────────────────────
export const getVehicles      = (params) => trackingApi.get('/vehicles', { params });
export const getVehicle       = (id)     => trackingApi.get(`/vehicles/${id}`);
export const registerVehicle  = (data)   => trackingApi.post('/vehicles/register', data);
export const getVehicleLocation  = (id)  => trackingApi.get(`/vehicles/${id}/location`);
export const updateVehicleLocation = (id, data) => trackingApi.post(`/vehicles/${id}/location`, data);
export const updateVehicleStatus   = (id, status) => trackingApi.put(`/vehicles/${id}/status`, { status });
export const getVehicleHistory     = (id, params) => trackingApi.get(`/vehicles/${id}/history`, { params });
export const getVehicleForIncident = (incidentId) => trackingApi.get(`/incidents/${incidentId}/vehicle`);

// ── Analytics ─────────────────────────────────────────────────────
export const getDashboardSummary  = ()       => analyticsApi.get('/analytics/dashboard-summary');
export const getResponseTimes     = (params) => analyticsApi.get('/analytics/response-times', { params });
export const getIncidentsByRegion = ()       => analyticsApi.get('/analytics/incidents-by-region');
export const getResourceUtilization = ()     => analyticsApi.get('/analytics/resource-utilization');
export const getHospitalCapacity  = ()       => analyticsApi.get('/analytics/hospital-capacity');
export const getTopResponders     = ()       => analyticsApi.get('/analytics/top-responders');
export const getIncidentTrends    = (params) => analyticsApi.get('/analytics/incident-trends', { params });

export const TRACKING_WS_URL = import.meta.env.VITE_TRACKING_URL || 'http://localhost:3003';
