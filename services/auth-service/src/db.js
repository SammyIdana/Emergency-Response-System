const { Pool } = require('pg');
const logger = require('./utils/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function connectDB() {
    try {
        const client = await pool.connect();
        logger.info('Connected to PostgreSQL (Auth DB)');
        client.release();
    } catch (err) {
        logger.error('Failed to connect to PostgreSQL:', err.message);
        throw err;
    }
}

async function syncDB() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TYPE user_role AS ENUM (
        'system_admin', 'hospital_admin', 'police_admin', 'fire_admin', 'ambulance_driver'
      );

      CREATE TABLE IF NOT EXISTS users (
        user_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(150) NOT NULL,
        email       VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role        user_role   NOT NULL,
        is_active   BOOLEAN     DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token_hash  VARCHAR(512) NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        revoked     BOOLEAN     DEFAULT FALSE
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
        logger.info('Auth DB schema synced successfully');
    } catch (err) {
        // ENUM may already exist — ignore that specific error
        if (err.code === '42710') {
            logger.info('ENUM type already exists, skipping...');
        } else {
            logger.error('DB sync error:', err.message);
            throw err;
        }
    } finally {
        client.release();
    }
}

module.exports = { pool, connectDB, syncDB };
