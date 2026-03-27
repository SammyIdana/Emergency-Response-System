import { useEffect, useState } from 'react';

const SERVICES = [
  { name: 'Auth', url: import.meta.env.VITE_AUTH_URL || 'http://localhost:3001' },
  { name: 'Incident', url: import.meta.env.VITE_INCIDENT_URL || 'http://localhost:3002' },
  { name: 'Tracking', url: import.meta.env.VITE_TRACKING_URL || 'http://localhost:3003' },
  { name: 'Analytics', url: import.meta.env.VITE_ANALYTICS_URL || 'http://localhost:3004' },
];

function getStatusColor(status) {
  if (status === 'healthy') return '#4ade80'; // green
  if (status === 'degraded') return '#facc15'; // yellow
  return '#f87171'; // red
}

export default function ServiceHealthWidget() {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  async function checkHealth() {
    setLoading(true);
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const res = await fetch(`${svc.url}/health`);
          const data = await res.json();
          return { name: svc.name, status: data.status, ts: data.timestamp };
        } catch {
          return { name: svc.name, status: 'down', ts: null };
        }
      })
    );
    const map = {};
    results.forEach((r) => { map[r.name] = r; });
    setStatuses(map);
    setLoading(false);
  }

  useEffect(() => {
    checkHealth();
    const t = setInterval(checkHealth, 20000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>Service Health</div>
      <div style={{ display: 'flex', gap: 18 }}>
        {SERVICES.map((svc) => {
          const s = statuses[svc.name];
          return (
            <div key={svc.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: getStatusColor(s?.status), display: 'inline-block' }} />
              <span style={{ fontSize: 13 }}>{svc.name}</span>
              <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{s?.status === 'healthy' ? 'OK' : (s?.status || 'down')}</span>
            </div>
          );
        })}
      </div>
      {loading && <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Checking...</div>}
    </div>
  );
}
