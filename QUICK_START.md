# Quick Start - After Applying the Fix

## What Was Fixed

Your Emergency Response System now has an **automated dispatcher simulator** service that:

1. **Automatically detects** when incidents are created and dispatched
2. **Simulates vehicle movement** in real-time from base to incident location
3. **Updates vehicle status** through multiple stages (en_route → on_scene → returning)
4. **Broadcasts live updates** to the frontend via WebSocket
5. **Auto-resolves incidents** after realistic on-scene simulation time
6. **Returns vehicles** to their base stations

## Getting Started

### 1. Rebuild and Start Services

```bash
cd "Emergency Response Platform"
docker-compose down          # Clean up old containers (if any)
docker-compose up --build    # Rebuild and start all services
```

This will start:
- ✅ PostgreSQL databases for auth, incidents, and analytics
- ✅ MongoDB for vehicle tracking
- ✅ RabbitMQ message broker
- ✅ Auth Service (port 3001)
- ✅ Incident Service (port 3002)
- ✅ Tracking Service (port 3003)
- ✅ Analytics Service (port 3004)
- ✅ **NEW:** Dispatcher Simulator (background service)
- ✅ Adminer database GUI (port 8080)

### 2. Create Test Data

```bash
# Get your admin token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@erp.gh", "password": "admin1234"}' | jq -r '.data.access_token')

# Register responder units
curl -X POST http://localhost:3002/responders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_type": "ambulance",
    "name": "Korle Bu Ambulance",
    "latitude": 5.5354,
    "longitude": -0.2279
  }'

curl -X POST http://localhost:3002/responders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_type": "fire",
    "name": "Accra Fire Station 1",
    "latitude": 5.5630,
    "longitude": -0.2100
  }'

curl -X POST http://localhost:3002/responders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_type": "police",
    "name": "Accra Central Police",
    "latitude": 5.5502,
    "longitude": -0.2174
  }'
```

### 3. Create an Incident and Watch It Work

```bash
# Create a medical incident
curl -X POST http://localhost:3002/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "citizen_name": "Akosua Mensah",
    "incident_type": "medical",
    "latitude": 5.5500,
    "longitude": -0.2100,
    "location_address": "Downtown Accra",
    "notes": "Chest pain"
  }'
```

### 4. Monitor the Dispatcher

Watch the dispatcher automatically handle your incident:

```bash
docker-compose logs -f dispatcher-simulator
```

You should see:
```
dispatcher-simulator  | 🔔 New dispatch! medical → ambulance
dispatcher-simulator  | 🚨 [AMBULANCE] Simulating vehicle VEH-AMBULANCE-001
dispatcher-simulator  | 🚦 DISPATCHED
dispatcher-simulator  | 🚦 EN_ROUTE — moving to scene...
dispatcher-simulator  | 📍📍📍📍📍📍📍📍📍📍
dispatcher-simulator  | 🏁 ON_SCENE — waiting 6 seconds...
dispatcher-simulator  | ✅ Incident RESOLVED
```

### 5. View on Frontend (Optional)

If you have the frontend running:

```bash
cd erp-frontend
npm install
npm run dev  # Runs on http://localhost:5173
```

Then navigate to **Live Tracking** page and watch:
- 🚑 Vehicle icons appear on the map
- 📍 Smooth animation as they move to incidents
- 🗺️ Real-time updates as status changes
- ✅ Vehicle returns to base when complete

## Verification Checklist

- [ ] All services healthy: `docker-compose ps`
- [ ] No errors in dispatcher logs: `docker-compose logs dispatcher-simulator`
- [ ] Responders registered: `curl http://localhost:3002/responders -H "Authorization: Bearer $TOKEN"`
- [ ] Create test incident: See command above
- [ ] Check incident status changes to 'resolved'
- [ ] (Optional) See vehicle movement on frontend map

## How It Works Behind the Scenes

1. **User creates incident** → `POST /incidents`
   - Auto-dispatch triggered immediately
   - Incident status → `dispatched`
   - Event published: `incident.dispatched`

2. **Dispatcher notices dispatch** (within 5 seconds)
   - Polls for `status=dispatched` incidents
   - Finds newly dispatched incidents
   - Starts simulation

3. **Simulation runs**
   - Vehicle status: `idle` → `dispatched` → `en_route` → `on_scene` → `returning` → `idle`
   - Each change updates tracking service
   - WebSocket broadcasts to all connected clients
   - Location updates every 2 seconds

4. **After 6 seconds on scene**
   - Incident status → `resolved`
   - Vehicle returns to base
   - Returns to `idle` status

5. **Frontend receives updates**
   - WebSocket listener processes vehicle location updates
   - Map re-renders with new position
   - Smooth animation between points

## Configuration

All environment variables are already configured in `docker-compose.yml`:

```yaml
dispatcher-simulator:
  environment:
    AUTH_SERVICE_URL: http://auth-service:3001
    INCIDENT_SERVICE_URL: http://incident-service:3002
    TRACKING_SERVICE_URL: http://tracking-service:3003
```

To customize, edit the `docker-compose.yml` file or set environment variables before running `docker-compose up`.

## Troubleshooting

### Q: Dispatcher doesn't seem to be running
**A:** Check logs: `docker-compose logs dispatcher-simulator`

### Q: Vehicles still don't move on map
**A:** 
1. Verify WebSocket connection in browser (DevTools → Network → WS)
2. Check frontend is connecting to correct TRACKING_URL
3. Verify firewall isn't blocking WebSocket

### Q: Incident doesn't resolve
**A:** 
1. Check dispatcher logs for errors
2. Ensure incident was actually set to `dispatched` status
3. Verify incident service can communicate with tracking service

### Q: "Vehicle not found" errors
**A:** 
1. Dispatcher will auto-create vehicles if they don't exist
2. Check tracking service logs: `docker-compose logs tracking-service`
3. Ensure vehicle registration completed succesffully

## Next Steps

- Test multiple concurrent incidents
- Integrate with your frontend
- Deploy to production
- Monitor performance and logs

## Support

For issues or questions:
1. Check `/FIX_SUMMARY.md` for detailed technical information
2. Review logs: `docker-compose logs [service-name]`
3. Check Swagger docs: `http://localhost:3002/api-docs` (for incidents), etc.

---

**The system is now fully automated!** ✅ 

Create incidents and watch them get dispatched and resolved in real-time. 🚀
