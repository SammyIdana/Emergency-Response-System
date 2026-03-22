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

---

## 🖥️ Frontend Client (Phase 3)

A web-based admin interface for system administrators and service-specific administrators.

- **Tech:** React, Vite, Tailwind CSS, Leaflet, Recharts, Socket.io Client
- **Key Features:**
  - Login with role-based authentication
  - Incident reporting form with interactive map (OpenStreetMap/Leaflet)
  - Dispatch status dashboard with live incident table
  - Real-time vehicle tracking map (WebSocket-powered)
  - Analytics dashboard (response times, incident trends, top responders)
  - Role-specific views for Hospital, Police, and Fire admins

### Running the Frontend
```bash
cd erp-frontend
npm install --legacy-peer-deps
npm run dev
```
Then open **http://localhost:5173** in your browser.

---

## 🔐 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| System Admin | admin@erp.gh | admin1234 |
| Hospital Admin | hospital@erp.gh | hospital1234 |
| Police Admin | police@erp.gh | police1234 |
| Fire Admin | fire@erp.gh | fire1234 |

---

## 👥 Role-Based Access

| Role | Incidents | Responders | Dispatch |
|------|-----------|------------|---------|
| system_admin | All types | All types | ✅ |
| hospital_admin | Medical only | Ambulance only | ✅ |
| police_admin | Crime + Accident | Police only | ✅ |
| fire_admin | Fire only | Fire only | ✅ |

---

*CPEN 421 — Mobile and Web Software Design and Architecture · University of Ghana · 2026*
