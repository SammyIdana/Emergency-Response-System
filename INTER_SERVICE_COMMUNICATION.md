# Inter-Service Communication & Message Routing Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Service Summary](#service-summary)
3. [Communication Patterns](#communication-patterns)
4. [RabbitMQ Message Exchange](#rabbitmq-message-exchange)
5. [REST API Communication](#rest-api-communication)
6. [Event Flow Sequences](#event-flow-sequences)
7. [Message Routing Diagrams](#message-routing-diagrams)

---

## Architecture Overview

The Emergency Response System uses a **microservices architecture** with two primary communication patterns:

```
┌─────────────────────────────────────────────────────┐
│         Frontend (React/Vite)                       │
│         Port: 5173 / 3000                           │
└────────────────┬────────────────────────────────────┘
                 │
        ┌────────┴────────────────────┐
        │                             │
        ▼                             ▼
┌─────────────────────────────┐  ┌──────────────────────┐
│   REST API Communication    │  │ Message Bus          │
│   (Synchronous)             │  │ RabbitMQ             │
│                             │  │ (Asynchronous)       │
└─────────────────────────────┘  └──────────────────────┘
        │                             │
     ┌──┴──────────────────────────┬──┘
     │                             │
     ▼                             ▼
  [Services]              [Event Consumers]
```

---

## Service Summary

| Service | Port | Database | Role | Key Queues |
|---------|------|----------|------|-----------|
| **auth-service** | 3001 | PostgreSQL (5433) | Authentication & Authorization | N/A (Producer) |
| **incident-service** | 3002 | PostgreSQL (5434) | Incident management & auto-dispatch | `incident.created`, `incident.dispatched` |
| **tracking-service** | 3003 | MongoDB (27018) | Vehicle GPS tracking & location history | `dispatch.created`, `incident.created`, `incident.resolved` |
| **analytics-service** | 3004 | PostgreSQL (5435) | Analytics & reporting | `analytics.incidents`, `analytics.dispatch`, `analytics.capacity` |
| **dispatcher-simulator** | 3005 | N/A (HTTP calls only) | Simulates auto-dispatch workflows | N/A (Consumer) |

**Infrastructure:**
- **RabbitMQ** (Port 5672) - Message broker for event-driven communication
- **Adminer** (Port 8080) - Database management UI

---

## Communication Patterns

### 1. **REST API Communication** (Synchronous)

Services make **HTTP requests** to each other for real-time queries and updates:

#### Incident Service → Tracking Service
```javascript
// When resolving an incident, incident-service snaps vehicle back to base
POST ${TRACKING_SERVICE_URL}/vehicles/{unit_id}/location
{
  "latitude": baseLatitude,
  "longitude": baseLongitude,
  "status": "idle"
}
Headers: Authorization: Bearer ${JWT_TOKEN}
```

#### Dispatcher Simulator → Auth Service
```javascript
POST ${BASE_AUTH}/auth/login
{
  "email": "admin@erp.gh",
  "password": "admin1234"
}
```

#### Dispatcher Simulator → Incident Service
```javascript
// Get open incidents for simulation
GET ${BASE_INCIDENT}/incidents/open
Headers: Authorization: Bearer ${token}

// Trigger manual assignment
PUT ${BASE_INCIDENT}/incidents/{id}/assign
{
  "unit_id": "UNIT_001"
}
```

#### Dispatcher Simulator → Tracking Service
```javascript
// Get current vehicle position
GET ${BASE_TRACKING}/vehicles/{vehicleId}/location

// Update vehicle location during dispatch simulation
POST ${BASE_TRACKING}/vehicles/{vehicleId}/location
{
  "latitude": newLat,
  "longitude": newLng,
  "timestamp": "2026-03-31T12:30:00Z"
}
```

### 2. **RabbitMQ Event Communication** (Asynchronous)

Services publish and consume events through a **Topic Exchange** pattern.

---

## RabbitMQ Message Exchange

### Exchange Configuration
```
Exchange Name: emergency.events
Exchange Type: Topic (pattern-based routing)
Durability: true (persists even if RabbitMQ restarts)
```

### Message Envelope Structure
Every message published follows this standard format:
```javascript
{
  "event_id": "unique-uuid-v4",
  "event_type": "incident.created",
  "timestamp": "2026-03-31T12:30:00Z",
  "source_service": "incident-service",
  "payload": { /* event-specific data */ }
}
```

### Event Topics & Routing

#### **Incident lifecycle events:**

| Routing Key | Publisher | Consumers | Purpose |
|-------------|-----------|-----------|---------|
| `incident.created` | incident-service | tracking-service, analytics-service | New incident reported |
| `incident.dispatched` | incident-service | analytics-service | Unit assigned to incident |
| `incident.status.updated` | incident-service | analytics-service | Status changed (in_progress) |
| `incident.resolved` | incident-service | tracking-service, analytics-service | Incident completed |

#### **Dispatch lifecycle events:**

| Routing Key | Publisher | Consumers | Purpose |
|-------------|-----------|-----------|---------|
| `dispatch.created` | incident-service | tracking-service, analytics-service | Responder dispatch initiated |

#### **Hospital/Facility events:**

| Routing Key | Publisher | Consumers | Purpose |
|-------------|-----------|-----------|---------|
| `hospital.capacity.*` | hospital-admin (frontend) | analytics-service | Bed capacity updates |

---

## Queue Configuration Details

### **Tracking Service Queues**

#### 1. Queue: `tracking.dispatch`
```javascript
// Binding
await channel.bindQueue('tracking.dispatch', 'emergency.events', 'dispatch.created');

// Consumes Message
{
  "vehicle_id": "UNIT_001",
  "incident_id": "INC_12345",
  "unit_type": "ambulance",
  "station_id": "HOSP_001",
  "incident_lat": 5.5354,
  "incident_lng": -0.2279
}

// Handler Action
await Vehicle.findOneAndUpdate(
  { vehicle_id: payload.vehicle_id },
  {
    incident_id: payload.incident_id,
    status: 'dispatched',
    updated_at: new Date()
  }
);

// WebSocket Emission
ioInstance.emit('dispatch_created', payload);
```

#### 2. Queue: `tracking.incident.created`
```javascript
// Binding
await channel.bindQueue('tracking.incident.created', 'emergency.events', 'incident.created');

// Purpose
Emits real-time notification to frontend via WebSocket

// Handler Action
ioInstance.emit('new_notification', {
  id: randomUUID(),
  type: 'incident',
  title: 'New Emergency Incident',
  message: `${incident_type.toUpperCase()} reported - ${citizen_name}`,
  severity: 'high' | 'medium'
});
```

#### 3. Queue: `tracking.incident.resolved`
```javascript
// Binding
await channel.bindQueue('tracking.incident.resolved', 'emergency.events', 'incident.resolved');

// Handler Action
Updates vehicle status to 'idle' and frees up from incident
```

---

### **Analytics Service Queues**

#### 1. Queue: `analytics.incidents`
```javascript
// Binding
await channel.bindQueue('analytics.incidents', 'emergency.events', 'incident.*');
// Matches: incident.created, incident.dispatched, incident.status.updated, incident.resolved

// Handler
async function handleIncidentEvent(eventType, payload) {
  switch(eventType) {
    case 'incident.created':
      // Record incident creation timestamp
      // Update incident count metrics
      break;
    case 'incident.dispatched':
      // Track dispatch time
      // Update responder availability
      break;
    case 'incident.resolved':
      // Calculate response time
      // Update resolution metrics
      break;
  }
}
```

#### 2. Queue: `analytics.dispatch`
```javascript
// Binding
await channel.bindQueue('analytics.dispatch', 'emergency.events', 'dispatch.*');

// Handler
async function handleDispatchEvent(eventType, payload) {
  // Track dispatch metrics
  // Record vehicle assignments
}
```

#### 3. Queue: `analytics.capacity`
```javascript
// Binding
await channel.bindQueue('analytics.capacity', 'emergency.events', 'hospital.capacity.*');

// Handler
async function handleCapacityEvent(payload) {
  // Update hospital bed capacity metrics
  // Track facility utilization
}
```

---

## REST API Communication

### Direct Service Calls

#### **Incident Service → Tracking Service**

**Endpoint:** `POST /vehicles/{unit_id}/location`  
**Called From:** Incident controller when resolving incident  
**Purpose:** Reset vehicle location to base station

```javascript
// incident.controller.js - updateIncidentStatus()
if (status === 'resolved' && incident.assigned_unit_id) {
    const unitResult = await pool.query(
        'UPDATE responder_units SET is_available = TRUE WHERE unit_id = $1 RETURNING *',
        [incident.assigned_unit_id]
    );

    if (unitResult.rows.length) {
        const unit = unitResult.rows[0];
        await axios.post(`${trackingUrl}/vehicles/${unit.unit_id}/location`, {
            latitude: parseFloat(unit.latitude),
            longitude: parseFloat(unit.longitude),
            status: 'idle'
        }, {
            headers: { Authorization: req.headers.authorization }
        });
    }
}
```

#### **Dispatcher Simulator → Auth Service**

**Endpoint:** `POST /auth/login`  
**Purpose:** Obtain JWT token for authenticated requests

```javascript
async function login() {
  const res = await fetch(`${BASE_AUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: 'admin@erp.gh', 
      password: 'admin1234' 
    })
  });
  const data = await res.json();
  token = data.data.access_token;
  tokenExpiry = Date.now() + 12 * 60 * 1000; // 12 minutes
}
```

#### **Dispatcher Simulator → Incident Service**

**Endpoint:** `GET /incidents/open`  
**Purpose:** Retrieve incidents awaiting dispatch

```javascript
// Fetches all open incidents (status: created, dispatched, in_progress)
// Used by dispatcher to find incidents to simulate
```

#### **Dispatcher Simulator → Tracking Service**

**Endpoint:** `GET /vehicles/{vehicleId}/location`  
**Purpose:** Get current GPS position of vehicle

```javascript
async function getVehiclePosition(vehicleId, vehicleType) {
  const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
    headers: await getHeaders()
  });
  
  if (res.ok) {
    const data = await res.json();
    const lat = parseFloat(data.data.current_latitude || data.data.latitude);
    const lng = parseFloat(data.data.current_longitude || data.data.longitude);
    return { latitude: lat, longitude: lng };
  }
}
```

**Endpoint:** `POST /vehicles/{vehicleId}/location`  
**Purpose:** Simulate GPS tracking updates (vehicle movement)

```javascript
// Used by dispatcher-simulator to animate vehicles moving to incident location
await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
  method: 'POST',
  headers: await getHeaders(),
  body: JSON.stringify({
    latitude: newLat,
    longitude: newLng,
    timestamp: new Date().toISOString()
  })
});
```

---

## Event Flow Sequences

### **Flow 1: Incident Creation → Auto-Dispatch**

```
┌─────────────────────────────────────────────────────────────────┐
│ User -> Frontend: Create Incident                               │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────┐
    │ POST /incidents              │ (incident-service)
    │ Body: {citizen_name, coords} │
    └────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ createIncident() Controller   │ 
    │ - Insert incident to DB       │ (PostgreSQL: incident_db)
    │ - Publish event               │
    └────────┬─────────────────────┘
             │
             ├──────────────────────────────────┐
             │                                  │
             ▼                                  ▼
    [RabbitMQ Publish]              [autoDispatch() Triggered]
    Event: incident.created         │
            │                        │
            ├──────────────┐         │
            │              │         │
            ▼              ▼         ▼
    [Track Service]  [Analytics]  [Dispatcher]
    Updates Vehicle  Records      - Select nearest responder
    Sends WS         Metrics      - Assign unit (mark unavailable)
    Notification                  - Update incident status→dispatched
                                   - Publish dispatch.created
                                     │
                                     ├─────────────┐
                                     ▼             ▼
                              [Track Service]  [Analytics]
                              Updates vehicle  Records
                              status→dispatched metrics
```

### **Flow 2: Incident Resolution & Vehicle Snap-to-Base**

```
┌──────────────────────────────────────────────────┐
│ Admin: Mark Incident as RESOLVED                 │
└────────────┬─────────────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────┐
    │ PUT /incidents/{id}/status      │ (incident-service)
    │ Body: { status: 'resolved' }    │
    └────────┬────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────┐
    │ updateIncidentStatus() Controller│
    │ - Update incident status in DB   │
    │ - Mark unit as available         │
    └────────┬────────────────────────┘
             │
             ├─────────────────────────────────────┐
             │                                     │
             ▼                                     ▼
    [RabbitMQ Publish]              [Direct REST Call]
    Event: incident.resolved        POST /vehicles/{unit_id}/location
            │                       (tracking-service)
            │                       Body: {
            ├────────────────┐      lat: base_lat,
            │                │      lng: base_lng,
            ▼                ▼      status: 'idle'
    [Track Service]  [Analytics]    }
    Updates vehicle  Records
    status→idle      metrics
```

### **Flow 3: Dispatcher Simulator Auto-Dispatch Workflow**

```
┌──────────────────────────────────┐
│ Dispatcher Simulator Service     │ (runs on interval, e.g., every 30s)
└────────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 1. Check Token Expiry            │
    │    If expired: login() {          │
    │    Calls: POST /auth/login        │
    │    }                              │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 2. Fetch Open Incidents          │
    │    GET /incidents/open           │ (incident-service)
    │    Returns: [incident...]        │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 3. For Each Open Incident:       │
    │    - Check if already simulating  │
    │    - Map incident to vehicle:    │
    │      medical→ambulance           │
    │      fire→fire_truck             │
    │      crime/accident→police       │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 4. Get Vehicle Start Position    │
    │    GET /vehicles/{vehicleId}/    │
    │        location                  │ (tracking-service)
    │    Returns: {lat, lng}           │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 5. Generate Path (10 waypoints)  │
    │    From: start_location          │
    │    To: incident_location         │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 6. Animate Movement:             │
    │    For each waypoint {           │
    │      POST /vehicles/{id}/        │
    │          location                │
    │      with new coords             │
    │      sleep(delay_ms)             │
    │    }                              │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 7. On Arrival:                   │
    │    Simulate time at scene        │
    │    Update incident status        │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────────────────┐
    │ 8. Return to Base:               │
    │    Similar animation back to     │
    │    start_location                │
    └──────────────────────────────────┘
```

---

## Message Routing Diagrams

### **RabbitMQ Topic Exchange Pattern**

```
┌─────────────────────────────────────────────────────────┐
│ EXCHANGE: emergency.events (Topic pattern)              │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────────┐
        │                         │
        ▼                         ▼
Publishers:                  Routing Keys:
- incident-service      ┌─ incident.*
- tracking-service      │  ├─ incident.created
- analytics-service     │  ├─ incident.dispatched
                        │  ├─ incident.status.updated
                        │  └─ incident.resolved
                        │
                        ├─ dispatch.*
                        │  └─ dispatch.created
                        │
                        └─ hospital.capacity.*
                           └─ hospital.capacity.updated

        │
        └────────────────────┬──────────────────┐
                             │                  │
                    ┌────────▼────────┐  ┌──────▼───────┐
                    │ Topic Pattern   │  │ Topic Pattern│
                    │ Matching        │  │ Matching     │
                    └────────┬────────┘  └──────┬───────┘
                             │                  │
            ┌────────────────┼──────────────┐   │
            │                │              │   │
            ▼                ▼              ▼   ▼
    [incident.*]      [dispatch.*] [hospital.capacity.*]
            │                │              │
    ┌───────┴────────┐      │              │
    │                │      │              │
    ▼                ▼      ▼              ▼
  Queues:      analytics. track.track.   analy.
  -incident   dispatch    incident.*     capacity
  -dispatch
    │           │       │      │          │
    │           │       │      │          │
    ▼           ▼       ▼      ▼          ▼
 Track.inc   Analytics Track. Analytics Analytics
 Created     Service   Svce   Svce      Svce
             Metrics   Notif
```

### **Service Communication Matrix**

```
                  ┌────┬─────┬──────┬────────┬──────┐
                  │ A  │ Inc │ Track│ Analy  │ Disp │
                  ├────┼─────┼──────┼────────┼──────┤
Auth              │ -  │ JWT │ JWT  │ JWT    │ JWT  │
(Verifies)        │    │ Val │ Val  │ Val    │ Val  │
├────────┬────────┤    │ (1) │ (2)  │ (3)    │ (4)  │
│        │        │    │     │      │        │      │
Incident│ Pub    │ -  │ -   │ RMQ  │ RMQ    │ HTTP │
Service │ Sub    │    │     │ Sub  │ Sub    │ Get  │
        │        │    │     │ (5)  │ (6)    │ (7)  │
├────────┼────────┤────┼─────┼──────┼────────┼──────┤
│        │        │    │     │      │        │      │
Tracking│ Pub    │ -  │ -   │ -    │ RMQ    │ HTTP │
Service │ Sub    │    │     │      │ Sub    │ Post │
        │        │    │     │      │ (8)    │ (9)  │
├────────┼────────┤────┼─────┼──────┼────────┼──────┤
│        │        │    │     │      │        │      │
Analytics│ Pub   │ -  │ -   │ -    │ -      │ N/A  │
Service  │ Sub   │    │     │      │        │      │
         │       │    │     │      │        │      │
├────────┼────────┤────┼─────┼──────┼────────┼──────┤
│        │        │    │     │      │        │      │
Dispatcher│ Pub  │ -  │ HTTP│ HTTP │ N/A    │ -    │
Sim      │ Sub   │    │ Get │ Post │        │      │
         │       │    │ (10)│ (11) │        │      │
└────────┴────────┴────┴─────┴──────┴────────┴──────┘

Communication Legend:
JWT Val  = JWT Token Validation (Middleware Auth)
RMQ Pub  = RabbitMQ Publish (Async Event)
RMQ Sub  = RabbitMQ Subscribe (Async Listener)
HTTP Get = HTTP GET Request
HTTP Post= HTTP POST Request
```

---

## Message Content Examples

### **incident.created Event**

**Triggered:** When new emergency incident submitted  
**Published By:** incident-service  
**Consumed By:** tracking-service, analytics-service

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "incident.created",
  "timestamp": "2026-03-31T14:23:45.123Z",
  "source_service": "incident-service",
  "payload": {
    "incident_id": "INC_20260331_001",
    "incident_type": "medical",
    "latitude": 5.5354,
    "longitude": -0.2279,
    "citizen_name": "John Doe",
    "created_by": "USER_123",
    "status": "created",
    "region": "Greater Accra",
    "created_at": "2026-03-31T14:23:00Z"
  }
}
```

### **dispatch.created Event**

**Triggered:** When responder unit assigned to incident  
**Published By:** incident-service  
**Consumed By:** tracking-service, analytics-service

```json
{
  "event_id": "660e8400-e29b-41d4-a716-446655440001",
  "event_type": "dispatch.created",
  "timestamp": "2026-03-31T14:24:12.456Z",
  "source_service": "incident-service",
  "payload": {
    "incident_id": "INC_20260331_001",
    "vehicle_id": "UNIT_AMB_001",
    "unit_type": "ambulance",
    "station_id": "HOSP_GA_001",
    "incident_lat": 5.5354,
    "incident_lng": -0.2279,
    "dispatched_at": "2026-03-31T14:24:00Z"
  }
}
```

### **incident.resolved Event**

**Triggered:** When incident marked as resolved  
**Published By:** incident-service  
**Consumed By:** tracking-service, analytics-service

```json
{
  "event_id": "770e8400-e29b-41d4-a716-446655440002",
  "event_type": "incident.resolved",
  "timestamp": "2026-03-31T14:45:30.789Z",
  "source_service": "incident-service",
  "payload": {
    "incident_id": "INC_20260331_001",
    "incident_type": "medical",
    "status": "resolved",
    "assigned_unit_id": "UNIT_AMB_001",
    "assigned_unit_type": "ambulance",
    "latitude": 5.5354,
    "longitude": -0.2279,
    "created_at": "2026-03-31T14:23:00Z",
    "dispatched_at": "2026-03-31T14:24:00Z",
    "resolved_at": "2026-03-31T14:45:00Z"
  }
}
```

---

## Error Handling & Reliability

### **Message Acknowledgment**
```javascript
// All RabbitMQ consumers implement acknowledgment:
channel.consume(queue.queue, async (msg) => {
    try {
        // Process message
        channel.ack(msg);  // Success: Remove from queue
    } catch (err) {
        channel.nack(msg, false, true);  // Error: Requeue message
    }
});
```

### **Retry Logic**
- Messages with failures are requeued (parameter: `true`)
- Malformed messages not requeued (parameter: `false`)
- Connection failures trigger automatic reconnect (5s delay)

### **JWT Token Lifecycle**
- **Issued:** On login (15 minutes validity)
- **Refresh:** Automatic when expired (7-day refresh token)
- **Dispatcher:** Checks expiry before each HTTP call, auto-refreshes if needed

---

## Environment Configuration

### **Service URLs (docker-compose.yml)**
```yaml
auth-service:
  ports: [3001:3001]
  DATABASE_URL: postgresql://erp_user:erp_pass@postgres-auth:5432/auth_db

incident-service:
  ports: [3002:3002]
  AUTH_SERVICE_URL: http://auth-service:3001
  TRACKING_SERVICE_URL: http://tracking-service:3003
  RABBITMQ_URL: amqp://erp_user:erp_pass@rabbitmq:5672

tracking-service:
  ports: [3003:3003]
  MONGO_URI: mongodb://erp_user:erp_pass@mongo-tracking:27017/tracking_db
  RABBITMQ_URL: amqp://erp_user:erp_pass@rabbitmq:5672

analytics-service:
  ports: [3004:3004]
  DATABASE_URL: postgresql://erp_user:erp_pass@postgres-analytics:5432/analytics_db
  RABBITMQ_URL: amqp://erp_user:erp_pass@rabbitmq:5672

dispatcher-simulator:
  AUTH_SERVICE_URL: http://auth-service:3001
  INCIDENT_SERVICE_URL: http://incident-service:3002
  TRACKING_SERVICE_URL: http://tracking-service:3003
```

---

## Key Takeaways

1. **RabbitMQ is the backbone** for asynchronous event propagation across services
2. **REST APIs handle synchronous** operations requiring immediate feedback
3. **Topic exchange pattern** allows selective message routing and scalability
4. **JWT authentication** secures all inter-service communication
5. **Automatic reconnection** ensures service resilience
6. **Event sourcing** maintains audit trail of all state changes
7. **Dispatcher simulator** demonstrates the complete workflow for testing

---

**Last Updated:** March 31, 2026  
**Architecture:** Event-Driven Microservices  
**Communication:** RabbitMQ (Async) + REST APIs (Sync)
