import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import AppLayout from '../components/layout/AppLayout';
import StatCard from '../components/ui/StatCard';
import {
  getDashboardSummary, getResponseTimes, getIncidentsByRegion,
  getResourceUtilization, getTopResponders, getIncidentTrends, getHospitalCapacity
} from '../lib/api';
import { Clock, TrendingUp, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { formatDuration } from '../lib/utils';

const COLORS = ['#f97316', '#3b82f6', '#ef4444', '#eab308', '#8b5cf6', '#10b981'];

const TooltipStyle = {
  contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10, color: '#f4f4f5', fontSize: 12 },
  labelStyle: { color: '#a1a1aa' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [respTimes, setRespTimes] = useState([]);
  const [byRegion, setByRegion] = useState([]);
  const [topUnits, setTopUnits] = useState([]);
  const [trends, setTrends] = useState([]);
  const [utilization, setUtil] = useState([]);
  const [hospital, setHospital] = useState([]);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState('day');

  async function load() {
    setLoading(true);
    const results = await Promise.allSettled([
      getDashboardSummary(),
      getResponseTimes(),
      getIncidentsByRegion(),
      getTopResponders(),
      getIncidentTrends({ granularity }),
      getResourceUtilization(),
      getHospitalCapacity(),
    ]);
    if (results[0].status === 'fulfilled') setSummary(results[0].value.data.data);
    if (results[1].status === 'fulfilled') setRespTimes(results[1].value.data.data || []);
    if (results[2].status === 'fulfilled') setByRegion(results[2].value.data.data || []);
    if (results[3].status === 'fulfilled') setTopUnits(results[3].value.data.data || []);
    if (results[4].status === 'fulfilled') setTrends(results[4].value.data.data || []);
    if (results[5].status === 'fulfilled') setUtil(results[5].value.data.data || []);
    if (results[6].status === 'fulfilled') setHospital(results[6].value.data.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [granularity]);

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-60">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </div>
    </AppLayout>
  );

  const respChartData = respTimes.map(r => ({
    name: r.incident_type || r.unit_type || 'Unknown',
    dispatch: Math.round(r.avg_dispatch_time_seconds || 0),
    response: Math.round(r.avg_response_time_seconds || 0),
    resolution: Math.round(r.avg_resolution_time_seconds || 0),
  }));

  const regionPieData = byRegion.slice(0, 8).map(r => ({
    name: r.region || 'Unknown',
    value: parseInt(r.total || r.count || 0),
  }));

  const trendData = trends.map(t => ({
    period: t.period || t.date || t.week || '',
    count: parseInt(t.count || t.total || 0),
  }));

  const topData = topUnits.slice(0, 8).map(u => ({
    name: u.station_name || u.unit_id?.slice(0, 8) || 'Unknown',
    deployments: parseInt(u.total_deployments || u.deployment_count || 0),
  }));

  // Read correct fields from backend response
  const total = summary?.incidents?.total_incidents ?? '—';
  const resolved = summary?.incidents?.resolved ?? '—';
  const avgDispatch = summary?.response_times?.avg_dispatch_time
    ? formatDuration(Math.round(summary.response_times.avg_dispatch_time)) : '—';
  const avgResolution = summary?.response_times?.avg_resolution_time
    ? formatDuration(Math.round(summary.response_times.avg_resolution_time)) : '—';

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-100">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-0.5">30-day performance overview</p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Incidents" value={total} icon={BarChart3} color="orange" />
        <StatCard label="Resolved" value={resolved} icon={TrendingUp} color="green" />
        <StatCard label="Avg Dispatch Time" value={avgDispatch} icon={Clock} color="yellow" />
        <StatCard label="Avg Resolution Time" value={avgResolution} icon={Clock} color="blue" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        {/* Response times */}
        <div className="card xl:col-span-2">
          <h3 className="font-display font-semibold text-zinc-100 mb-4 text-sm">Response Times by Incident Type (seconds)</h3>
          {respChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={respChartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip {...TooltipStyle} formatter={(v) => [`${v}s`]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
                <Bar dataKey="dispatch" fill="#f97316" radius={[4, 4, 0, 0]} name="Dispatch" />
                <Bar dataKey="response" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Response" />
                <Bar dataKey="resolution" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolution" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By region */}
        <div className="card">
          <h3 className="font-display font-semibold text-zinc-100 mb-4 text-sm">Incidents by Region</h3>
          {regionPieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={regionPieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3}>
                  {regionPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#71717a' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Trend */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-zinc-100 text-sm">Incident Volume Trend</h3>
            <div className="flex gap-1">
              {['day', 'week', 'month'].map(g => (
                <button key={g} onClick={() => setGranularity(g)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-all
                    ${granularity === g ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v?.slice(5) || v} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip {...TooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2}
                  dot={{ r: 3, fill: '#f97316' }} activeDot={{ r: 5 }} name="Incidents" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top responders */}
        <div className="card">
          <h3 className="font-display font-semibold text-zinc-100 mb-4 text-sm">Top Deployed Units</h3>
          {topData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topData} layout="vertical" barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120}
                  tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip {...TooltipStyle} />
                <Bar dataKey="deployments" fill="#f97316" radius={[0, 4, 4, 0]} name="Deployments" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Hospital capacity */}
      {hospital.length > 0 && (
        <div className="card">
          <h3 className="font-display font-semibold text-zinc-100 mb-4 text-sm">Hospital Capacity Snapshots</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-zinc-800">
                  {['Hospital', 'Total Beds', 'Available Beds', 'Occupancy', 'Recorded'].map(h => (
                    <th key={h} className="pb-2 pr-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {hospital.slice(0, 10).map((h, i) => {
                  const occ = h.total_beds > 0 ? Math.round(((h.total_beds - h.available_beds) / h.total_beds) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-4 text-zinc-300 font-medium" scope="row">{h.hospital_name}</td>
                      <td className="py-2.5 pr-4 text-zinc-400">{h.total_beds}</td>
                      <td className="py-2.5 pr-4 text-zinc-400">{h.available_beds}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-orange-500" style={{ width: `${occ}%` }} />
                          </div>
                          <span className="text-xs text-zinc-400">{occ}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-zinc-500 text-xs">{new Date(h.snapshotted_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
