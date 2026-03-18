require('dotenv').config();
const app = require('./app');
const { connectDB, syncDB } = require('./db');
const { connectRabbitMQ } = require('./rabbitmq');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3004;

async function start() {
    try {
        await connectDB();
        await syncDB();
        await connectRabbitMQ();
        app.listen(PORT, () => {
            logger.info(`Analytics Service running on port ${PORT}`);
        });
    } catch (err) {
        logger.error('Failed to start Analytics Service:', err);
        process.exit(1);
    }
}

start();
