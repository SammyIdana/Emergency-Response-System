require('dotenv').config();
const http = require('http');
const { app, setupSocketIo } = require('./app');
const { connectMongo } = require('./db');
const { connectRabbitMQ } = require('./rabbitmq');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3003;

async function start() {
    try {
        await connectMongo();
        await connectRabbitMQ();

        const httpServer = http.createServer(app);
        setupSocketIo(httpServer);

        httpServer.listen(PORT, () => {
            logger.info(`Tracking Service running on port ${PORT}`);
            logger.info(`WebSocket available at ws://localhost:${PORT}/tracking`);
        });
    } catch (err) {
        logger.error('Failed to start Tracking Service:', err);
        process.exit(1);
    }
}

start();
