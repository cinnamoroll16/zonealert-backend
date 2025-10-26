// routes/analytics.routes.js
const express = require('express');
const router = express.Router();
const { firestore } = require('../config/firebase.config');

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard statistics
 * @access  Public
 */
router.get('/dashboard', async (req, res) => {
    try {
        const { deviceId, timeRange = 'week' } = req.query;

        // Calculate time threshold
        const now = new Date();
        let startDate = new Date();
        
        switch(timeRange) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
        }

        // Build query
        let query = firestore
            .collection('Alerts')
            .where('created_at', '>=', startDate);

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        const snapshot = await query.get();

        // Calculate statistics
        let totalAlerts = 0;
        let activeAlerts = 0;
        let totalDistance = 0;
        const devices = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            totalAlerts++;
            if (data.alert && !data.resolved) activeAlerts++;
            totalDistance += data.distance || 0;
            devices.add(data.deviceId);
        });

        const avgDistance = totalAlerts > 0 ? totalDistance / totalAlerts : 0;

        res.status(200).json({
            success: true,
            message: 'Dashboard statistics retrieved',
            data: {
                timeRange,
                totalAlerts,
                activeAlerts,
                totalDevices: devices.size,
                avgDistance: Math.round(avgDistance * 100) / 100,
                alertRate: totalAlerts / (timeRange === 'today' ? 24 : timeRange === 'week' ? 168 : 720)
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard statistics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/trends
 * @desc    Get alert trends over time
 * @access  Public
 */
router.get('/trends', async (req, res) => {
    try {
        const { startDate, endDate, deviceId, interval = 'day' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required'
            });
        }

        let query = firestore
            .collection('Alerts')
            .where('created_at', '>=', new Date(startDate))
            .where('created_at', '<=', new Date(endDate));

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        query = query.orderBy('created_at', 'asc');

        const snapshot = await query.get();

        // Group by interval
        const trends = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.created_at.toDate();
            let key;

            switch(interval) {
                case 'hour':
                    key = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()} ${date.getHours()}:00`;
                    break;
                case 'day':
                    key = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = `Week of ${weekStart.toISOString().split('T')[0]}`;
                    break;
                case 'month':
                    key = `${date.getFullYear()}-${date.getMonth()+1}`;
                    break;
            }

            if (!trends[key]) {
                trends[key] = { total: 0, alerts: 0, normal: 0 };
            }
            trends[key].total++;
            if (data.alert) trends[key].alerts++;
            else trends[key].normal++;
        });

        res.status(200).json({
            success: true,
            message: 'Trends data retrieved',
            data: {
                interval,
                trends
            }
        });

    } catch (error) {
        console.error('Get trends error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get trends',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/hourly
 * @desc    Get hourly breakdown of alerts
 * @access  Public
 */
router.get('/hourly', async (req, res) => {
    try {
        const { date, deviceId } = req.query;

        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        let query = firestore
            .collection('Alerts')
            .where('created_at', '>=', startOfDay)
            .where('created_at', '<=', endOfDay);

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        const snapshot = await query.get();

        // Initialize hourly data
        const hourly = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            total: 0,
            alerts: 0,
            normal: 0
        }));

        snapshot.forEach(doc => {
            const data = doc.data();
            const hour = data.created_at.toDate().getHours();
            hourly[hour].total++;
            if (data.alert) hourly[hour].alerts++;
            else hourly[hour].normal++;
        });

        res.status(200).json({
            success: true,
            message: 'Hourly breakdown retrieved',
            data: {
                date: targetDate.toISOString().split('T')[0],
                hourly
            }
        });

    } catch (error) {
        console.error('Get hourly breakdown error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get hourly breakdown',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/devices
 * @desc    Get analytics for all devices
 * @access  Public
 */
router.get('/devices', async (req, res) => {
    try {
        const { sortBy = 'alerts', limit = 10 } = req.query;

        const snapshot = await firestore
            .collection('Alerts')
            .get();

        // Aggregate by device
        const deviceStats = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const deviceId = data.deviceId;

            if (!deviceStats[deviceId]) {
                deviceStats[deviceId] = {
                    deviceId,
                    totalAlerts: 0,
                    activeAlerts: 0,
                    totalDistance: 0,
                    avgDistance: 0,
                    lastSeen: null
                };
            }

            deviceStats[deviceId].totalAlerts++;
            if (data.alert && !data.resolved) deviceStats[deviceId].activeAlerts++;
            deviceStats[deviceId].totalDistance += data.distance || 0;
            
            const timestamp = data.created_at?.toDate();
            if (timestamp && (!deviceStats[deviceId].lastSeen || timestamp > deviceStats[deviceId].lastSeen)) {
                deviceStats[deviceId].lastSeen = timestamp;
            }
        });

        // Calculate averages and convert to array
        const devices = Object.values(deviceStats).map(device => ({
            ...device,
            avgDistance: Math.round((device.totalDistance / device.totalAlerts) * 100) / 100
        }));

        // Sort
        devices.sort((a, b) => {
            if (sortBy === 'alerts') return b.totalAlerts - a.totalAlerts;
            if (sortBy === 'lastSeen') return (b.lastSeen || 0) - (a.lastSeen || 0);
            return 0;
        });

        res.status(200).json({
            success: true,
            message: 'Device analytics retrieved',
            data: {
                count: devices.length,
                devices: devices.slice(0, parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get device analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get device analytics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/devices/:deviceId
 * @desc    Get detailed analytics for specific device
 * @access  Public
 */
router.get('/devices/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { startDate, endDate } = req.query;

        let query = firestore
            .collection('Alerts')
            .where('deviceId', '==', deviceId);

        if (startDate) {
            query = query.where('created_at', '>=', new Date(startDate));
        }

        if (endDate) {
            query = query.where('created_at', '<=', new Date(endDate));
        }

        const snapshot = await query.get();

        let totalAlerts = 0;
        let activeAlerts = 0;
        let totalDistance = 0;
        let minDistance = Infinity;
        let maxDistance = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            totalAlerts++;
            if (data.alert && !data.resolved) activeAlerts++;
            
            const distance = data.distance || 0;
            totalDistance += distance;
            if (distance < minDistance) minDistance = distance;
            if (distance > maxDistance) maxDistance = distance;
        });

        const avgDistance = totalAlerts > 0 ? totalDistance / totalAlerts : 0;

        res.status(200).json({
            success: true,
            message: 'Device detailed analytics retrieved',
            data: {
                deviceId,
                totalAlerts,
                activeAlerts,
                avgDistance: Math.round(avgDistance * 100) / 100,
                minDistance: minDistance === Infinity ? 0 : minDistance,
                maxDistance
            }
        });

    } catch (error) {
        console.error('Get device detailed analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get device analytics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/analytics/heatmap
 * @desc    Get heatmap data (hour vs day of week)
 * @access  Public
 */
router.get('/heatmap', async (req, res) => {
    try {
        const { deviceId, weeks = 4 } = req.query;

        const weeksAgo = new Date();
        weeksAgo.setDate(weeksAgo.getDate() - (parseInt(weeks) * 7));

        let query = firestore
            .collection('Alerts')
            .where('created_at', '>=', weeksAgo);

        if (deviceId) {
            query = query.where('deviceId', '==', deviceId);
        }

        const snapshot = await query.get();

        // Initialize 24x7 matrix
        const heatmap = Array.from({ length: 7 }, () => 
            Array.from({ length: 24 }, () => 0)
        );

        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.created_at.toDate();
            const dayOfWeek = date.getDay();
            const hour = date.getHours();
            heatmap[dayOfWeek][hour]++;
        });

        res.status(200).json({
            success: true,
            message: 'Heatmap data retrieved',
            data: {
                weeks: parseInt(weeks),
                heatmap,
                labels: {
                    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                    hours: Array.from({ length: 24 }, (_, i) => `${i}:00`)
                }
            }
        });

    } catch (error) {
        console.error('Get heatmap error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get heatmap data',
            error: error.message
        });
    }
});

module.exports = router;