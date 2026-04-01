const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const vehicleRoutes = require('./routes/vehicle.routes');
const incidentRoutes = require('./routes/incident.routes');
const { setIo: setControllerIo } = require('./controllers/vehicle.controller');
const { setIo: setRabbitIo } = require('./rabbitmq');
const logger = require('./utils/logger');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/vehicles', vehicleRoutes);
app.use('/incidents', incidentRoutes);

app.get('/health', (req, res) => {
    res.json({ success: true, service: 'tracking-service', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
    logger.error(err.stack || err.message);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

function setupSocketIo(httpServer) {
    const { Server } = require('socket.io');
    const io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        path: '/tracking',
    });

    io.use((socket, next) => {
        const token = socket.handshake.query.token || socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication required'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        logger.info(`WebSocket client connected: ${socket.id} (user: ${socket.user?.email})`);

        socket.on('join_incident', (incidentId) => {
            socket.join(`incident:${incidentId}`);
            logger.debug(`Socket ${socket.id} joined incident room: ${incidentId}`);
        });

        socket.on('leave_incident', (incidentId) => {
            socket.leave(`incident:${incidentId}`);
        });

        socket.on('disconnect', () => {
            logger.info(`WebSocket client disconnected: ${socket.id}`);
        });
    });

    setControllerIo(io);
    setRabbitIo(io);

    return io;
}

module.exports = { app, setupSocketIo };
