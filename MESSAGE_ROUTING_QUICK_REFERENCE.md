# Quick Reference: Message Routing Patterns

## RabbitMQ Queue Bindings at a Glance

### Incident Service
```
PUBLISHES:
  ✓ incident.created        → When new incident reported
  ✓ incident.dispatched     → When unit assigned
  ✓ incident.status.updated → When status changes (in_progress)
  ✓ incident.resolved       → When incident completed
  ✓ dispatch.created        → When responder vehicle dispatched

SUBSCRIBES:
  ✗ (No subscriptions - producer only)
```

### Tracking Service
```
PUBLISHES:
  ✗ (No publications - consumer only)

SUBSCRIBES:
  Queue: tracking.dispatch
    Pattern: dispatch.created
    Action: Update vehicle status → 'dispatched', link to incident

  Queue: tracking.incident.created
    Pattern: incident.created
    Action: Emit WebSocket notification 'new_notification'
    
  Queue: tracking.incident.resolved
    Pattern: incident.resolved
    Action: Free up vehicle, set status → 'idle'
```

### Analytics Service
```
PUBLISHES:
  ✗ (No publications - consumer only)

SUBSCRIBES:
  Queue: analytics.incidents
    Pattern: incident.*
    Action: Record metrics (creation time, response time, resolution)
    Matches:
      - incident.created
      - incident.dispatched
      - incident.status.updated
      - incident.resolved

  Queue: analytics.dispatch
    Pattern: dispatch.*
    Action: Track dispatch timing, unit utilization
    Matches:
      - dispatch.created

  Queue: analytics.capacity
    Pattern: hospital.capacity.*
    Action: Monitor bed/capacity updates
    Matches:
      - hospital.capacity.updated
```

---

## HTTP REST Communication Flows

### Authentication Flow
```
Dispatcher Simulator
    ↓
    POST /auth/login
    ├─ Headers: Content-Type: application/json
    ├─ Body: { email, password }
    ↓
Auth Service
    ├─ Validates credentials
    ├─ Generates JWT token (15min expiry)
    ├─ Generates refresh token (7d expiry)
    ↓
Response: { access_token, refresh_token, user }
```

### Incident Retrieval Flow
```
Dispatcher Simulator
    ↓
    GET /incidents/open
    ├─ Headers: Authorization: Bearer {token}
    ↓
Incident Service
    ├─ Validates JWT
    ├─ Queries: status IN ('created', 'dispatched', 'in_progress')
    ├─ Applies role-based filters
    ↓
Response: { incidents: [...], count: N }
```

### Vehicle Location Tracking Flow
```
Dispatcher Simulator
    ↓
    GET /vehicles/{vehicleId}/location
    ├─ Headers: Authorization: Bearer {token}
    ↓
Tracking Service (MongoDB)
    ├─ Lookup vehicle by vehicle_id
    ├─ Return: { vehicle_id, latitude, longitude, status, updated_at }
    ↓
Response: { success: true, data: location }

---

    ↓
    POST /vehicles/{vehicleId}/location
    ├─ Headers: Authorization: Bearer {token}
    ├─ Body: { latitude, longitude, [timestamp], [status] }
    ↓
Tracking Service (MongoDB)
    ├─ Update vehicle location
    ├─ Save to location history
    ├─ Emit WebSocket: 'vehicle_location_updated'
    ↓
Response: { success: true, data: updatedVehicle }
```

### Incident Resolution & Vehicle Reset Flow
```
Admin clicks "Resolve Incident" on Frontend
    ↓
    PUT /incidents/{id}/status
    ├─ Headers: Authorization: Bearer {token}
    ├─ Body: { status: 'resolved' }
    ├─ Source: incident-service
    ↓
Incident Service (PostgreSQL)
    ├─ Update incident status in DB
    ├─ Mark unit as available
    ├─ Publish incident.resolved event to RabbitMQ
    │
    ├─ Make REST call:
    │   POST /vehicles/{unit_id}/location
    │   ├─ Target: tracking-service
    │   ├─ Body: {
    │   │   latitude: base_station_lat,
    │   │   longitude: base_station_lng,
    │   │   status: 'idle'
    │   │ }
    │
    └─ Tracking Service updates vehicle
        ├─ Sets location to base station
        ├─ Updates status to 'idle'
        ├─ Emits WebSocket: 'vehicle_status_changed'
RABBITmQ receives incident.resolved
    ├─ Routing key matched by:
    │   - tracking.incident.resolved queue
    │   - analytics.incidents queue
    ├─ tracking-service processes: frees vehicle
    └─ analytics-service processes: records metrics
```

---

## Event Flow Sequence Diagrams

### Complete Incident Lifecycle

```
┌─ INCIDENT REPORTED ──────────────────────────────────
│
├─ Event: incident.created
│  Published from: incident-service
│  Consumed by: [tracking-service, analytics-service]
│
├─ Actions:
│  ├─ Tracking: Notify frontend via WebSocket
│  └─ Analytics: Record incident timestamp
│
├─ Auto-Dispatch Logic Triggered:
│  ├─ Query available responders
│  ├─ Select nearest unit
│  ├─ Mark unit unavailable in DB
│  └─ Update incident status → 'dispatched'
│
├─ Event: dispatch.created
│  Published from: incident-service
│  Consumed by: [tracking-service, analytics-service]
│
├─ Actions:
│  ├─ Tracking: Link vehicle to incident, update status
│  │  └─ Emit WebSocket: dispatch_created
│  └─ Analytics: Record dispatch timestamp
│
├─ Dispatcher Simulator Animates Movement:
│  └─ POST /vehicles/{id}/location (multiple times)
│     Each location update triggers:
│     └─ WebSocket: vehicle_location_updated
│
├─ Event: incident.status.updated (when in_progress)
│  └─ Consumed by: analytics-service
│
├─ Responder Completes Work
│  └─ Admin marks incident → 'resolved'
│
├─ Event: incident.resolved
│  Published from: incident-service
│  Consumed by: [tracking-service, analytics-service]
│
├─ Actions:
│  ├─ Incident-Service: 
│  │  └─ REST call: POST /vehicles/{unit_id}/location
│  │     (snap vehicle to base)
│  │
│  ├─ Tracking-Service:
│  │  ├─ Update vehicle location to base
│  │  ├─ Set status → 'idle'
│  │  └─ Mark unit available
│  │
│  └─ Analytics-Service:
│     └─ Calculate response time, update metrics
│
└─ INCIDENT CLOSED
```

---

## Message Payload Quick Reference

### Minimal incident.created
```javascript
{
  "incident_id": "INC_20260331_001",
  "incident_type": "medical",  // medical|fire|crime|accident|other
  "latitude": 5.5354,
  "longitude": -0.2279,
  "citizen_name": "John Doe",
  "created_by": "USER_123",
  "status": "created",
  "region": "Greater Accra",
  "created_at": "2026-03-31T14:23:00Z"
}
```

### Minimal dispatch.created
```javascript
{
  "incident_id": "INC_20260331_001",
  "vehicle_id": "UNIT_AMB_001",
  "unit_type": "ambulance",    // ambulance|fire|police
  "station_id": "HOSP_GA_001",
  "incident_lat": 5.5354,
  "incident_lng": -0.2279,
  "dispatched_at": "2026-03-31T14:24:00Z"
}
```

### Minimal incident.resolved
```javascript
{
  "incident_id": "INC_20260331_001",
  "status": "resolved",
  "assigned_unit_id": "UNIT_AMB_001",
  "resolved_at": "2026-03-31T14:45:00Z"
}
```

---

## Debugging Checklist

**Issue: Event not reaching consumer?**
- [ ] Check queue binding matches routing key pattern
- [ ] Verify queue exists and is durable
- [ ] Check RabbitMQ Management UI (localhost:15672)
- [ ] Review error logs in consumer service
- [ ] Verify channel is connected

**Issue: REST call timing out?**
- [ ] Check target service is running (docker ps)
- [ ] Verify service URL in environment variables
- [ ] Check JWT token not expired
- [ ] Review service logs for errors
- [ ] Test with curl: `curl -H "Authorization: Bearer {token}" http://service:port/endpoint`

**Issue: Vehicle location not updating?**
- [ ] Check tracking-service MongoDB connection
- [ ] Verify GPS update POST request format
- [ ] Check vehicle_id exists in database
- [ ] Review location history in MongoDB
- [ ] Monitor WebSocket emissions in browser console

---

## Key Environment Variables

| Variable | Service | Example Value |
|----------|---------|---------------|
| `RABBITMQ_URL` | Most services | `amqp://user:pass@rabbitmq:5672` |
| `AUTH_SERVICE_URL` | incident, tracking | `http://auth-service:3001` |
| `INCIDENT_SERVICE_URL` | dispatcher-sim, tracking | `http://incident-service:3002` |
| `TRACKING_SERVICE_URL` | incident-service, dispatcher-sim | `http://tracking-service:3003` |
| `JWT_SECRET` | All services | `emergency_response_jwt_secret_2024` |
| `JWT_EXPIRES_IN` | auth-service | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | auth-service | `7d` |

---

## Common Message Routing Patterns in Code

### Publishing (incident-service)
```javascript
const { publish } = require('../rabbitmq');

// Publish incident creation
publish('incident.created', {
    incident_id: incident.incident_id,
    incident_type: incident.incident_type,
    // ... payload
});

// Publish dispatch
publish('dispatch.created', {
    incident_id: incident.incident_id,
    vehicle_id: unit.unit_id,
    // ... payload
});
```

### Subscribing (tracking-service)
```javascript
// Bind and consume
const dispatchQueue = await channel.assertQueue('tracking.dispatch', { durable: true });
await channel.bindQueue(dispatchQueue.queue, EXCHANGE, 'dispatch.created');

channel.consume(dispatchQueue.queue, async (msg) => {
    const envelope = JSON.parse(msg.content.toString());
    // Process event
    channel.ack(msg);  // Success
    // channel.nack(msg, false, true);  // Failure: requeue
});
```

### Making REST Calls
```javascript
const axios = require('axios');

// Call tracking-service
await axios.post(`${process.env.TRACKING_SERVICE_URL}/vehicles/${id}/location`, 
  {
    latitude: lat,
    longitude: lng,
    status: 'idle'
  },
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);
```

---

## Monitoring Commands

### Check RabbitMQ Queues
```bash
docker exec erp-rabbitmq rabbitmqctl list_queues
docker exec erp-rabbitmq rabbitmqctl list_exchanges
```

### View RabbitMQ Management
```
http://localhost:15672
Username: erp_user
Password: erp_pass
```

### Test Service Connectivity
```bash
# Check if service is running
curl http://localhost:3002/health

# Test with authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3002/incidents/open
```

### View Incident Service Logs
```bash
docker logs erp-incident-service -f
```

### View Tracking Service Logs
```bash
docker logs erp-tracking-service -f
```

---

**Last Updated:** March 31, 2026
