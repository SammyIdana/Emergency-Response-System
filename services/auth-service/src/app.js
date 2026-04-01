const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const authRoutes = require('./routes/auth.routes');
const { errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Required for Swagger UI to load properly
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/auth', limiter);

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ success: true, service: 'auth-service', status: 'healthy', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

module.exports = app;
