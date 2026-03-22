// ── Incident type config ──────────────────────────────────────────
export const INCIDENT_TYPES = [
  { value: 'medical',  label: 'Medical',  color: 'blue',   icon: '🏥' },
  { value: 'fire',     label: 'Fire',     color: 'red',    icon: '🔥' },
  { value: 'crime',    label: 'Crime',    color: 'orange', icon: '🚨' },
  { value: 'accident', label: 'Accident', color: 'yellow', icon: '🚗' },
  { value: 'flood',    label: 'Flood',    color: 'blue',   icon: '🌊' },
  { value: 'other',    label: 'Other',    color: 'zinc',   icon: '⚠️' },
];

export const RESPONDER_TYPES = [
  { value: 'police',    label: 'Police',    icon: '🚔' },
  { value: 'ambulance', label: 'Ambulance', icon: '🚑' },
  { value: 'fire',      label: 'Fire',      icon: '🚒' },
];

export const VEHICLE_STATUSES = {
  idle:       { label: 'Idle',       badge: 'badge-green'  },
  dispatched: { label: 'Dispatched', badge: 'badge-orange' },
  en_route:   { label: 'En Route',   badge: 'badge-yellow' },
  on_scene:   { label: 'On Scene',   badge: 'badge-blue'   },
  returning:  { label: 'Returning',  badge: 'badge-zinc'   },
};

export const INCIDENT_STATUSES = {
  created:     { label: 'Created',     badge: 'badge-zinc'   },
  dispatched:  { label: 'Dispatched',  badge: 'badge-orange' },
  in_progress: { label: 'In Progress', badge: 'badge-yellow' },
  resolved:    { label: 'Resolved',    badge: 'badge-green'  },
  cancelled:   { label: 'Cancelled',   badge: 'badge-red'    },
};

// ── Formatters ────────────────────────────────────────────────────
export function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function incidentBadgeClass(type) {
  const map = { medical: 'badge-blue', fire: 'badge-red', crime: 'badge-orange', accident: 'badge-yellow' };
  return map[type] || 'badge-zinc';
}

export function getIncidentIcon(type) {
  return INCIDENT_TYPES.find(t => t.value === type)?.icon || '⚠️';
}
