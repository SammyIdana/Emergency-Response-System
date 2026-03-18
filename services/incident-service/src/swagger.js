const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Emergency Response Platform — Incident Service',
            version: '1.0.0',
            description: 'Emergency Incident Management Microservice API',
        },
        servers: [{ url: 'http://localhost:3002', description: 'Local' }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
    },
    apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
