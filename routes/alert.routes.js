// routes/alert.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { firestore, FieldValue } = require('../config/firebase.config');

/**
 * @route   POST /api/alerts
 * @desc    Create new alert from ESP32
 * @access  Public
 */
router.post('/', [
    body('alert').isBoolean(),
    body('distance').isFloat({ min: 0 }),
    body('deviceId').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { alert, distance, timestamp, deviceId } = req.body;

        const alertData = {
            alert,
            distance,
            deviceId,
            timestamp: timestamp || FieldValue.serverTimestamp(),
            created_at: FieldValue.serverTimestamp(),
            status: alert ? 'active' : 'normal',
            resolved: false
        };

        const alertRef = await firestore
            .collection('Alerts')
            .add(alertData);

        // Update device last_seen
        await firestore
            .collection('Sensor_Units')
            .doc(deviceId)
            .update({
                last_seen: FieldValue.serverTimestamp(),
                alerts_count: FieldValue.increment(alert ? 1 : 0)
            });

        res.status(201).json({
            success: true,
            message: alert ? 'Alert received and logged' : 'Status received',
            data: {
                alert_id: alertRef.id,
                ...alertData
            }
        });

    } catch (error) {
        console.error('Create alert error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create alert',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/alerts
 * @desc    Get all alerts with filters
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 20, deviceId, alertType, startDate, endDate } = req.query;

        let query = firestore.collection('Alerts');

        // Apply filters
        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        if (alertType !== undefined) {
            query = query.where('alert', '==', alertType === 'true');
        }

        if (startDate) {
            query = query.where('created_at', '>=', new Date(startDate));
        }

        if (endDate) {
            query = query.where('created_at', '<=', new Date(endDate));
        }

        query = query.orderBy('created_at', 'desc').limit(parseInt(limit));

        const snapshot = await query.get();

        const alerts = [];
        snapshot.forEach(doc => {
            alerts.push({
                alert_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Alerts retrieved',
            data: {
                count: alerts.length,
                alerts
            }
        });

    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alerts',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/alerts/recent
 * @desc    Get recent alerts (last 24 hours)
 * @access  Public
 */
router.get('/recent', async (req, res) => {
    try {
        const { hours = 24, deviceId, limit = 50 } = req.query;

        const timeThreshold = new Date();
        timeThreshold.setHours(timeThreshold.getHours() - parseInt(hours));

        let query = firestore
            .collection('Alerts')
            .where('created_at', '>=', timeThreshold);

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        query = query.orderBy('created_at', 'desc').limit(parseInt(limit));

        const snapshot = await query.get();

        const alerts = [];
        snapshot.forEach(doc => {
            alerts.push({
                alert_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: `Recent alerts (last ${hours} hours)`,
            data: {
                count: alerts.length,
                alerts
            }
        });

    } catch (error) {
        console.error('Get recent alerts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get recent alerts',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/alerts/:alertId
 * @desc    Get single alert details
 * @access  Public
 */
router.get('/:alertId', async (req, res) => {
    try {
        const { alertId } = req.params;

        const alertDoc = await firestore
            .collection('Alerts')
            .doc(alertId)
            .get();

        if (!alertDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Alert details retrieved',
            data: {
                alert_id: alertId,
                ...alertDoc.data()
            }
        });

    } catch (error) {
        console.error('Get alert details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alert details',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/alerts/:alertId/resolve
 * @desc    Mark alert as resolved
 * @access  Public
 */
router.put('/:alertId/resolve', async (req, res) => {
    try {
        const { alertId } = req.params;

        await firestore
            .collection('Alerts')
            .doc(alertId)
            .update({
                resolved: true,
                status: 'resolved',
                resolved_at: FieldValue.serverTimestamp()
            });

        res.status(200).json({
            success: true,
            message: 'Alert resolved successfully'
        });

    } catch (error) {
        console.error('Resolve alert error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve alert',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/alerts/:alertId
 * @desc    Delete an alert
 * @access  Public
 */
router.delete('/:alertId', async (req, res) => {
    try {
        const { alertId } = req.params;

        await firestore
            .collection('Alerts')
            .doc(alertId)
            .delete();

        res.status(200).json({
            success: true,
            message: 'Alert deleted successfully'
        });

    } catch (error) {
        console.error('Delete alert error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete alert',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/alerts/device/:deviceId
 * @desc    Get all alerts for specific device
 * @access  Public
 */
router.get('/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit = 50 } = req.query;

        const snapshot = await firestore
            .collection('Alerts')
            .where('deviceId', '==', deviceId)
            .orderBy('created_at', 'desc')
            .limit(parseInt(limit))
            .get();

        const alerts = [];
        snapshot.forEach(doc => {
            alerts.push({
                alert_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Device alerts retrieved',
            data: {
                deviceId,
                count: alerts.length,
                alerts
            }
        });

    } catch (error) {
        console.error('Get device alerts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get device alerts',
            error: error.message
        });
    }
});

module.exports = router;