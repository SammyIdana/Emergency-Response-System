# Inter-Service Communication: Code Locations & Implementation Examples

## File Structure & Locations

### RabbitMQ Setup Files
```
services/
├── incident-service/src/rabbitmq.js          ✓ Publisher
├── tracking-service/src/rabbitmq.js          ✓ Subscriber (consumer)
└── analytics-service/src/rabbitmq.js         ✓ Subscriber (consumer)
```

### REST API Route Files
```
services/
├── incident-service/src/routes/incident.routes.js
├── incident-service/src/routes/responder.routes.js
├── tracking-service/src/routes/vehicle.routes.js
├── tracking-service/src/routes/incident.routes.js
└── auth-service/src/routes/auth.routes.js
```

### Controller Implementation Files
```
services/
├── incident-service/src/controllers/incident.controller.js    ✓ Publishing logic
├── incident-service/src/controllers/responder.controller.js
├── tracking-service/src/controllers/vehicle.controller.js     ✓ Publishing logic
└── analytics-service/src/controllers/analytics.controller.js
```

### Dispatcher Simulator
```
services/
└── dispatcher-simulator/dispatcher.js          ✓ HTTP client making calls
```

---

## Code Examples by Communication Type

### 1. Publishing Events to RabbitMQ

#### File: `services/incident-service/src/rabbitmq.js`

```javascript
const amqplib = require('amqplib');
const logger = require('./utils/logger');

const EXCHANGE = 'emergency.events';
let channel = null;
let connection = null;

async function connectRabbitMQ() {
    try {
        // Connect to RabbitMQ
        connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        
        // Declare exchange (createit if not exists)
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        logger.info('Connected to RabbitMQ (Incident Service)');

        // Handle reconnection on error
        connection.on('error', (err) => {
            logger.error('RabbitMQ connection error:', err.message);
            setTimeout(connectRabbitMQ, 5000);
        });
        connection.on('close', () => {
            logger.warn('RabbitMQ connection closed, reconnecting...');
            setTimeout(connectRabbitMQ, 5000);
        });
    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

function publish(routingKey, payload) {
    if (!channel) {
        logger.warn('RabbitMQ channel not ready, skipping publish:', routingKey);
        return;
    }
    
    // Create message envelope
    const envelope = {
        event_id: require('crypto').randomUUID(),
        event_type: routingKey,
        timestamp: new Date().toISOString(),
        source_service: 'incident-service',
        payload,
    };
    
    // Convert to buffer
    const content = Buffer.from(JSON.stringify(envelope));
    
    // Publish to exchange with routing key
    channel.publish(EXCHANGE, routingKey, content, {
        persistent: true,                   // Message survives broker restart
        contentType: 'application/json',
    });
    
    logger.debug(`Published event: ${routingKey}`);
}

module.exports = { connectRabbitMQ, publish };
```

#### Usage Example: `services/incident-service/src/controllers/incident.controller.js`

```javascript
const { publish } = require('../rabbitmq');

async function createIncident(req, res, next) {
    try {
        // ... validate input ...
        
        // Insert incident into database
        const result = await pool.query(
            `INSERT INTO incidents
             (citizen_name, citizen_phone, incident_type, latitude, longitude, ...)
             VALUES ($1,$2,$3::incident_type_enum,$4,$5,...)
             RETURNING *`,
            [citizen_name, citizen_phone, incident_type, latitude, longitude, ...]
        );

        const incident = result.rows[0];

        // 📤 PUBLISH EVENT: incident.created
        publish('incident.created', {
            incident_id: incident.incident_id,
            incident_type: incident.incident_type,
            latitude: parseFloat(incident.latitude),
            longitude: parseFloat(incident.longitude),
            citizen_name: incident.citizen_name,
            created_by: incident.created_by,
            status: incident.status,
            region: incident.region,
            created_at: incident.created_at,
        });

        logger.info(`Incident created: incident_id=${incident.incident_id}`);
        res.status(201).json({ success: true, data: incident });
    } catch (err) {
        next(err);
    }
}

async function updateIncidentStatus(req, res, next) {
    try {
        const { status } = req.body;
        
        const result = await pool.query(
            `UPDATE incidents SET status = $1::incident_status_enum
             WHERE incident_id = $2 RETURNING *`,
            [status, req.params.id]
        );

        const incident = result.rows[0];

        // 📤 PUBLISH EVENT: incident.resolved (when status === 'resolved')
        const routingKey = status === 'resolved' ? 'incident.resolved' : 'incident.status.updated';
        publish(routingKey, {
            incident_id: incident.incident_id,
            incident_type: incident.incident_type,
            status: incident.status,
            assigned_unit_id: incident.assigned_unit_id,
            assigned_unit_type: incident.assigned_unit_type,
            latitude: parseFloat(incident.latitude),
            longitude: parseFloat(incident.longitude),
            created_at: incident.created_at,
            dispatched_at: incident.dispatched_at,
            resolved_at: incident.resolved_at,
        });

        res.json({ success: true, data: incident });
    } catch (err) {
        next(err);
    }
}

async function autoDispatch(req, res, next) {
    try {
        const incidentResult = await pool.query(
            'SELECT * FROM incidents WHERE incident_id = $1',
            [req.params.id]
        );

        const incident = incidentResult.rows[0];
        
        // ... find nearest responder ...
        const primary = dispatched[0].unit;

        // Update incident status
        const updatedResult = await pool.query(
            `UPDATE incidents
             SET assigned_unit_id = $1, assigned_unit_type = $2::responder_type_enum,
                 status = 'dispatched'::incident_status_enum, dispatched_at = NOW()
             WHERE incident_id = $3 RETURNING *`,
            [primary.unit_id, primary.unit_type, incident.incident_id]
        );

        const updatedIncident = updatedResult.rows[0];

        // 📤 PUBLISH EVENT: dispatch.created
        publish('dispatch.created', {
            incident_id: updatedIncident.incident_id,
            vehicle_id: primary.unit_id,
            unit_type: primary.unit_type,
            station_id: primary.hospital_id || primary.unit_id,
            incident_lat: parseFloat(updatedIncident.latitude),
            incident_lng: parseFloat(updatedIncident.longitude),
            dispatched_at: updatedIncident.dispatched_at,
        });

        res.json({ success: true, data: updatedIncident });
    } catch (err) {
        next(err);
    }
}
```

---

### 2. Consuming Events from RabbitMQ

#### File: `services/tracking-service/src/rabbitmq.js`

```javascript
const amqplib = require('amqplib');
const logger = require('./utils/logger');
const { Vehicle } = require('./models/vehicle.model');

const EXCHANGE = 'emergency.events';
let channel = null;
let connection = null;
let ioInstance = null;

function setIo(io) {
    ioInstance = io;
}

async function connectRabbitMQ() {
    try {
        connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        // ─── CONSUMER 1: dispatch.created ───────────────────────────────
        const dispatchQueue = await channel.assertQueue('tracking.dispatch', { durable: true });
        // Bind queue to exchange with routing key pattern
        await channel.bindQueue(dispatchQueue.queue, EXCHANGE, 'dispatch.created');
        
        channel.consume(dispatchQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                // Parse message envelope
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received dispatch.created:', payload);

                // 💾 UPDATE MONGODB: Vehicle
                await Vehicle.findOneAndUpdate(
                    { vehicle_id: payload.vehicle_id },
                    {
                        incident_id: payload.incident_id,
                        status: 'dispatched',
                        updated_at: new Date(),
                    }
                );

                // 📡 EMIT WEBSOCKET EVENT
                if (ioInstance) {
                    ioInstance.emit('dispatch_created', payload);
                }

                // ✅ ACK: Successfully processed
                channel.ack(msg);
            } catch (err) {
                logger.error('Error processing dispatch.created:', err.message);
                // ❌ NACK: Error occurred, requeue message
                channel.nack(msg, false, true);
            }
        });

        // ─── CONSUMER 2: incident.created ───────────────────────────────
        const createdQueue = await channel.assertQueue('tracking.incident.created', { durable: true });
        await channel.bindQueue(createdQueue.queue, EXCHANGE, 'incident.created');
        
        channel.consume(createdQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received incident.created for notification:', payload);

                // 📡 EMIT WEBSOCKET NOTIFICATION
                if (ioInstance) {
                    ioInstance.emit('new_notification', {
                        id: require('crypto').randomUUID(),
                        type: 'incident',
                        title: 'New Emergency Incident',
                        message: `${payload.incident_type.toUpperCase()} reported - ${payload.citizen_name}`,
                        timestamp: new Date().toISOString(),
                        incident_id: payload.incident_id,
                        severity: payload.incident_type === 'fire' || payload.incident_type === 'medical' ? 'high' : 'medium'
                    });
                }
                
                channel.ack(msg);
            } catch (err) {
                logger.error('Error processing incident.created:', err.message);
                channel.nack(msg, false, true);
            }
        });

        // ─── CONSUMER 3: incident.resolved ────────────────────────────────
        const resolvedQueue = await channel.assertQueue('tracking.incident.resolved', { durable: true });
        await channel.bindQueue(resolvedQueue.queue, EXCHANGE, 'incident.resolved');
        
        channel.consume(resolvedQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received incident.resolved:', payload);

                // 💾 UPDATE MONGODB: Free up vehicle
                await Vehicle.findOneAndUpdate(
                    { vehicle_id: payload.assigned_unit_id },
                    {
                        incident_id: null,
                        status: 'idle',
                        updated_at: new Date(),
                    }
                );

                channel.ack(msg);
            } catch (err) {
                logger.error('Error processing incident.resolved:', err.message);
                channel.nack(msg, false, true);
            }
        });

        logger.info('Connected to RabbitMQ (Tracking Service)');

        connection.on('error', (err) => {
            logger.error('RabbitMQ connection error:', err.message);
            setTimeout(connectRabbitMQ, 5000);
        });
        connection.on('close', () => {
            logger.warn('RabbitMQ connection closed');
            setTimeout(connectRabbitMQ, 5000);
        });

    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

module.exports = { connectRabbitMQ, setIo };
```

#### File: `services/analytics-service/src/rabbitmq.js`

```javascript
const amqplib = require('amqplib');
const logger = require('./utils/logger');
const { pool } = require('./db');

const EXCHANGE = 'emergency.events';

async function connectRabbitMQ() {
    try {
        const connection = await amqplib.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        // ─── CONSUMER 1: Analytics - Incident Events ───────────────────
        const incQ = await channel.assertQueue('analytics.incidents', { durable: true });
        // Pattern matching: incident.* matches incident.created, incident.dispatched, etc.
        await channel.bindQueue(incQ.queue, EXCHANGE, 'incident.*');

        channel.consume(incQ.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { event_type, payload } = envelope;
                
                // Route to appropriate handler based on event type
                await handleIncidentEvent(event_type, payload);
                channel.ack(msg);
            } catch (err) {
                logger.error('analytics.incidents consumer error:', err.message);
                // Don't requeue malformed messages
                channel.nack(msg, false, false);
            }
        });

        // ─── CONSUMER 2: Analytics - Dispatch Events ───────────────────
        const dispQ = await channel.assertQueue('analytics.dispatch', { durable: true });
        await channel.bindQueue(dispQ.queue, EXCHANGE, 'dispatch.*');

        channel.consume(dispQ.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { event_type, payload } = envelope;
                await handleDispatchEvent(event_type, payload);
                channel.ack(msg);
            } catch (err) {
                logger.error('analytics.dispatch consumer error:', err.message);
                channel.nack(msg, false, false);
            }
        });

        // ─── CONSUMER 3: Analytics - Capacity Events ───────────────────
        const capQ = await channel.assertQueue('analytics.capacity', { durable: true });
        await channel.bindQueue(capQ.queue, EXCHANGE, 'hospital.capacity.*');

        channel.consume(capQ.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                await handleCapacityEvent(envelope.payload);
                channel.ack(msg);
            } catch (err) {
                logger.error('analytics.capacity consumer error:', err.message);
                channel.nack(msg, false, false);
            }
        });

        logger.info('Connected to RabbitMQ (Analytics Service)');

    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

// Event handler functions
async function handleIncidentEvent(eventType, payload) {
    logger.debug(`Handling event: ${eventType} for incident: ${payload.incident_id}`);
    
    switch(eventType) {
        case 'incident.created':
            // Record creation timestamp
            await pool.query(
                'INSERT INTO incident_metrics (incident_id, created_at) VALUES ($1, $2)',
                [payload.incident_id, new Date(payload.created_at)]
            );
            break;
            
        case 'incident.dispatched':
            // Record dispatch time
            await pool.query(
                'UPDATE incident_metrics SET dispatched_at = NOW() WHERE incident_id = $1',
                [payload.incident_id]
            );
            break;
            
        case 'incident.resolved':
            // Calculate response time
            const result = await pool.query(
                'SELECT created_at FROM incident_metrics WHERE incident_id = $1',
                [payload.incident_id]
            );
            if (result.rows.length) {
                const responseTime = new Date() - new Date(result.rows[0].created_at);
                await pool.query(
                    'UPDATE incident_metrics SET resolved_at = NOW(), response_time_ms = $1 WHERE incident_id = $2',
                    [responseTime, payload.incident_id]
                );
            }
            break;
    }
}

async function handleDispatchEvent(eventType, payload) {
    logger.debug(`Handling dispatch event: ${eventType}`);
    // Record dispatch metrics (vehicle allocation, availability, etc.)
}

async function handleCapacityEvent(payload) {
    logger.debug('Handling capacity event');
    // Update hospital capacity metrics
}

module.exports = { connectRabbitMQ };
```

---

### 3. REST API Communication

#### File: `services/incident-service/src/controllers/incident.controller.js`

```javascript
// When resolving incident, call tracking-service to snap vehicle to base
async function updateIncidentStatus(req, res, next) {
    try {
        const { status } = req.body;
        
        const result = await pool.query(
            `UPDATE incidents SET status = $1::incident_status_enum
             WHERE incident_id = $2 RETURNING *`,
            [status, req.params.id]
        );

        const incident = result.rows[0];

        // 🔗 REST CALL: incident-service → tracking-service
        if (status === 'resolved' && incident.assigned_unit_id) {
            const unitResult = await pool.query(
                'UPDATE responder_units SET is_available = TRUE WHERE unit_id = $1 RETURNING *',
                [incident.assigned_unit_id]
            );

            if (unitResult.rows.length) {
                const unit = unitResult.rows[0];
                try {
                    const axios = require('axios');
                    const trackingUrl = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';
                    
                    // 📤 POST to tracking-service
                    await axios.post(`${trackingUrl}/vehicles/${unit.unit_id}/location`, {
                        latitude: parseFloat(unit.latitude),
                        longitude: parseFloat(unit.longitude),
                        status: 'idle'
                    }, {
                        headers: { 
                            Authorization: req.headers.authorization 
                        }
                    });
                    
                    logger.info(`Vehicle ${unit.unit_id} snapped to base`);
                } catch (err) {
                    logger.error(`Snap error: ${err.message}`);
                }
            }
        }

        // Also publish event for async processing
        publish(routingKey, { /* payload */ });

        res.json({ success: true, data: incident });
    } catch (err) {
        next(err);
    }
}
```

#### File: `services/dispatcher-simulator/dispatcher.js`

```javascript
const BASE_AUTH = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const BASE_INCIDENT = process.env.INCIDENT_SERVICE_URL || 'http://incident-service:3002';
const BASE_TRACKING = process.env.TRACKING_SERVICE_URL || 'http://tracking-service:3003';

let token = null;
let tokenExpiry = 0;

// 🔗 REST CALL: dispatcher-simulator → auth-service
async function login() {
    try {
        const res = await fetch(`${BASE_AUTH}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: 'admin@erp.gh', 
                password: 'admin1234' 
            })
        });
        
        const data = await res.json();
        if (data.success) {
            token = data.data.access_token;
            tokenExpiry = Date.now() + 12 * 60 * 1000;
            console.log('✅ Logged in as', data.data.user.name);
            return true;
        } else {
            console.error('❌ Login failed:', data.message);
            return false;
        }
    } catch (err) {
        console.error('❌ Login error:', err.message);
        return false;
    }
}

async function getHeaders() {
    // Refresh token if expired
    if (Date.now() > tokenExpiry) {
        const success = await login();
        if (!success) throw new Error('Failed to refresh token');
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// 🔗 REST CALL: dispatcher-simulator → incident-service
async function getOpenIncidents() {
    try {
        const res = await fetch(`${BASE_INCIDENT}/incidents/open`, {
            headers: await getHeaders()
        });
        
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (err) {
        console.error('Error fetching incidents:', err.message);
        return [];
    }
}

// 🔗 REST CALL: dispatcher-simulator → tracking-service
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
                    return { latitude: lat, longitude: lng };
                }
            }
        }
        
        // Fallback to default starting position
        return getFallbackPosition(vehicleType);
    } catch (err) {
        console.error('Error getting vehicle position:', err.message);
        return getFallbackPosition(vehicleType);
    }
}

// 🔗 REST CALL: dispatcher-simulator → tracking-service (animated updates)
async function updateVehicleLocation(vehicleId, latitude, longitude) {
    try {
        const res = await fetch(`${BASE_TRACKING}/vehicles/${vehicleId}/location`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify({
                latitude,
                longitude,
                timestamp: new Date().toISOString()
            })
        });
        
        if (res.ok) {
            console.log(`✓ Updated location for ${vehicleId}`);
            return true;
        } else {
            console.error(`✗ Failed to update location for ${vehicleId}`);
            return false;
        }
    } catch (err) {
        console.error('Error updating location:', err.message);
        return false;
    }
}

// Main simulation loop
async function simulateDispatch() {
    // 1. Get open incidents
    const incidents = await getOpenIncidents();
    
    for (const incident of incidents) {
        // Skip if already simulating
        if (simulatedIncidents.has(incident.incident_id)) continue;
        
        simulatedIncidents.add(incident.incident_id);
        
        // 2. Map incident type to vehicle type
        const vehicleType = INCIDENT_TO_VEHICLE[incident.incident_type];
        const vehicles = await getAvailableVehicles(vehicleType);
        
        if (!vehicles.length) continue;
        
        const vehicle = vehicles[0];
        
        // 3. Get current position
        const startPos = await getVehiclePosition(vehicle.vehicle_id, vehicleType);
        
        // 4. Generate path
        const path = generatePath(startPos, {
            latitude: incident.latitude,
            longitude: incident.longitude
        });
        
        // 5. Animate movement
        for (const waypoint of path) {
            await updateVehicleLocation(
                vehicle.vehicle_id,
                waypoint.latitude,
                waypoint.longitude
            );
            await sleep(2000); // 2 second delay between updates
        }
        
        // 6. Simulate time at scene
        await sleep(5000);
        
        // 7. Return to base
        const returnPath = generatePath(
            { latitude: incident.latitude, longitude: incident.longitude },
            startPos
        );
        
        for (const waypoint of returnPath) {
            await updateVehicleLocation(
                vehicle.vehicle_id,
                waypoint.latitude,
                waypoint.longitude
            );
            await sleep(2000);
        }
        
        simulatedIncidents.delete(incident.incident_id);
    }
}

// Run simulation loop every 30 seconds
setInterval(simulateDispatch, 30000);
```

---

### 4. Route Handlers

#### File: `services/incident-service/src/routes/incident.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/incident.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// 📤 POST /incidents - Create incident (triggers RabbitMQ publish)
router.post('/', authenticate, authorize('system_admin'), ctrl.createIncident);

// 📋 GET /incidents - List incidents
router.get('/', authenticate, ctrl.listIncidents);

// 📋 GET /incidents/open - List open incidents (used by dispatcher)
router.get('/open', authenticate, ctrl.listOpenIncidents);

// 📘 GET /incidents/:id - Get incident details
router.get('/:id', authenticate, ctrl.getIncident);

// ✏️ PUT /incidents/:id/status - Update status (triggers RabbitMQ publish + REST call)
router.put('/:id/status', authenticate, ctrl.updateIncidentStatus);

// 🎯 PUT /incidents/:id/assign - Assign responder (triggers RabbitMQ publish)
router.put('/:id/assign', authenticate, ctrl.assignResponder);

module.exports = router;
```

#### File: `services/tracking-service/src/routes/vehicle.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vehicle.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// 📝 POST /vehicles/register - Register vehicle
router.post('/register', authenticate, authorize('system_admin'), ctrl.registerVehicle);

// 📋 GET /vehicles - List vehicles
router.get('/', authenticate, ctrl.listVehicles);

// 📘 GET /vehicles/:id - Get vehicle details
router.get('/:id', authenticate, ctrl.getVehicle);

// 📍 GET /vehicles/:id/location - Get current location (called by dispatcher)
router.get('/:id/location', authenticate, ctrl.getVehicleLocation);

// 📍 POST /vehicles/:id/location - Update location (called by dispatcher for animation)
router.post('/:id/location', authenticate, ctrl.updateVehicleLocation);

// 📊 GET /vehicles/:id/history - Get location history
router.get('/:id/history', authenticate, ctrl.getVehicleLocationHistory);

module.exports = router;
```

---

## Initialization & Startup

### File: `services/incident-service/src/server.js`

```javascript
const app = require('./app');
const { connectRabbitMQ } = require('./rabbitmq');
const { pool } = require('./db');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3002;

async function startServer() {
    try {
        // 1. Connect to PostgreSQL database
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        logger.info('✓ Connected to PostgreSQL');

        // 2. Connect to RabbitMQ message broker
        await connectRabbitMQ();
        logger.info('✓ Connected to RabbitMQ');

        // 3. Start Express server
        app.listen(PORT, () => {
            logger.info(`✓ Incident Service running on port ${PORT}`);
        });
    } catch (err) {
        logger.error('Server startup error:', err);
        process.exit(1);
    }
}

startServer();
```

### File: `services/tracking-service/src/server.js`

```javascript
const app = require('./app');
const { connectRabbitMQ, setIo } = require('./rabbitmq');
const { connect: connectMongo } = require('./db');
const logger = require('./utils/logger');
const http = require('http');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 3003;

async function startServer() {
    try {
        // 1. Connect to MongoDB
        await connectMongo();
        logger.info('✓ Connected to MongoDB');

        // 2. Create HTTP server with Socket.IO
        const server = http.createServer(app);
        const io = socketIo(server, {
            cors: {
                origin: ['http://localhost:5173', 'http://localhost:3000'],
                methods: ['GET', 'POST']
            }
        });

        // Pass io instance to RabbitMQ consumer for WebSocket emissions
        setIo(io);

        // 3. Connect to RabbitMQ
        await connectRabbitMQ();
        logger.info('✓ Connected to RabbitMQ');

        // 4. Socket.IO connection handler
        io.on('connection', (socket) => {
            logger.info(`WebSocket client connected: ${socket.id}`);
            
            socket.on('disconnect', () => {
                logger.info(`WebSocket client disconnected: ${socket.id}`);
            });
        });

        // 5. Start HTTP server
        server.listen(PORT, () => {
            logger.info(`✓ Tracking Service running on port ${PORT}`);
        });
    } catch (err) {
        logger.error('Server startup error:', err);
        process.exit(1);
    }
}

startServer();
```

---

## Testing Communications

### Test Publishing (curl)
```bash
# Get JWT token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@erp.gh","password":"admin1234"}'

# Create incident (triggers publish)
curl -X POST http://localhost:3002/incidents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "citizen_name": "Test User",
    "incident_type": "medical",
    "latitude": 5.5354,
    "longitude": -0.2279
  }'
```

### Test Consumer (RabbitMQ UI)
```
Navigate to: http://localhost:15672
Username: erp_user
Password: erp_pass

Go to:
- Queues tab to see queue messages
- Channels tab to see consumer activity
- Exchanges tab to view emergency.events exchange
```

### View Service Logs
```bash
# Incident service logs
docker logs erp-incident-service -f --tail=100

# Tracking service logs  
docker logs erp-tracking-service -f --tail=100

# Analytics service logs
docker logs erp-analytics-service -f --tail=100
```

---

**Last Updated:** March 31, 2026
