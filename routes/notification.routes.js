// routes/notification.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { firestore, FieldValue, admin } = require('../config/firebase.config');

/**
 * @route   POST /api/notifications/subscribe
 * @desc    Subscribe device/user to notifications
 * @access  Public
 */
router.post('/subscribe', [
    body('token').notEmpty().trim(),
    body('deviceId').optional().trim(),
    body('userId').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { token, deviceId, userId, topic = 'livestock_alerts' } = req.body;

        // Subscribe to topic
        await admin.messaging().subscribeToTopic(token, topic);

        // Save subscription to database
        const subscriptionData = {
            token,
            deviceId: deviceId || null,
            userId: userId || null,
            topic,
            subscribed_at: FieldValue.serverTimestamp(),
            active: true
        };

        const subRef = await firestore
            .collection('Notifications')
            .doc(token)
            .set(subscriptionData);

        res.status(201).json({
            success: true,
            message: 'Successfully subscribed to notifications',
            data: subscriptionData
        });

    } catch (error) {
        console.error('Subscribe notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to subscribe to notifications',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/unsubscribe
 * @desc    Unsubscribe from notifications
 * @access  Public
 */
router.post('/unsubscribe', [
    body('token').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { token, topic = 'livestock_alerts' } = req.body;

        // Unsubscribe from topic
        await admin.messaging().unsubscribeFromTopic(token, topic);

        // Update subscription status
        await firestore
            .collection('Notifications')
            .doc(token)
            .update({
                active: false,
                unsubscribed_at: FieldValue.serverTimestamp()
            });

        res.status(200).json({
            success: true,
            message: 'Successfully unsubscribed from notifications'
        });

    } catch (error) {
        console.error('Unsubscribe notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unsubscribe from notifications',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/send
 * @desc    Send notification (triggered by alert)
 * @access  Public
 */
router.post('/send', [
    body('title').notEmpty().trim(),
    body('body').notEmpty().trim(),
    body('deviceId').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { title, body, deviceId, data = {}, topic = 'livestock_alerts' } = req.body;

        // Build notification payload
        const message = {
            notification: {
                title,
                body
            },
            data: {
                deviceId: deviceId || 'unknown',
                timestamp: new Date().toISOString(),
                ...data
            },
            topic
        };

        // Send notification
        const response = await admin.messaging().send(message);

        // Log notification
        await firestore
            .collection('System_Analog')
            .add({
                title,
                body,
                deviceId: deviceId || null,
                topic,
                messageId: response,
                sent_at: FieldValue.serverTimestamp(),
                status: 'sent'
            });

        res.status(200).json({
            success: true,
            message: 'Notification sent successfully',
            data: {
                messageId: response
            }
        });

    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/send-to-device
 * @desc    Send notification to specific device token
 * @access  Public
 */
router.post('/send-to-device', [
    body('token').notEmpty().trim(),
    body('title').notEmpty().trim(),
    body('body').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { token, title, body, data = {} } = req.body;

        const message = {
            notification: {
                title,
                body
            },
            data: {
                timestamp: new Date().toISOString(),
                ...data
            },
            token
        };

        const response = await admin.messaging().send(message);

        // Log notification
        await firestore
            .collection('System_Analog')
            .add({
                title,
                body,
                token,
                messageId: response,
                sent_at: FieldValue.serverTimestamp(),
                status: 'sent'
            });

        res.status(200).json({
            success: true,
            message: 'Notification sent to device',
            data: {
                messageId: response
            }
        });

    } catch (error) {
        console.error('Send to device error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification to device',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/logs
 * @desc    Get notification logs
 * @access  Public
 */
router.get('/logs', async (req, res) => {
    try {
        const { limit = 50, deviceId } = req.query;

        let query = firestore
            .collection('System_Analog')
            .orderBy('sent_at', 'desc')
            .limit(parseInt(limit));

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        const snapshot = await query.get();

        const logs = [];
        snapshot.forEach(doc => {
            logs.push({
                log_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Notification logs retrieved',
            data: {
                count: logs.length,
                logs
            }
        });

    } catch (error) {
        console.error('Get notification logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notification logs',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/subscriptions
 * @desc    Get all active subscriptions
 * @access  Public
 */
router.get('/subscriptions', async (req, res) => {
    try {
        const { active = true } = req.query;

        let query = firestore.collection('Notifications');

        if (active !== undefined) {
            query = query.where('active', '==', active === 'true');
        }

        const snapshot = await query.get();

        const subscriptions = [];
        snapshot.forEach(doc => {
            subscriptions.push({
                token: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Subscriptions retrieved',
            data: {
                count: subscriptions.length,
                subscriptions
            }
        });

    } catch (error) {
        console.error('Get subscriptions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get subscriptions',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/test
 * @desc    Send test notification
 * @access  Public
 */
router.post('/test', [
    body('token').optional().trim(),
    body('topic').optional().trim()
], async (req, res) => {
    try {
        const { token, topic = 'livestock_alerts' } = req.body;

        const message = {
            notification: {
                title: '🧪 ZoneAlert Test Notification',
                body: 'This is a test notification from ZoneAlert system'
            },
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        };

        // Send to token or topic
        if (token) {
            message.token = token;
        } else {
            message.topic = topic;
        }

        const response = await admin.messaging().send(message);

        res.status(200).json({
            success: true,
            message: 'Test notification sent successfully',
            data: {
                messageId: response,
                sentTo: token ? 'device' : 'topic'
            }
        });

    } catch (error) {
        console.error('Send test notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test notification',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/notifications/:token
 * @desc    Delete notification subscription
 * @access  Public
 */
router.delete('/:token', async (req, res) => {
    try {
        const { token } = req.params;

        await firestore
            .collection('Notifications')
            .doc(token)
            .delete();

        res.status(200).json({
            success: true,
            message: 'Subscription deleted successfully'
        });

    } catch (error) {
        console.error('Delete subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete subscription',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics
 * @access  Public
 */
router.get('/stats', async (req, res) => {
    try {
        // Get subscription count
        const subsSnapshot = await firestore
            .collection('Notifications')
            .where('active', '==', true)
            .get();

        // Get notification logs count (last 24 hours)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const logsSnapshot = await firestore
            .collection('System_Analog')
            .where('sent_at', '>=', yesterday)
            .get();

        let sentCount = 0;
        let failedCount = 0;

        logsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'sent') sentCount++;
            else if (data.status === 'failed') failedCount++;
        });

        res.status(200).json({
            success: true,
            message: 'Notification statistics retrieved',
            data: {
                activeSubscriptions: subsSnapshot.size,
                notificationsSentLast24h: sentCount,
                notificationsFailedLast24h: failedCount,
                totalLogs: logsSnapshot.size
            }
        });

    } catch (error) {
        console.error('Get notification stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notification statistics',
            error: error.message
        });
    }
});

module.exports = router;