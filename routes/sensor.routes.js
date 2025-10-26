// routes/sensor.routes.js
const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { firestore, realtimeDb, FieldValue } = require('../config/firebase.config');
const { verifyToken } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

const COLLECTIONS = {
  SENSOR_UNITS: 'Sensor_Units',
  ALERTS: 'Alerts',
  NOTIFICATIONS: 'Notifications',
  BOUNDARY_ZONES: 'Boundary_Zones',
  FARMS: 'Farms',
  LIVESTOCK: 'Livestock'
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

router.post('/reading', [
  body('sensor_id').notEmpty().withMessage('Sensor ID is required'),
  body('distance_measured').isFloat({ min: 0 }).withMessage('Distance must be a positive number'),
  body('sensor_type').isIn(['LIDAR', 'ULTRASONIC', 'Ultrasonic']).withMessage('Invalid sensor type'),
  body('api_key').notEmpty().withMessage('API key is required'),
  validate
], asyncHandler(async (req, res) => {
  const { sensor_id, distance_measured, sensor_type, api_key } = req.body;

  if (api_key !== process.env.IOT_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key'
    });
  }

  const sensorDoc = await firestore
    .collection(COLLECTIONS.SENSOR_UNITS)
    .doc(sensor_id)
    .get();

  if (!sensorDoc.exists) {
    return res.status(404).json({
      success: false,
      message: `Sensor not found with ID: ${sensor_id}`,
      hint: 'Check if the sensor_id exists in Firestore Sensor_Units collection'
    });
  }

  const sensorData = sensorDoc.data();
  const threshold = sensorData.max_distance_threshold || 50;
  const status = distance_measured < threshold ? 'alert' : 'normal';
  const timestamp = Date.now();
  const dateKey = new Date().toISOString().split('T')[0];

  const readingData = {
    sensor_id,
    distance_measured,
    sensor_type,
    status,
    timestamp,
    zone_id: sensorData.zone_id,
    farm_id: sensorData.farm_id
  };

  const readingRef = realtimeDb.ref(`sensor_readings/${dateKey}/${sensor_id}`).push();
  await readingRef.set(readingData);

  await realtimeDb.ref(`sensor_status/${sensor_id}`).set({
    last_reading: distance_measured,
    last_timestamp: timestamp,
    status,
    is_online: true
  });

  await firestore
    .collection(COLLECTIONS.SENSOR_UNITS)
    .doc(sensor_id)
    .update({
      last_reading: distance_measured,
      last_reading_time: FieldValue.serverTimestamp(),
      is_operational: true
    });

  if (status === 'alert') {
    await createAlert(sensor_id, sensorData, distance_measured);
  }

  res.status(200).json({
    success: true,
    message: 'Sensor reading recorded',
    data: {
      reading_id: readingRef.key,
      status,
      timestamp,
      distance_measured,
      threshold
    }
  });
}));

router.post('/batch', [
  body('readings').isArray().withMessage('Readings must be an array'),
  body('api_key').notEmpty().withMessage('API key is required'),
  validate
], asyncHandler(async (req, res) => {
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

  await realtimeDb.ref().update(updates);

  res.status(200).json({
    success: true,
    message: `${readings.length} readings processed`,
    data: results
  });
}));

router.get('/readings/:sensorId', verifyToken, [
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  const { start_date, end_date, limit = 100 } = req.query;

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
      readings: readings.reverse()
    }
  });
}));

router.get('/live/:sensorId', verifyToken, asyncHandler(async (req, res) => {
  const { sensorId } = req.params;

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
}));

router.post('/register', verifyToken, [
  body('device_id').notEmpty().withMessage('Device ID is required'),
  body('sensor_type').isIn(['LIDAR', 'ULTRASONIC', 'Ultrasonic']).withMessage('Invalid sensor type'),
  body('zone_id').notEmpty().withMessage('Zone ID is required'),
  body('farm_id').notEmpty().withMessage('Farm ID is required'),
  body('location_description').notEmpty().withMessage('Location description is required'),
  validate
], asyncHandler(async (req, res) => {
  const { 
    device_id, 
    sensor_type, 
    zone_id, 
    farm_id, 
    location_description,
    battery_level = '100%'
  } = req.body;

  const zoneDoc = await firestore.collection(COLLECTIONS.BOUNDARY_ZONES).doc(zone_id).get();
  if (!zoneDoc.exists) {
    return res.status(404).json({
      success: false,
      message: 'Zone not found',
      hint: 'Check if the zone_id exists in Firestore Boundary_Zones collection'
    });
  }

  const farmDoc = await firestore.collection(COLLECTIONS.FARMS).doc(farm_id).get();
  if (!farmDoc.exists) {
    return res.status(404).json({
      success: false,
      message: 'Farm not found',
      hint: 'Check if the farm_id exists in Firestore Farms collection'
    });
  }

  const sensorData = {
    device_id,
    sensor_type,
    zone_id,
    farm_id,
    location_description,
    battery_level,
    is_operational: true
  };

  const sensorRef = await firestore
    .collection(COLLECTIONS.SENSOR_UNITS)
    .add(sensorData);

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
}));

router.get('/', verifyToken, asyncHandler(async (req, res) => {
  const { farm_id, zone_id, status = 'all' } = req.query;

  let query = firestore.collection(COLLECTIONS.SENSOR_UNITS);

  if (farm_id) {
    query = query.where('farm_id', '==', farm_id);
  }

  if (zone_id) {
    query = query.where('zone_id', '==', zone_id);
  }

  const snapshot = await query.get();
  
  if (snapshot.empty) {
    return res.status(200).json({
      success: true,
      message: 'No sensors found',
      data: {
        count: 0,
        sensors: []
      }
    });
  }

  const sensors = [];

  for (const doc of snapshot.docs) {
    const sensorData = doc.data();
    
    const statusSnapshot = await realtimeDb
      .ref(`sensor_status/${doc.id}`)
      .once('value');
    
    const liveStatus = statusSnapshot.val() || {
      is_online: false,
      last_reading: 0,
      status: 'offline'
    };

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
}));

router.put('/:sensorId/battery', [
  body('battery_level').notEmpty().withMessage('Battery level is required'),
  body('api_key').notEmpty().withMessage('API key is required'),
  validate
], asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  const { battery_level, api_key } = req.body;

  if (api_key !== process.env.IOT_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key'
    });
  }

  await firestore
    .collection(COLLECTIONS.SENSOR_UNITS)
    .doc(sensorId)
    .update({
      battery_level
    });

  await realtimeDb
    .ref(`sensor_status/${sensorId}/battery_level`)
    .set(battery_level);

  res.status(200).json({
    success: true,
    message: 'Battery level updated',
    data: { battery_level }
  });
}));

router.post('/', (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Invalid endpoint. To register a new sensor, use POST /api/sensors/register.'
  });
});

async function createAlert(sensor_id, sensorData, distance) {
  try {
    const alertData = {
      sensor_id,
      zone_id: sensorData.zone_id,
      farm_id: sensorData.farm_id,
      alert_type: 'Boundary Breach',
      breach_level: distance < 25 ? 'Critical' : 'High',
      breach_distance: distance,
      description: `Livestock detected ${distance}m from boundary at ${sensorData.location_description}`,
      is_resolved: false,
      detected_at: FieldValue.serverTimestamp(),
      resolved_at: null
    };

    const alertRef = await firestore
      .collection(COLLECTIONS.ALERTS)
      .add(alertData);

    console.log(`✅ Alert created: ${alertRef.id}`);
  } catch (error) {
    console.error('❌ Error creating alert:', error);
  }
}

module.exports = router;