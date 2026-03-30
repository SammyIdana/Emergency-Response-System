// ── Auto Dispatch Simulator Service ──────────────────────────────────────
// This service automatically simulates vehicle dispatching for emergency incidents
// Watches for dispatched incidents and moves responders to the scene

const BASE_AUTH = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const BASE_INCIDENT = process.env.INCIDENT_SERVICE_URL || 'http://incident-service:3002';
const BASE_TRACKING = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';
// Minimal HTTP server to satisfy Render's port requirement
const http = require('http');
http.createServer((req, res) => res.end('Dispatcher running')).listen(process.env.PORT || 3005, () => {
  console.log(`🌐 Health server on port ${process.env.PORT || 3005}`);
});
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
  try {
    const res = await fetch(`${BASE_AUTH}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@erp.gh', password: 'admin1234' })
    });
    const data = await res.json();
    if (data.success) {
      token = data.data.access_token;
      tokenExpiry = Date.now() + 12 * 60 * 1000;
      console.log('✅ [DISPATCHER] Logged in as', data.data.user.name);
      return true;
    } else {
      console.error('❌ [DISPATCHER] Login failed:', data.message);
      return false;
    }
  } catch (err) {
    console.error('❌ [DISPATCHER] Login error:', err.message);
    return false;
  }
}

async function getHeaders() {
  if (Date.now() > tokenExpiry) {
    console.log('🔄 [DISPATCHER] Refreshing token...');
    const success = await login();
    if (!success) throw new Error('Failed to refresh token');
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
    console.log(`  ⚠️  Could not get vehicle position:`, err.message);
  }
  // Use fallback
  return FALLBACK_START[vehicleType] || FALLBACK_START.police;
}

// Ensure vehicle exists in tracking service - with auto-creation fallback
async function ensureVehicleExists(vehicleId, vehicleType, incident) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}`, {
      headers: await getHeaders()
    });
    if (res.ok) {
      return true; // Vehicle exists
    } else if (res.status === 404) {
      // Vehicle doesn't exist - try to create it from incident data
      console.log(`  ⚠️  Vehicle ${vehicleId} not found - attempting to create...`);
      try {
        const createRes = await fetch(`${BASE_TRACKING}/vehicles/register`, {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            vehicle_id: vehicleId,
            unit_type: vehicleType,
            station_id: vehicleId,
            driver_name: `Auto Driver - ${vehicleType}`,
            driver_user_id: `auto-${vehicleId}`,
            latitude: parseFloat(incident.latitude) || (FALLBACK_START[vehicleType]?.latitude || 5.5502),
            longitude: parseFloat(incident.longitude) || (FALLBACK_START[vehicleType]?.longitude || -0.2174)
          })
        });
        if (createRes.ok) {
          console.log(`  ✅ Vehicle created successfully`);
          return true;
        } else {
          console.log(`  ❌ Failed to auto-create vehicle: ${createRes.status}`);
          return false;
        }
      } catch (createErr) {
        console.log(`  ❌ Auto-create error: ${createErr.message}`);
        return false;
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Could not check vehicle: ${err.message}`);
  }
  return false;
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
    console.log(`  ⚠️  Could not find vehicle: ${err.message}`);
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
    if (!data.success) {
      console.log(`  ⚠️  Status update failed: ${data.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`  ⚠️  Status error: ${err.message}`);
    return false;
  }
}

async function updateVehicleLocation(vehicleId, pos) {
  try {
    const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(pos)
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`  ⚠️  Location update failed: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`  ⚠️  Location error: ${err.message}`);
    return false;
  }
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
    console.log(`  ⚠️  Resolve error: ${err.message}`);
    return false;
  }
}

async function simulateVehicle(vehicleId, vehicleType, incidentId, incidentLat, incidentLng, incident) {
  console.log(`\n🚨 [${vehicleType.toUpperCase()}] Simulating vehicle ${vehicleId}`);

  // Check if vehicle exists - create if needed
  const exists = await ensureVehicleExists(vehicleId, vehicleType, incident || {
    latitude: incidentLat,
    longitude: incidentLng
  });
  if (!exists) {
    console.log(`  ❌ Vehicle ${vehicleId} does not exist and could not be created - skipping simulation`);
    return;
  }

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
    const success = await updateVehicleLocation(vehicleId, toIncident[i]);
    if (success) {
      process.stdout.write('📍');
    } else {
      process.stdout.write('❌');
    }
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
    const success = await updateVehicleLocation(vehicleId, toBase[i]);
    if (success) {
      process.stdout.write('🏠');
    } else {
      process.stdout.write('❌');
    }
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
    if (!res.ok) {
      console.log(`⚠️  [DISPATCHER] API error: ${res.status}`);
      return;
    }

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
        parseFloat(inc.latitude), parseFloat(inc.longitude),
        inc  // Pass full incident object for fallback data
      ).catch(err => console.error('❌ Simulation error:', err.message));
    }
  } catch (err) {
    console.log('⚠️  [DISPATCHER] Poll error:', err.message);
  }
}

async function main() {
  console.log('\n🚨 EMERGENCY RESPONSE DISPATCH SIMULATOR');
  console.log('=========================================');
  console.log('Services:');
  console.log(`  Auth:     ${BASE_AUTH}`);
  console.log(`  Incident: ${BASE_INCIDENT}`);
  console.log(`  Tracking: ${BASE_TRACKING}`);
  console.log('=========================================\n');
  console.log('Watching for dispatches every 5 seconds...\n');

  let loginAttempts = 0;
  const maxAttempts = 10;

  while (loginAttempts < maxAttempts) {
    const success = await login();
    if (success) break;
    loginAttempts++;
    console.log(`⏳ Retry in 10 seconds... (${loginAttempts}/${maxAttempts})`);
    await sleep(10000);
  }

  if (loginAttempts >= maxAttempts) {
    console.error('❌ Failed to login after multiple attempts. Exiting.');
    process.exit(1);
  }

  // Start polling for dispatches
  while (true) {
    await checkForNewDispatches();
    await sleep(5000);
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
