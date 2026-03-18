const amqplib = require('amqplib');
const logger = require('./utils/logger');

const EXCHANGE = 'emergency.events';
let channel = null;
let connection = null;

async function connectRabbitMQ() {
    try {
        connection = await amqplib.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        logger.info('Connected to RabbitMQ (Incident Service)');

        connection.on('error', (err) => {
            logger.error('RabbitMQ connection error:', err.message);
            setTimeout(connectRabbitMQ, 5000);
        });
        connection.on('close', () => {
            logger.warn('RabbitMQ connection closed, reconnecting...');
            setTimeout(connectRabbitMQ, 5000);
        });
    } catch (err) {
        logger.error('Failed to connect to RabbitMQ:', err.message);
        setTimeout(connectRabbitMQ, 5000);
    }
}

function publish(routingKey, payload) {
    if (!channel) {
        logger.warn('RabbitMQ channel not ready, skipping publish:', routingKey);
        return;
    }
    const envelope = {
        event_id: require('crypto').randomUUID(),
        event_type: routingKey,
        timestamp: new Date().toISOString(),
        source_service: 'incident-service',
        payload,
    };
    const content = Buffer.from(JSON.stringify(envelope));
    channel.publish(EXCHANGE, routingKey, content, {
        persistent: true,
        contentType: 'application/json',
    });
    logger.debug(`Published event: ${routingKey}`);
}

module.exports = { connectRabbitMQ, publish };
