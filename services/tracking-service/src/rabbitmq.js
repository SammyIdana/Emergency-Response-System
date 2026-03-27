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

        // ─── Consumer: dispatch.created ───────────────────────────────
        const dispatchQueue = await channel.assertQueue('tracking.dispatch', { durable: true });
        await channel.bindQueue(dispatchQueue.queue, EXCHANGE, 'dispatch.created');
        channel.consume(dispatchQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received dispatch.created:', payload);

                // Update vehicle to dispatched status
                await Vehicle.findOneAndUpdate(
                    { vehicle_id: payload.vehicle_id },
                    {
                        incident_id: payload.incident_id,
                        status: 'dispatched',
                        updated_at: new Date(),
                    }
                );

                if (ioInstance) {
                    ioInstance.emit('dispatch_created', payload);
                }

                channel.ack(msg);
            } catch (err) {
                logger.error('Error processing dispatch.created:', err.message);
                channel.nack(msg, false, true);
            }
        });

        // ─── Consumer: incident.created ───────────────────────────────
        const createdQueue = await channel.assertQueue('tracking.incident.created', { durable: true });
        await channel.bindQueue(createdQueue.queue, EXCHANGE, 'incident.created');
        channel.consume(createdQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received incident.created for notification:', payload);

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
                logger.error('Error processing incident.created for notification:', err.message);
                channel.nack(msg, false, true);
            }
        });

        // ─── Consumer: incident.resolved ──────────────────────────────
        const resolvedQueue = await channel.assertQueue('tracking.incident.resolved', { durable: true });
        await channel.bindQueue(resolvedQueue.queue, EXCHANGE, 'incident.resolved');
        channel.consume(resolvedQueue.queue, async (msg) => {
            if (!msg) return;
            try {
                const envelope = JSON.parse(msg.content.toString());
                const { payload } = envelope;
                logger.debug('Received incident.resolved:', payload);

                if (payload.assigned_unit_id) {
                    await Vehicle.findOneAndUpdate(
                        { vehicle_id: payload.assigned_unit_id },
                        {
                            incident_id: null,
                            status: 'idle',
                            updated_at: new Date(),
                        }
                    );

                    if (ioInstance) {
                        ioInstance.emit('vehicle_status_update', {
                            vehicle_id: payload.assigned_unit_id,
                            status: 'idle'
                        });
                        
                        ioInstance.emit('new_notification', {
                            id: require('crypto').randomUUID(),
                            type: 'resolution',
                            title: 'Incident Resolved',
                            message: `Incident #${payload.incident_id.slice(0,8)} has been marked as resolved.`,
                            timestamp: new Date().toISOString(),
                            incident_id: payload.incident_id,
                            severity: 'low'
                        });
                    }
                }

                channel.ack(msg);
            } catch (err) {
                logger.error('Error processing incident.resolved:', err.message);
                channel.nack(msg, false, true);
            }
        });

        logger.info('Connected to RabbitMQ (Tracking Service) and consuming events');

        connection.on('error', (err) => {
            logger.error('RabbitMQ error:', err.message);
            setTimeout(connectRabbitMQ, 5000);
        });
        connection.on('close', () => {
            logger.warn('RabbitMQ closed, reconnecting...');
            setTimeout(connectRabbitMQ, 5000);
        });
    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

function publish(routingKey, payload) {
    if (!channel) return;
    const envelope = {
        event_id: require('crypto').randomUUID(),
        event_type: routingKey,
        timestamp: new Date().toISOString(),
        source_service: 'tracking-service',
        payload,
    };
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(envelope)), {
        persistent: true,
        contentType: 'application/json',
    });
}

module.exports = { connectRabbitMQ, publish, setIo };
