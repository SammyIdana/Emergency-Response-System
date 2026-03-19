# Emergency Response Platform - Backend Architecture

A distributed microservices-based system simulating a national emergency response and dispatch coordination platform.

---

## 🏗️ System Architecture

The project consists of four independently deployable microservices that communicate asynchronously via RabbitMQ and synchronously through REST APIs.

### 1. Identity & Authentication Service
Manages secure user registration, token generation, and role-based access control.
- **Tech:** Node.js, Express, JWT, bcryptjs
- **Database:** PostgreSQL (`auth_db`)
- **Key Features:** User registration, Login (access & refresh tokens), Profile management, Token validation for downstream services.

### 2. Emergency Incident Service
Orchestrates emergency reports, geolocates incidents, and acts as the brain for dispatching the nearest responders.
- **Tech:** Node.js, Express, PostgreSQL
- **Database:** PostgreSQL (`incident_db`)
- **Key Features:** Report incidents (`medical`, `fire`, `crime`, etc.), Track incident statuses, Autonomously dispatch the closest responders using the Haversine formula based on incident requirements.

### 3. Dispatch Tracking Service
Handles high-volume, real-time GPS synchronization and responder statuses.
- **Tech:** Node.js, Express, Socket.io
- **Database:** MongoDB (`tracking_db`), designed for fast, unstructured GPS history ingestion.
- **Key Features:** Live WebSocket connections streams (`/tracking`), real-time vehicle location pinning, GPS historical trailing, active dispatch status syncing.

### 4. Analytics & Monitoring Service
Consumes asynchronous global events to generate historical metrics and systemic performance tracking.
- **Tech:** Node.js, Express, PostgreSQL
- **Database:** PostgreSQL (`analytics_db`)
- **Key Features:** Average response & resolution times, regional heat-mapping computations, hospital capacity snapshots, fleet utilization trends.

---

## ⚡ Inter-Service Communication

To guarantee failover resilience and decoupled scaling, the system leverages loosely-coupled asynchronous events:
- **Message Broker:** RabbitMQ
- **Routing:** Topic Exchange (`emergency.events`)
- **Event Examples:** `incident.created`, `incident.dispatched`, `dispatch.vehicle.location`.
*Example: When Incident Service dispatches an ambulance, it fires an event. The Analytics service observes it to begin tracking deployment durations, while the Tracking Service acknowledges it to map the ambulance destination.*

---

## 🚀 Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

### Running the System
The entire platform, including all 4 microservices, 3 PostgreSQL instances, 1 MongoDB replica, and the RabbitMQ broker, can be booted with a single command:

```bash
docker compose up --build
```

### Development Ports:
- **Auth Service:** `http://localhost:3001`
- **Incident Service:** `http://localhost:3002`
- **Tracking Service & WebSockets:** `ws://localhost:3003` & `http://localhost:3003`
- **Analytics Service:** `http://localhost:3004`
- **RabbitMQ Management Dashboard:** `http://localhost:15672` (User: `erp_user` / Pass: `erp_pass`)

---

## 📚 API Guidelines

For a comprehensive interface list, Swagger documentation has been configured. Once the services are running, you can access the interactive Swagger maps at:
- Auth: `http://localhost:3001/api-docs`
- Incident: `http://localhost:3002/api-docs`
- Tracking: `http://localhost:3003/api-docs`
- Analytics: `http://localhost:3004/api-docs`

Every private route requires an `Authorization: Bearer <token>` header, fetched via `/auth/login`.
