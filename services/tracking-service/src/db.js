const mongoose = require('mongoose');
const logger = require('./utils/logger');

async function connectMongo() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        logger.info('Connected to MongoDB (Tracking DB)');
    } catch (err) {
        logger.error('Failed to connect to MongoDB:', err.message);
        throw err;
    }
}

module.exports = { connectMongo };
