const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const analyticsRoutes = require('./routes/analytics.routes');
const logger = require('./utils/logger');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/analytics', analyticsRoutes);

app.get('/health', (req, res) => {
    res.json({ success: true, service: 'analytics-service', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
    logger.error(err.stack || err.message);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

module.exports = app;
