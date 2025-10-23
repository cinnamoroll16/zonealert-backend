// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { firestore, realtimeDb } = require('./config/firebase.config');

// Import route handlers
const authRoutes = require('./routes/auth.routes');
// const farmerRoutes = require('./routes/farmer.routes');
// const farmRoutes = require('./routes/farm.routes');
// const livestockRoutes = require('./routes/livestock.routes');
// const zoneRoutes = require('./routes/zone.routes');
// const sensorRoutes = require('./routes/sensor.routes');
// const alertRoutes = require('./routes/alert.routes');
// const notificationRoutes = require('./routes/notification.routes');
// const analyticsRoutes = require('./routes/analytics.routes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { verifyToken } = require('./middleware/auth.middleware');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:8080', '*'], // Add your Android emulator IP
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Limit auth attempts
    skipSuccessfulRequests: true
});

// Apply rate limiting
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Information endpoint
app.get('/api', (req, res) => {
    res.status(200).json({
        name: 'ZoneAlert Livestock Monitoring API',
        version: '1.0.0',
        description: 'Backend API for IoT-based livestock monitoring system',
        documentation: '/api/docs',
        endpoints: {
            auth: '/api/auth',
            farmers: '/api/farmers',
            farms: '/api/farms',
            livestock: '/api/livestock',
            zones: '/api/zones',
            sensors: '/api/sensors',
            alerts: '/api/alerts',
            notifications: '/api/notifications',
            analytics: '/api/analytics'
        }
    });
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (authentication required)
// app.use('/api/farmers', verifyToken, farmerRoutes);
// app.use('/api/farms', verifyToken, farmRoutes);
// app.use('/api/livestock', verifyToken, livestockRoutes);
// app.use('/api/zones', verifyToken, zoneRoutes);
// app.use('/api/sensors', sensorRoutes); // Sensors can post without auth (IoT devices)
// app.use('/api/alerts', verifyToken, alertRoutes);
// app.use('/api/notifications', verifyToken, notificationRoutes);
// app.use('/api/analytics', verifyToken, analyticsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    🚀 ZoneAlert Backend Server Started
    ====================================
    Environment: ${process.env.NODE_ENV || 'development'}
    Port: ${PORT}
    Time: ${new Date().toISOString()}
    
    API Endpoints:
    - Health Check: http://localhost:${PORT}/health
    - API Info: http://localhost:${PORT}/api
    
    Ready to monitor livestock! 🐐🐄
    ====================================
    `);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = app;