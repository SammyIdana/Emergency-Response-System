# Phase 2: Backend Implementation — Walkthrough

## What Was Built

The complete backend for the **Emergency Response and Dispatch Coordination Platform** — a distributed microservices system for Ghana's national emergency services.

## Project Structure

```
Emergency Response Platform/
├── docker-compose.yml          # Orchestrates all services + databases + RabbitMQ
├── README.md
└── services/
    ├── auth-service/           # MS1 — Port 3001 (PostgreSQL)
    ├── incident-service/       # MS2 — Port 3002 (PostgreSQL)
    ├── tracking-service/       # MS3 — Port 3003 (MongoDB + WebSocket)
    └── analytics-service/      # MS4 — Port 3004 (PostgreSQL)
```

Each service has: [Dockerfile](file:///c:/Users/user/Desktop/Emergency%20Response%20Platform/services/auth-service/Dockerfile), [.env.example](file:///c:/Users/user/Desktop/Emergency%20Response%20Platform/services/auth-service/.env.example), `.dockerignore`, [package.json](file:///c:/Users/user/Desktop/Emergency%20Response%20Platform/services/auth-service/package.json), and full `src/` implementation.

---

## How To Run

```bash
cd "Emergency Response Platform"
docker-compose up --build
```

All services + databases spin up automatically. On first boot:
- PostgreSQL schemas are created automatically via [syncDB()](file:///c:/Users/user/Desktop/Emergency%20Response%20Platform/services/auth-service/src/db.js#22-68)
- MongoDB collections and TTL indexes are set up via Mongoose
- RabbitMQ `emergency.events` topic exchange is asserted and queues bound

---

## Microservice 1 — Auth Service (Port 3001)

**Database**: PostgreSQL — `auth_db`

**Tables**: `users`, `refresh_tokens`

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /auth/register` | No | Register; returns access + refresh tokens |
| `POST /auth/login` | No | Login; returns access + refresh tokens |
| `POST /auth/refresh-token` | No | Rotate refresh token, issue new access token |
| `POST /auth/logout` | Yes | Revoke refresh token |
| `GET /auth/profile` | Yes | Get authenticated user profile |
| `PUT /auth/profile` | Yes | Update name or password |
| `GET /auth/users` | Admin only | List all users |
| `PUT /auth/users/:id/deactivate` | Admin only | Deactivate account |
| `GET /auth/validate` | Yes | Internal token validation (used by other services) |

**Key design decisions:**
- Refresh tokens are stored as SHA-256 hashes (not plaintext) — token rotation on each use
- bcrypt with cost factor 12 for password hashing
- `user_role` PostgreSQL ENUM enforces valid roles

---

## Microservice 2 — Incident Service (Port 3002)

**Database**: PostgreSQL — `incident_db`

**Tables**: `incidents`, `responder_units`

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /incidents` | system_admin | Create incident |
| `GET /incidents` | Yes | List with filters (status, type, page/limit) |
| `GET /incidents/open` | Yes | All active incidents |
| `GET /incidents/:id` | Yes | Get by ID |
| `PUT /incidents/:id/status` | Yes | Update status + auto-free unit on resolve |
| `PUT /incidents/:id/assign` | system_admin | Manual responder assignment |
| `POST /incidents/:id/dispatch` | system_admin | **Auto-dispatch** via Haversine nearest search |
| `GET /responders` | Yes | List all responder units |
| `GET /responders/nearest` | Yes | Ranked nearest available responders |
| `POST /responders` | Admin | Register hospital/police/fire unit |
| `PUT /responders/:id` | Admin | Update availability/capacity |

**Dispatch Algorithm** (Haversine):
1. Filter by `incident_type → responder_type` mapping
2. Filter `is_available = true`
3. Medical: also check `available_beds > 0`
4. Rank by distance, select nearest
5. Mark unit unavailable, publish `dispatch.created` + `incident.dispatched`

**RabbitMQ Events Published**:
- `incident.created` → on new incident
- `incident.dispatched` → on assignment
- `incident.status.updated` → on status change
- `incident.resolved` → on resolution (also frees unit)
- `dispatch.created` → triggers Tracking Service
- `hospital.capacity.updated` → on responder capacity update

---

## Microservice 3 — Tracking Service (Port 3003)

**Database**: MongoDB — `tracking_db`

**Collections**: `vehicles`, `locationhistories` (TTL index: auto-delete after 30 days)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /vehicles/register` | Admin | Register vehicle |
| `GET /vehicles` | Yes | List all (filterable) |
| `GET /vehicles/:id` | Yes | Get vehicle |
| `GET /vehicles/:id/location` | Yes | Current GPS |
| `POST /vehicles/:id/location` | Yes | **GPS update** (broadcast via WebSocket) |
| `GET /vehicles/:id/history` | Yes | Location history with time range |
| `PUT /vehicles/:id/status` | Yes | Status update; `on_scene` publishes arrived event |
| `GET /incidents/:incidentId/vehicle` | Yes | Vehicle for incident |

**WebSocket** (`ws://localhost:3003/tracking`):
- JWT authenticated via `?token=...` query param
- Incident rooms: `socket.emit('join_incident', id)` → targeted updates
- Events emitted: `vehicle_location_update`, `vehicle_status_update`, `dispatch_created`

**RabbitMQ**:
- Consumes `dispatch.created` → updates vehicle to `dispatched` status
- Publishes `dispatch.vehicle.location` on each GPS update
- Publishes `dispatch.vehicle.arrived` when status → `on_scene`

---

## Microservice 4 — Analytics Service (Port 3004)

**Database**: PostgreSQL — `analytics_db`

**Tables**: `incident_analytics`, `resource_utilization`, `hospital_capacity_snapshots`

| Endpoint | Description |
|----------|-------------|
| `GET /analytics/response-times` | Avg dispatch/response/resolution times by type |
| `GET /analytics/incidents-by-region` | Count by region and type |
| `GET /analytics/resource-utilization` | Deployment frequency and duration per unit |
| `GET /analytics/hospital-capacity` | Historical bed/ambulance snapshots |
| `GET /analytics/top-responders` | Top 10 most deployed units |
| `GET /analytics/incident-trends` | Time-series volume (day/week/month) |
| `GET /analytics/dashboard-summary` | 30-day summary for admin dashboard |

**RabbitMQ Consumers** (event-driven data ingestion):
- `analytics.incidents` (binding: `incident.*`) — computes dispatch_time_seconds on `incident.dispatched`, resolution metrics on `incident.resolved`
- `analytics.dispatch` (binding: `dispatch.*`) — logs dispatch events
- `analytics.capacity` (binding: `hospital.capacity.*`) — inserts capacity snapshots

---

## Infrastructure

| Component | Technology | Port |
|-----------|-----------|------|
| Auth DB | PostgreSQL 15 | 5433 |
| Incident DB | PostgreSQL 15 | 5434 |
| Analytics DB | PostgreSQL 15 | 5435 |
| Tracking DB | MongoDB 7 | 27018 |
| Message Broker | RabbitMQ 3.12 | 5672 |
| RabbitMQ UI | RabbitMQ Management | 15672 |

**Credentials** (development): `erp_user` / `erp_pass`

**Swagger Docs** available at `/api-docs` on each service port.

---

## Validation & Automated Testing

To test the system after startup:

```bash
# 1. Register a system admin
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Kwame Mensah","email":"admin@erp.gh","password":"admin1234","role":"system_admin"}'

# 2. Register a responder unit (police station in Accra)
curl -X POST http://localhost:3002/responders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"unit_type":"police","name":"Accra Central Police","latitude":5.5502,"longitude":-0.2174}'

# 3. Create an incident
curl -X POST http://localhost:3002/incidents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"citizen_name":"Ama Owusu","incident_type":"crime","latitude":5.5600,"longitude":-0.2050,"notes":"Armed robbery at market"}'

# 4. Auto-dispatch nearest responder
curl -X POST http://localhost:3002/incidents/<id>/dispatch \
  -H "Authorization: Bearer <token>"

# 5. Check analytics
curl http://localhost:3004/analytics/dashboard-summary \
  -H "Authorization: Bearer <token>"
```
