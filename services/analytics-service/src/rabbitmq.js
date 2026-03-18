const amqplib = require('amqplib');
const logger = require('./utils/logger');
const { pool } = require('./db');

const EXCHANGE = 'emergency.events';

async function connectRabbitMQ() {
    try {
        const connection = await amqplib.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        // ─── Queue: analytics.incidents ───────────────────────────────────
        const incQ = await channel.assertQueue('analytics.incidents', { durable: true });
        await channel.bindQueue(incQ.queue, EXCHANGE, 'incident.*');

        channel.consume(incQ.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { event_type, payload } = envelope;
                await handleIncidentEvent(event_type, payload);
                channel.ack(msg);
            } catch (err) {
                logger.error('analytics.incidents consumer error:', err.message);
                channel.nack(msg, false, false); // don't requeue malformed
            }
        });

        // ─── Queue: analytics.dispatch ────────────────────────────────────
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

        // ─── Queue: analytics.capacity ────────────────────────────────────
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

        logger.info('Connected to RabbitMQ (Analytics Service) — consuming all event queues');

        connection.on('error', (err) => {
            logger.error('RabbitMQ error:', err.message);
            setTimeout(connectRabbitMQ, 5000);
        });
        connection.on('close', () => setTimeout(connectRabbitMQ, 5000));
    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

// ─── Event Handlers ──────────────────────────────────────────────

async function handleIncidentEvent(eventType, payload) {
    logger.debug(`Handling event: ${eventType} for incident: ${payload.incident_id}`);

    if (eventType === 'incident.created') {
        // Upsert analytics record
        await pool.query(
            `INSERT INTO incident_analytics
         (incident_id, incident_type, latitude, longitude, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (incident_id) DO NOTHING`,
            [payload.incident_id, payload.incident_type,
            payload.latitude, payload.longitude,
            payload.status || 'created', payload.created_at || new Date()]
        );
        return;
    }

    if (eventType === 'incident.dispatched') {
        const dispatchedAt = payload.dispatched_at ? new Date(payload.dispatched_at) : new Date();
        // Calculate dispatch_time_seconds from created_at
        const existing = await pool.query(
            'SELECT created_at FROM incident_analytics WHERE incident_id = $1',
            [payload.incident_id]
        );
        const createdAt = existing.rows[0]?.created_at;
        const dispatchTimeSecs = createdAt
            ? Math.round((dispatchedAt - new Date(createdAt)) / 1000)
            : null;

        await pool.query(
            `INSERT INTO incident_analytics
         (incident_id, incident_type, latitude, longitude, unit_type,
          assigned_unit_id, dispatch_time_seconds, status, created_at, dispatched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'dispatched',$8,$9)
       ON CONFLICT (incident_id) DO UPDATE SET
         unit_type = EXCLUDED.unit_type,
         assigned_unit_id = EXCLUDED.assigned_unit_id,
         dispatch_time_seconds = EXCLUDED.dispatch_time_seconds,
         status = 'dispatched',
         dispatched_at = EXCLUDED.dispatched_at`,
            [payload.incident_id, payload.incident_type,
            payload.latitude, payload.longitude,
            payload.assigned_unit_type, payload.assigned_unit_id,
                dispatchTimeSecs, payload.dispatched_at || new Date(), dispatchedAt]
        );

        // Record resource utilization
        if (payload.assigned_unit_id) {
            await pool.query(
                `INSERT INTO resource_utilization (unit_id, unit_type, station_name, incident_id, deployed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
                [payload.assigned_unit_id, payload.assigned_unit_type,
                payload.unit_name || 'Unknown', payload.incident_id, dispatchedAt]
            );
        }
        return;
    }

    if (eventType === 'incident.resolved') {
        const resolvedAt = payload.resolved_at ? new Date(payload.resolved_at) : new Date();
        const existing = await pool.query(
            'SELECT created_at, dispatched_at FROM incident_analytics WHERE incident_id = $1',
            [payload.incident_id]
        );
        const row = existing.rows[0];
        const resolutionSecs = row?.created_at
            ? Math.round((resolvedAt - new Date(row.created_at)) / 1000)
            : null;
        const responseSecs = row?.dispatched_at
            ? Math.round((resolvedAt - new Date(row.dispatched_at)) / 1000)
            : null;

        await pool.query(
            `UPDATE incident_analytics SET
         status = 'resolved',
         resolved_at = $1,
         resolution_time_seconds = $2,
         response_time_seconds = $3
       WHERE incident_id = $4`,
            [resolvedAt, resolutionSecs, responseSecs, payload.incident_id]
        );

        // Update resource utilization returned_at
        await pool.query(
            `UPDATE resource_utilization SET
         returned_at = $1,
         deployment_duration_seconds = EXTRACT(EPOCH FROM ($1 - deployed_at))::INTEGER
       WHERE incident_id = $2 AND returned_at IS NULL`,
            [resolvedAt, payload.incident_id]
        );
        return;
    }

    if (eventType === 'incident.status.updated') {
        await pool.query(
            'UPDATE incident_analytics SET status = $1 WHERE incident_id = $2',
            [payload.status, payload.incident_id]
        );
    }
}

async function handleDispatchEvent(eventType, payload) {
    // Vehicle location updates — we can compute additional metrics here in the future
    logger.debug(`Dispatch event: ${eventType}`);
}

async function handleCapacityEvent(payload) {
    if (!payload.hospital_id) return;
    await pool.query(
        `INSERT INTO hospital_capacity_snapshots
       (hospital_id, hospital_name, total_beds, available_beds, ambulances_total, ambulances_available)
     VALUES ($1, $2, $3, $4, 0, 0)`,
        [payload.hospital_id, payload.hospital_name || 'Unknown',
        payload.total_beds || 0, payload.available_beds || 0]
    );
}

module.exports = { connectRabbitMQ };
