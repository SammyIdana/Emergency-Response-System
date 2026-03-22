import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { getDashboardSummary, getOpenIncidents } from '../lib/api';
import { formatDuration, formatRelative, INCIDENT_STATUSES, incidentBadgeClass, getIncidentIcon } from '../lib/utils';
import { AlertTriangle, Clock, CheckCircle, TrendingUp, RefreshCw, Activity } from 'lucide-react';

function StatCard({ label, value, sub, icon: Icon, color = 'orange' }) {
  const colors = {
    orange: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#fb923c' },
    red: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
    green: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', text: '#4ade80' },
    yellow: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', text: '#facc15' },
    blue: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: '#60a5fa' },
  };
  const c = colors[color] || colors.orange;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        {Icon && (
          <div style={{ padding: 8, borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 38, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4 }}>
        {value ?? '—'}
      </div>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  );
}

const TYPE_COLORS = { medical: '#60a5fa', fire: '#f87171', crime: '#fb923c', accident: '#facc15', flood: '#a78bfa', other: '#6b7280' };

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [openInc, setOpenInc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [s, i] = await Promise.allSettled([getDashboardSummary(), getOpenIncidents()]);
      if (s.status === 'fulfilled') setSummary(s.value.data.data);
      if (i.status === 'fulfilled') setOpenInc(i.value.data.data?.incidents || i.value.data.data || []);
    } catch { }
    setLoading(false); setRefreshing(false);
  }

  useEffect(() => { load(); const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, []);

  const total = summary?.incidents?.total_incidents ?? 0;
  const resolved = summary?.incidents?.resolved ?? 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const avgDispatch = summary?.response_times?.avg_dispatch_time
    ? formatDuration(Math.round(summary.response_times.avg_dispatch_time)) : '—';
  const avgResolution = summary?.response_times?.avg_resolution_time
    ? formatDuration(Math.round(summary.response_times.avg_resolution_time)) : '—';

  return (
    <AppLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.12em', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 28, color: 'var(--text-1)', letterSpacing: '0.04em' }}>
            COMMAND OVERVIEW
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {openInc.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#f87171' }}>{openInc.length} ACTIVE</span>
            </div>
          )}
          <button onClick={() => load(true)} className="btn-ghost">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Incidents" value={total} icon={AlertTriangle} color="red" sub="Last 30 days" />
            <StatCard label="Active Now" value={openInc.length} icon={Activity} color="orange" sub="Pending resolution" />
            <StatCard label="Avg Dispatch" value={avgDispatch} icon={Clock} color="yellow" sub="Response speed" />
            <StatCard label="Resolved" value={resolved} icon={CheckCircle} color="green" sub={`${resolutionRate}% resolution rate`} />
          </div>

          {summary?.incidents_by_type && Object.keys(summary.incidents_by_type).length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 16 }}>INCIDENT BREAKDOWN</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(summary.incidents_by_type).map(([type, count]) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  const col = TYPE_COLORS[type] || '#6b7280';
                  return (
                    <div key={type} style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'capitalize' }}>{type}</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: col }}>{count}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {openInc.length > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />}
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: '0.05em', color: 'var(--text-1)' }}>ACTIVE INCIDENTS</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-3)' }}>({openInc.length})</span>
              </div>
              <Link to="/incidents" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#f87171', textDecoration: 'none' }}>VIEW ALL →</Link>
            </div>

            {openInc.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
                <CheckCircle size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>NO ACTIVE INCIDENTS</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['TYPE', 'CITIZEN', 'LOCATION', 'STATUS', 'AGE'].map(h => (
                      <th key={h} style={{ padding: '0 12px 10px 0', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openInc.slice(0, 8).map((inc) => (
                    <tr key={inc.incident_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '12px 12px 12px 0' }}>
                        <span className={incidentBadgeClass(inc.incident_type)} style={{ textTransform: 'capitalize' }}>
                          {getIncidentIcon(inc.incident_type)} {inc.incident_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px 12px 0', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{inc.citizen_name || '—'}</td>
                      <td style={{ padding: '12px 12px 12px 0', fontSize: 12, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inc.location_address || `${parseFloat(inc.latitude)?.toFixed(3)}, ${parseFloat(inc.longitude)?.toFixed(3)}`}
                      </td>
                      <td style={{ padding: '12px 12px 12px 0' }}>
                        <span className={INCIDENT_STATUSES[inc.status]?.badge || 'badge-zinc'}>
                          {INCIDENT_STATUSES[inc.status]?.label || inc.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>{formatRelative(inc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
