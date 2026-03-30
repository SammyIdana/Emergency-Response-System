# Dispatcher Simulator Service

This service automatically simulates emergency vehicle dispatch responses. When incidents are created and auto-dispatched, this service:

1. Monitors for new dispatches every 5 seconds
2. Retrieves the assigned vehicle/responder
3. Simulates vehicle movement from base location to incident scene
4. Updates vehicle status through the tracking service
5. Broadcasts location updates via WebSocket to all connected clients
6. After simulating on-scene time, resolves the incident
7. Simulates return journey to base

## How It Works

- **Auto-Discovery**: Continuously polls the incident service for incidents with `status=dispatched`
- **Vehicle Tracking**: Updates vehicle location, status, and location history in the tracking service
- **Real-Time Updates**: All location and status changes are broadcast via WebSocket
- **Smart Vehicle Management**: Automatically creates vehicles in the tracking service if they don't exist

## Configuration

The service respects these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | Auth service endpoint |
| `INCIDENT_SERVICE_URL` | `http://incident-service:3002` | Incident service endpoint |
| `TRACKING_SERVICE_URL` | `http://tracking-service:3003` | Tracking service endpoint |

## Running Locally

```bash
cd services/dispatcher-simulator
npm install
node dispatcher.js
```

## Running in Docker

The service is automatically included in the Docker Compose setup:

```bash
docker-compose up --build
```

## Troubleshooting

- **Vehicles don't move**: Ensure the simulator service is running and has access to all backend services
- **Incidents not resolving**: Check that the tracking service is responding to vehicle location updates
- **WebSocket not updating**: Verify frontend is connected to tracking service WebSocket

## Architecture

```
New Incident Created
    ↓
autoDispatch() - Selects responder, sets status to 'dispatched'
    ↓
Dispatcher Simulator polls incidents with status='dispatched'
    ↓
Simulates vehicle movement with status updates
    ↓
Tracking Service broadcasts WebSocket events
    ↓
Frontend receives real-time location updates
    ↓
After simulation, incident marked as 'resolved'
```
