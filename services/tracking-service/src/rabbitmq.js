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
