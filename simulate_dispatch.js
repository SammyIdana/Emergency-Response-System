// ── Auto Dispatch Simulator ──────────────────────────────────────
// Run: node simulate_dispatch.js

const BASE_AUTH = 'http://localhost:3001';
const BASE_INCIDENT = 'http://localhost:3002';
const BASE_TRACKING = 'http://localhost:3003';

const FALLBACK_START = {
  ambulance: { latitude: 5.5354, longitude: -0.2279 },
  fire: { latitude: 5.5630, longitude: -0.2100 },
  police: { latitude: 5.5502, longitude: -0.2174 },
};

const INCIDENT_TO_VEHICLE = {
  medical: 'ambulance',
  fire: 'fire',
  crime: 'police',
  accident: 'police',
  flood: 'fire',
  other: 'police',
};

let token = null;
let tokenExpiry = 0;
const simulatedIncidents = new Set();

async function login() {
  const res = await fetch(`${BASE_AUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@erp.gh', password: 'admin1234' })
  });
  const data = await res.json();
  token = data.data.access_token;
  tokenExpiry = Date.now() + 12 * 60 * 1000;
  console.log('✅ Logged in as', data.data.user.name);
}

async function getHeaders() {
  if (Date.now() > tokenExpiry) {
    console.log('🔄 Refreshing token...');
    await login();
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function generatePath(start, end, steps = 10) {
  const path = [];
  for (let i = 1; i <= steps; i++) {
    path.push({
      latitude: start.latitude + (end.latitude - start.latitude) * (i / steps),
      longitude: start.longitude + (end.longitude - start.longitude) * (i / steps),
    });
  }
  return path;
}

// Find the vehicle ID in tracking service that matches the assigned unit
async function findVehicleForUnit(unitId, vehicleType) {
  try {
    // First try: look up by unit type and find the one linked to this unit
    const res = await fetch(`${BASE_TRACKING}/vehicles?unit_type=${vehicleType}`, {
      headers: await getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      const vehicles = data.data?.vehicles || data.data || [];

      // Try to find vehicle with matching station_id (unit_id)
      const matched = vehicles.find(v => v.station_id === unitId);
      if (matched) {
        console.log(`  🚗 Matched vehicle: ${matched.vehicle_id}`);
        return matched;
      }

      // Fallback: find any available vehicle of this type
      const available = vehicles.find(v => v.status === 'idle') || vehicles[0];
      if (available) {
        console.log(`  🚗 Using vehicle: ${available.vehicle_id}`);
        return available;
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Vehicle lookup error:`, err.message);
  }
  return null;
}

async function setVehicleStatus(vehicleId, status) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/status`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!data.success) console.log(`  ⚠️  Status failed:`, data.message);
    return data.success;
  } catch (err) {
    console.log(`  ⚠️  Status error:`, err.message);
    return false;
  }
}

async function updateVehicleLocation(vehicleId, pos) {
  try {
    await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(pos)
    });
  } catch (err) { }
}

async function resolveIncident(incidentId) {
  try {
    // First check if already resolved
    const checkRes = await fetch(`${BASE_INCIDENT}/incidents/${incidentId}`, {
      headers: await getHeaders()
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.data?.status === 'resolved') {
        console.log(`  ℹ️  Already resolved, skipping`);
        return true;
      }
    }

    const res = await fetch(`${BASE_INCIDENT}/incidents/${incidentId}/status`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify({ status: 'resolved' })
    });
    const data = await res.json();
    return data.success;
  } catch (err) {
    return false;
  }
}

async function simulateVehicle(vehicle, vehicleType, incidentId, incidentLat, incidentLng) {
  const vehicleId = vehicle.vehicle_id;
  console.log(`\n🚨 [${vehicleType.toUpperCase()}] Moving ${vehicleId}`);

  // Get starting position from vehicle data
  const start = {
    latitude: parseFloat(vehicle.current_latitude || vehicle.latitude || FALLBACK_START[vehicleType].latitude),
    longitude: parseFloat(vehicle.current_longitude || vehicle.longitude || FALLBACK_START[vehicleType].longitude),
  };
  const end = { latitude: incidentLat, longitude: incidentLng };

  console.log(`  📍 Starting from: ${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}`);
  console.log(`  📍 Going to: ${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}`);

  // 1. Dispatched
  await setVehicleStatus(vehicleId, 'dispatched');
  console.log(`  🚦 DISPATCHED`);
  await sleep(1500);

  // 2. En route
  await setVehicleStatus(vehicleId, 'en_route');
  console.log(`  🚦 EN_ROUTE`);
  await sleep(500);

  // 3. Move to incident
  const toIncident = generatePath(start, end, 10);
  process.stdout.write('  Moving: ');
  for (let i = 0; i < toIncident.length; i++) {
    await updateVehicleLocation(vehicleId, toIncident[i]);
    process.stdout.write('📍');
    await sleep(2000);
  }
  console.log(' arrived!');

  // 4. On scene
  await setVehicleStatus(vehicleId, 'on_scene');
  console.log(`  🏁 ON_SCENE — waiting 6 seconds...`);
  await sleep(6000);

  // 5. Resolve incident (only once)
  const resolved = await resolveIncident(incidentId);
  console.log(resolved ? `  ✅ Incident RESOLVED` : `  ⚠️  Already resolved`);
  await sleep(1000);

  // 6. Returning
  await setVehicleStatus(vehicleId, 'returning');
  console.log(`  🚦 RETURNING`);
  await sleep(500);

  // 7. Move back to base
  const toBase = generatePath(end, start, 10);
  process.stdout.write('  Returning: ');
  for (let i = 0; i < toBase.length; i++) {
    await updateVehicleLocation(vehicleId, toBase[i]);
    process.stdout.write('🏠');
    await sleep(2000);
  }
  console.log(' home!');

  // 8. Idle
  await setVehicleStatus(vehicleId, 'idle');
  console.log(`  🏠 IDLE — back at base!\n`);
}

async function checkForNewDispatches() {
  try {
    const res = await fetch(`${BASE_INCIDENT}/incidents?status=dispatched`, {
      headers: await getHeaders()
    });
    const data = await res.json();
    const incidents = data.data?.incidents || data.data || [];

    for (const inc of incidents) {
      if (simulatedIncidents.has(inc.incident_id)) continue;
      simulatedIncidents.add(inc.incident_id);

      const vehicleType = INCIDENT_TO_VEHICLE[inc.incident_type] || 'police';
      console.log(`\n🔔 New dispatch! ${inc.incident_type} → ${vehicleType}`);
      console.log(`   Incident: ${inc.incident_id.slice(0, 8)}...`);
      console.log(`   Location: ${inc.latitude}, ${inc.longitude}`);
      console.log(`   Assigned unit: ${inc.assigned_unit_id?.slice(0, 8) || 'none'}...`);

      // Find the actual vehicle in tracking service
      const vehicle = await findVehicleForUnit(inc.assigned_unit_id, vehicleType);

      if (!vehicle) {
        console.log(`  ⚠️  No vehicle found for this dispatch!`);
        continue;
      }

      simulateVehicle(
        vehicle, vehicleType, inc.incident_id,
        parseFloat(inc.latitude), parseFloat(inc.longitude)
      ).catch(err => console.error('Simulation error:', err.message));
    }
  } catch (err) {
    console.log('⚠️  Poll error, refreshing token...');
    await login();
  }
}

async function main() {
  console.log('🚨 Emergency Response Dispatch Simulator');
  console.log('=========================================');
  console.log('Watching for dispatches every 5 seconds...');
  console.log('Create an incident — it will auto-dispatch and simulate!\n');

  await login();

  while (true) {
    await checkForNewDispatches();
    await sleep(5000);
  }
}

main().catch(console.error);