const { Pool } = require('pg');
const logger = require('./utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function connectDB() {
  const client = await pool.connect();
  logger.info('Connected to PostgreSQL (Incident DB)');
  client.release();
}

async function syncDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      DO $$ BEGIN
        CREATE TYPE incident_type_enum AS ENUM ('medical','fire','crime','accident','other');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE incident_status_enum AS ENUM ('created','dispatched','in_progress','resolved');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE responder_type_enum AS ENUM ('police','ambulance','fire');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS incidents (
        incident_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        citizen_name      VARCHAR(150)  NOT NULL,
        citizen_phone     VARCHAR(20),
        incident_type     incident_type_enum NOT NULL,
        latitude          DECIMAL(10,7) NOT NULL,
        longitude         DECIMAL(10,7) NOT NULL,
        location_address  TEXT,
        notes             TEXT,
        status            incident_status_enum NOT NULL DEFAULT 'created',
        created_by        UUID          NOT NULL,
        assigned_unit_id  UUID,
        assigned_unit_type responder_type_enum,
        dispatched_at     TIMESTAMPTZ,
        resolved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS responder_units (
        unit_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        unit_type     responder_type_enum NOT NULL,
        name          VARCHAR(200)  NOT NULL,
        latitude      DECIMAL(10,7) NOT NULL,
        longitude     DECIMAL(10,7) NOT NULL,
        is_available  BOOLEAN       DEFAULT TRUE,
        hospital_id   UUID,
        hospital_name VARCHAR(200),
        available_beds INTEGER       DEFAULT 0,
        total_beds    INTEGER       DEFAULT 0,
        last_synced_at TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Add region column if it doesn't exist
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS region VARCHAR(100);

      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
      CREATE INDEX IF NOT EXISTS idx_incidents_created_by ON incidents(created_by);
      CREATE INDEX IF NOT EXISTS idx_responders_type ON responder_units(unit_type);
      CREATE INDEX IF NOT EXISTS idx_responders_available ON responder_units(is_available);
      
    `);
    logger.info('Incident DB schema synced');
  } finally {
    client.release();
  }
}

module.exports = { pool, connectDB, syncDB };