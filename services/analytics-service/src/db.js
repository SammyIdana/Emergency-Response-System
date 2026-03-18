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
    logger.info('Connected to PostgreSQL (Analytics DB)');
    client.release();
}

async function syncDB() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS incident_analytics (
        record_id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id             UUID          NOT NULL UNIQUE,
        incident_type           VARCHAR(50)   NOT NULL,
        region                  VARCHAR(150),
        latitude                DECIMAL(10,7) NOT NULL,
        longitude               DECIMAL(10,7) NOT NULL,
        unit_type               VARCHAR(50),
        assigned_unit_id        UUID,
        dispatch_time_seconds   INTEGER,
        response_time_seconds   INTEGER,
        resolution_time_seconds INTEGER,
        status                  VARCHAR(30)   NOT NULL DEFAULT 'created',
        created_at              TIMESTAMPTZ   NOT NULL,
        dispatched_at           TIMESTAMPTZ,
        resolved_at             TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS resource_utilization (
        record_id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        unit_id                     UUID          NOT NULL,
        unit_type                   VARCHAR(50)   NOT NULL,
        station_name                VARCHAR(200)  NOT NULL DEFAULT 'Unknown',
        incident_id                 UUID          NOT NULL,
        deployed_at                 TIMESTAMPTZ   NOT NULL,
        returned_at                 TIMESTAMPTZ,
        deployment_duration_seconds INTEGER
      );

      CREATE TABLE IF NOT EXISTS hospital_capacity_snapshots (
        snapshot_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        hospital_id           UUID          NOT NULL,
        hospital_name         VARCHAR(200)  NOT NULL,
        total_beds            INTEGER       NOT NULL DEFAULT 0,
        available_beds        INTEGER       NOT NULL DEFAULT 0,
        ambulances_total      INTEGER       NOT NULL DEFAULT 0,
        ambulances_available  INTEGER       NOT NULL DEFAULT 0,
        snapshotted_at        TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ia_incident_type ON incident_analytics(incident_type);
      CREATE INDEX IF NOT EXISTS idx_ia_status ON incident_analytics(status);
      CREATE INDEX IF NOT EXISTS idx_ia_created_at ON incident_analytics(created_at);
      CREATE INDEX IF NOT EXISTS idx_ru_unit_id ON resource_utilization(unit_id);
      CREATE INDEX IF NOT EXISTS idx_hcs_hospital_id ON hospital_capacity_snapshots(hospital_id);
    `);
        logger.info('Analytics DB schema synced');
    } finally {
        client.release();
    }
}

module.exports = { pool, connectDB, syncDB };
