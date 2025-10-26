// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ✅ Initialize Firebase (must be before routes if routes depend on Firebase)
require('./config/firebase.config');

// ✅ Import Routes (check that all files exist)
const authRoutes = require('./routes/auth.routes');
const farmerRoutes = require('./routes/farmer.routes');
const farmRoutes = require('./routes/farm.routes');

// ⚠️ These should be wrapped in try-catch or conditionally required to prevent startup crashes
let livestockRoutes, zoneRoutes, alertRoutes, notificationRoutes, analyticsRoutes, sensorRoutes;
try {
  livestockRoutes = require('./routes/livestock.routes');
  zoneRoutes = require('./routes/zone.routes');
  alertRoutes = require('./routes/alert.routes');
  notificationRoutes = require('./routes/notification.routes');
  analyticsRoutes = require('./routes/analytics.routes');
  sensorRoutes = require('./routes/sensor.routes');
  console.log('✅ Optional routes loaded successfully.');
} catch (err) {
  console.warn('⚠️ Some optional routes are missing:', err.message);
}

// ✅ Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ZoneAlert API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      farmers: '/api/farmers',
      farms: '/api/farms',
      livestock: '/api/livestock',
      zones: '/api/zones',
      alerts: '/api/alerts',
      notifications: '/api/notifications',
      analytics: '/api/analytics',
      sensors: '/api/sensors'
    }
  });
});

// ✅ API Routes
console.log('📝 Registering routes...');

app.use('/api/auth', authRoutes);
console.log('✅ Auth routes registered at /api/auth');

app.use('/api/farmers', farmerRoutes);
console.log('✅ Farmer routes registered at /api/farmers');

app.use('/api/farms', farmRoutes);
console.log('✅ Farm routes registered at /api/farms');

// ✅ Register optional routes if available
if (livestockRoutes) app.use('/api/livestock', livestockRoutes);
if (zoneRoutes) app.use('/api/zones', zoneRoutes);
if (alertRoutes) app.use('/api/alerts', alertRoutes);
if (notificationRoutes) app.use('/api/notifications', notificationRoutes);
if (analyticsRoutes) app.use('/api/analytics', analyticsRoutes);
if (sensorRoutes) app.use('/api/sensors', sensorRoutes);

// ✅ 404 Handler (must be after all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      '/api/auth/*',
      '/api/farmers/*',
      '/api/farms/*'
    ]
  });
});

// ✅ Error Handler (must be last)
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
});

// ✅ Start Server
const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 ZoneAlert API Server Started');
  console.log('='.repeat(50));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  console.log('='.repeat(50));
});

// ✅ Graceful Shutdown Fix
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

// ✅ For Testing Purposes
module.exports = app;
