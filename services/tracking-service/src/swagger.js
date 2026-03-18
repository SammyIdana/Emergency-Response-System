const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Emergency Response Platform — Tracking Service',
            version: '1.0.0',
            description: 'Dispatch Tracking Microservice API. Real-time tracking via WebSocket at ws://localhost:3003/tracking',
        },
        servers: [{ url: 'http://localhost:3003', description: 'Local' }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
    },
    apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
