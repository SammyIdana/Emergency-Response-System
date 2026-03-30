// ── Auto Dispatch Simulator ──────────────────────────────────────
// Run: node simulate_dispatch.js
// Watches for dispatches, reads actual vehicle position, moves to scene, resolves, returns.

const BASE_AUTH = 'http://localhost:3001';
const BASE_INCIDENT = 'http://localhost:3002';
const BASE_TRACKING = 'http://localhost:3003';

// Fallback starting positions if vehicle location not found
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

// Get actual vehicle current position from tracking service
async function getVehiclePosition(vehicleId, vehicleType) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
      headers: await getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        const loc = data.data;
        const lat = parseFloat(loc.current_latitude || loc.latitude);
        const lng = parseFloat(loc.current_longitude || loc.longitude);
        if (lat && lng) {
          console.log(`  📍 Vehicle at: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          return { latitude: lat, longitude: lng };
        }
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Could not get vehicle position, using fallback`);
  }
  // Use fallback
  return FALLBACK_START[vehicleType] || FALLBACK_START.police;
}

// Find vehicle ID by unit type from tracking service
async function findVehicleIdByType(vehicleType) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles?unit_type=${vehicleType}`, {
      headers: await getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      const vehicles = data.data?.vehicles || data.data || [];
      // Find idle or available vehicle of this type
      const available = vehicles.find(v => v.status === 'idle' || v.status === 'available') || vehicles[0];
      if (available) {
        console.log(`  🚗 Found vehicle: ${available.vehicle_id}`);
        return available.vehicle_id;
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Could not find vehicle, using default ID`);
  }
  // Fallback to default IDs
  const defaults = { ambulance: 'VEH-AMBULANCE-001', fire: 'VEH-FIRE-001', police: 'VEH-POLICE-001' };
  return defaults[vehicleType] || defaults.police;
}

async function setVehicleStatus(vehicleId, status) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/status`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!data.success) console.log(`  ⚠️  Status update failed:`, data.message);
  } catch (err) {
    console.log(`  ⚠️  Status error:`, err.message);
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

async function simulateVehicle(vehicleId, vehicleType, incidentId, incidentLat, incidentLng) {
  console.log(`\n🚨 [${vehicleType.toUpperCase()}] Simulating vehicle ${vehicleId}`);

  // Get actual current position of this specific vehicle
  const start = await getVehiclePosition(vehicleId, vehicleType);
  const end = { latitude: incidentLat, longitude: incidentLng };

  // 1. Dispatched
  await setVehicleStatus(vehicleId, 'dispatched');
  console.log(`  🚦 DISPATCHED`);
  await sleep(1500);

  // 2. En route
  await setVehicleStatus(vehicleId, 'en_route');
  console.log(`  🚦 EN_ROUTE — moving to scene...`);
  await sleep(500);

  // 3. Move to incident from actual position
  const toIncident = generatePath(start, end, 10);
  for (let i = 0; i < toIncident.length; i++) {
    await updateVehicleLocation(vehicleId, toIncident[i]);
    process.stdout.write('📍');
    await sleep(2000);
  }
  console.log('');

  // 4. On scene
  await setVehicleStatus(vehicleId, 'on_scene');
  console.log(`  🏁 ON_SCENE — waiting 6 seconds...`);
  await sleep(6000);

  // 5. Resolve incident
  const resolved = await resolveIncident(incidentId);
  console.log(resolved ? `  ✅ Incident RESOLVED` : `  ⚠️  Resolve failed`);
  await sleep(1000);

  // 6. Returning
  await setVehicleStatus(vehicleId, 'returning');
  console.log(`  🚦 RETURNING TO BASE...`);
  await sleep(500);

  // 7. Move back to original position
  const toBase = generatePath(end, start, 10);
  for (let i = 0; i < toBase.length; i++) {
    await updateVehicleLocation(vehicleId, toBase[i]);
    process.stdout.write('🏠');
    await sleep(2000);
  }
  console.log('');

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
      console.log(`   Location: ${inc.latitude}, ${inc.longitude}`);
      console.log(`   Assigned unit: ${inc.assigned_unit_id?.slice(0, 8) || 'unknown'}...`);

      // Use the actual assigned unit ID from the incident
      const vehicleId = inc.assigned_unit_id || await findVehicleIdByType(vehicleType);

      simulateVehicle(
        vehicleId, vehicleType, inc.incident_id,
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
