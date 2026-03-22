export default function StatCard({ label, value, sub, icon: Icon, color = 'orange', trend }) {
  const colors = {
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    blue:   'text-blue-400   bg-blue-500/10   border-blue-500/20',
    green:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red:    'text-red-400    bg-red-500/10    border-red-500/20',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  };

  return (
    <div className="card flex items-start gap-4">
      {Icon && (
        <div className={`p-2.5 rounded-lg border ${colors[color]}`}>
          <Icon size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display font-bold text-zinc-100 mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
