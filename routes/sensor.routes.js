// routes/sensor.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { firestore, realtimeDb, FieldValue, ServerValue } = require('../config/firebase.config');
const { verifyToken, verifyIoTDevice } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/sensors/reading
 * @desc    Submit sensor reading from IoT device (Stores in RTDB)
 * @access  Public (IoT devices use API key)
 */
router.post('/reading', [
    body('sensor_id').notEmpty(),
    body('distance_measured').isFloat({ min: 0 }),
    body('sensor_type').isIn(['LIDAR', 'ULTRASONIC']),
    body('api_key').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { sensor_id, distance_measured, sensor_type, api_key } = req.body;

        // Verify IoT API key
        if (api_key !== process.env.IOT_API_KEY) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        // Get sensor info from Firestore
        const sensorDoc = await firestore
            .collection('sensor_units')
            .doc(sensor_id)
            .get();

        if (!sensorDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Sensor not found'
            });
        }

        const sensorData = sensorDoc.data();
        
        // Determine status based on threshold
        const threshold = sensorData.boundary_threshold || 50;
        const status = distance_measured < threshold ? 'alert' : 'normal';
        
        // Create timestamp
        const timestamp = Date.now();
        const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Store reading in Realtime Database (for real-time updates)
        const readingData = {
            sensor_id,
            distance_measured,
            sensor_type,
            status,
            timestamp,
            zone_id: sensorData.zone_id,
            farm_id: sensorData.farm_id
        };

        // Save to RTDB with date-based sharding
        const readingRef = realtimeDb.ref(`sensor_readings/${dateKey}/${sensor_id}`).push();
        await readingRef.set(readingData);

        // Update sensor last reading in RTDB for quick access
        await realtimeDb.ref(`sensor_status/${sensor_id}`).set({
            last_reading: distance_measured,
            last_timestamp: timestamp,
            status,
            is_online: true
        });

        // Update sensor status in Firestore
        await firestore
            .collection('sensor_units')
            .doc(sensor_id)
            .update({
                last_reading: distance_measured,
                last_reading_time: FieldValue.serverTimestamp(),
                is_operational: true,
                total_readings_today: FieldValue.increment(1)
            });

        // Check if alert needs to be created
        if (status === 'alert') {
            await createAlert(sensor_id, sensorData, distance_measured);
        }

        res.status(200).json({
            success: true,
            message: 'Sensor reading recorded',
            data: {
                reading_id: readingRef.key,
                status,
                timestamp
            }
        });

    } catch (error) {
        console.error('Sensor reading error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record sensor reading',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/sensors/batch
 * @desc    Submit batch of sensor readings (for offline sync)
 * @access  Public (IoT devices)
 */
router.post('/batch', [
    body('readings').isArray(),
    body('api_key').notEmpty()
], async (req, res) => {
    try {
        const { readings, api_key } = req.body;

        if (api_key !== process.env.IOT_API_KEY) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        const results = [];
        const updates = {};

        for (const reading of readings) {
            const dateKey = new Date(reading.timestamp).toISOString().split('T')[0];
            const path = `sensor_readings/${dateKey}/${reading.sensor_id}/${Date.now()}`;
            
            updates[path] = {
                sensor_id: reading.sensor_id,
                distance_measured: reading.distance_measured,
                sensor_type: reading.sensor_type,
                status: reading.distance_measured < 50 ? 'alert' : 'normal',
                timestamp: reading.timestamp
            };
            
            results.push({ sensor_id: reading.sensor_id, status: 'queued' });
        }

        // Batch update to RTDB
        await realtimeDb.ref().update(updates);

        res.status(200).json({
            success: true,
            message: `${readings.length} readings processed`,
            data: results
        });

    } catch (error) {
        console.error('Batch reading error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process batch readings',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/sensors/readings/:sensorId
 * @desc    Get sensor readings from RTDB
 * @access  Protected
 */
router.get('/readings/:sensorId', verifyToken, [
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
    try {
        const { sensorId } = req.params;
        const { start_date, end_date, limit = 100 } = req.query;

        // Get readings from RTDB
        const dateKey = new Date().toISOString().split('T')[0];
        const readingsRef = realtimeDb.ref(`sensor_readings/${dateKey}/${sensorId}`);
        
        let query = readingsRef.orderByChild('timestamp');
        
        if (start_date) {
            query = query.startAt(new Date(start_date).getTime());
        }
        
        if (end_date) {
            query = query.endAt(new Date(end_date).getTime());
        }
        
        query = query.limitToLast(parseInt(limit));

        const snapshot = await query.once('value');
        const readings = [];
        
        snapshot.forEach((childSnapshot) => {
            readings.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Sensor readings retrieved',
            data: {
                sensor_id: sensorId,
                count: readings.length,
                readings: readings.reverse() // Most recent first
            }
        });

    } catch (error) {
        console.error('Get readings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get sensor readings',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/sensors/live/:sensorId
 * @desc    Get live sensor status from RTDB
 * @access  Protected
 */
router.get('/live/:sensorId', verifyToken, async (req, res) => {
    try {
        const { sensorId } = req.params;

        // Get live status from RTDB
        const statusSnapshot = await realtimeDb
            .ref(`sensor_status/${sensorId}`)
            .once('value');

        if (!statusSnapshot.exists()) {
            return res.status(404).json({
                success: false,
                message: 'No live data available for this sensor'
            });
        }

        const liveData = statusSnapshot.val();

        // Check if data is stale (older than 5 minutes)
        const isStale = Date.now() - liveData.last_timestamp > 300000;

        res.status(200).json({
            success: true,
            message: 'Live sensor status',
            data: {
                ...liveData,
                is_stale: isStale,
                age_seconds: Math.floor((Date.now() - liveData.last_timestamp) / 1000)
            }
        });

    } catch (error) {
        console.error('Get live status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get live status',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/sensors/register
 * @desc    Register a new sensor (Stores in Firestore)
 * @access  Protected
 */
router.post('/register', verifyToken, [
    body('device_id').notEmpty(),
    body('sensor_type').isIn(['LIDAR', 'ULTRASONIC']),
    body('zone_id').notEmpty(),
    body('farm_id').notEmpty(),
    body('location_description').notEmpty(),
    body('coordinates.latitude').isFloat(),
    body('coordinates.longitude').isFloat()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { 
            device_id, 
            sensor_type, 
            zone_id, 
            farm_id, 
            location_description, 
            coordinates 
        } = req.body;

        // Create sensor document in Firestore
        const sensorData = {
            device_id,
            sensor_type,
            zone_id,
            farm_id,
            location_description,
            coordinates,
            battery_level: 100,
            is_operational: true,
            boundary_threshold: 50,
            created_at: FieldValue.serverTimestamp(),
            last_maintenance: FieldValue.serverTimestamp(),
            firmware_version: '1.0.0',
            total_readings_today: 0,
            alerts_triggered_today: 0,
            average_response_time_ms: 0
        };

        const sensorRef = await firestore
            .collection('sensor_units')
            .add(sensorData);

        // Initialize sensor status in RTDB
        await realtimeDb.ref(`sensor_status/${sensorRef.id}`).set({
            is_online: false,
            last_reading: 0,
            last_timestamp: Date.now(),
            status: 'inactive'
        });

        res.status(201).json({
            success: true,
            message: 'Sensor registered successfully',
            data: {
                sensor_id: sensorRef.id,
                ...sensorData
            }
        });

    } catch (error) {
        console.error('Sensor registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register sensor',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/sensors
 * @desc    Get all sensors for a farm
 * @access  Protected
 */
router.get('/', verifyToken, [
    query('farm_id').optional(),
    query('zone_id').optional(),
    query('status').optional().isIn(['online', 'offline', 'all'])
], async (req, res) => {
    try {
        const { farm_id, zone_id, status = 'all' } = req.query;

        let query = firestore.collection('sensor_units');

        if (farm_id) {
            query = query.where('farm_id', '==', farm_id);
        }

        if (zone_id) {
            query = query.where('zone_id', '==', zone_id);
        }

        const snapshot = await query.get();
        const sensors = [];

        for (const doc of snapshot.docs) {
            const sensorData = doc.data();
            
            // Get live status from RTDB
            const statusSnapshot = await realtimeDb
                .ref(`sensor_status/${doc.id}`)
                .once('value');
            
            const liveStatus = statusSnapshot.val() || {
                is_online: false,
                last_reading: 0,
                status: 'offline'
            };

            // Filter by status if specified
            if (status === 'online' && !liveStatus.is_online) continue;
            if (status === 'offline' && liveStatus.is_online) continue;

            sensors.push({
                sensor_id: doc.id,
                ...sensorData,
                live_status: liveStatus
            });
        }

        res.status(200).json({
            success: true,
            message: 'Sensors retrieved',
            data: {
                count: sensors.length,
                sensors
            }
        });

    } catch (error) {
        console.error('Get sensors error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get sensors',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/sensors/:sensorId/battery
 * @desc    Update sensor battery level
 * @access  Public (IoT device)
 */
router.put('/:sensorId/battery', [
    body('battery_level').isFloat({ min: 0, max: 100 }),
    body('api_key').notEmpty()
], async (req, res) => {
    try {
        const { sensorId } = req.params;
        const { battery_level, api_key } = req.body;

        if (api_key !== process.env.IOT_API_KEY) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        // Update in Firestore
        await firestore
            .collection('sensor_units')
            .doc(sensorId)
            .update({
                battery_level,
                last_battery_update: FieldValue.serverTimestamp()
            });

        // Update in RTDB
        await realtimeDb
            .ref(`sensor_status/${sensorId}/battery_level`)
            .set(battery_level);

        // Create low battery alert if needed
        if (battery_level < 20) {
            await createLowBatteryAlert(sensorId, battery_level);
        }

        res.status(200).json({
            success: true,
            message: 'Battery level updated',
            data: { battery_level }
        });

    } catch (error) {
        console.error('Battery update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update battery level',
            error: error.message
        });
    }
});

// Helper function to create alerts
async function createAlert(sensor_id, sensorData, distance) {
    try {
        const alertData = {
            sensor_id,
            zone_id: sensorData.zone_id,
            farm_id: sensorData.farm_id,
            alert_type: 'boundary_breach',
            security_level: distance < 25 ? 'critical' : 'high',
            trigger_distance: distance,
            description: `Livestock detected ${distance}m from boundary at ${sensorData.location_description}`,
            is_resolved: false,
            detected_at: FieldValue.serverTimestamp(),
            resolved_at: null
        };

        const alertRef = await firestore
            .collection('alerts')
            .add(alertData);

        // Create notification
        await firestore
            .collection('notifications')
            .add({
                alert_id: alertRef.id,
                farmer_id: sensorData.farmer_id,
                message: alertData.description,
                is_read: false,
                delivery_status: 'pending',
                sent_at: FieldValue.serverTimestamp()
            });

        console.log(`Alert created: ${alertRef.id}`);
    } catch (error) {
        console.error('Error creating alert:', error);
    }
}

async function createLowBatteryAlert(sensor_id, battery_level) {
    try {
        await firestore.collection('alerts').add({
            sensor_id,
            alert_type: 'low_battery',
            security_level: 'medium',
            description: `Sensor battery low: ${battery_level}%`,
            is_resolved: false,
            detected_at: FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error creating battery alert:', error);
    }
}

module.exports = router;