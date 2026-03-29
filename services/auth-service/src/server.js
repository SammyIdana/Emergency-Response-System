require('dotenv').config();
console.log('DATABASE_URL =', process.env.DATABASE_URL);

const app = require('./app');
const { connectDB, syncDB } = require('./db');
const logger = require('./utils/logger');


const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectDB();
    await syncDB();
    app.listen(PORT, () => {
      logger.info(`Auth Service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start Auth Service:', err);
    process.exit(1);
  }
}

start();
