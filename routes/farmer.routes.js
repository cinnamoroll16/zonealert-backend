// routes/farmer.routes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { firestore, FieldValue } = require('../config/firebase.config');

/**
 * @route   GET /api/farmers/me
 * @desc    Get current farmer's profile
 * @access  Protected
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const farmer_id = req.user.userId;

    const farmerDoc = await firestore
      .collection('Farmers')
      .doc(farmer_id)
      .get();

    if (!farmerDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found'
      });
    }

    const farmerData = farmerDoc.data();

    // Get farms count
    const farmsSnapshot = await firestore
      .collection('Farms')
      .where('farmer_id', '==', farmer_id)
      .get();

    // Get total livestock count across all farms
    const livestockSnapshot = await firestore
      .collection('Livestock')
      .where('farmer_id', '==', farmer_id)
      .get();

    // Get active alerts count
    const alertsSnapshot = await firestore
      .collection('Alerts')
      .where('farmer_id', '==', farmer_id)
      .where('status', '==', 'active')
      .get();

    res.status(200).json({
      success: true,
      message: 'Profile retrieved',
      data: {
        farmer_id,
        name: farmerData.name,
        email: farmerData.email,
        phone: farmerData.phone,
        created_at: farmerData.created_at,
        last_login: farmerData.last_login,
        is_active: farmerData.is_active,
        statistics: {
          farms_count: farmsSnapshot.size,
          total_livestock: livestockSnapshot.size,
          active_alerts: alertsSnapshot.size
        }
      }
    });

  } catch (error) {
    console.error('Get farmer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/farmers/:farmerId
 * @desc    Get specific farmer details (admin view)
 * @access  Protected
 */
router.get('/:farmerId', verifyToken, async (req, res) => {
  try {
    const { farmerId } = req.params;

    const farmerDoc = await firestore
      .collection('Farmers')
      .doc(farmerId)
      .get();

    if (!farmerDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        farmer_id: farmerId,
        ...farmerDoc.data()
      }
    });

  } catch (error) {
    console.error('Get farmer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get farmer details',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/farmers/:farmerId/stats
 * @desc    Get farmer statistics
 * @access  Protected
 */
router.get('/:farmerId/stats', verifyToken, async (req, res) => {
  try {
    const { farmerId } = req.params;

    // Get farms
    const farmsSnapshot = await firestore
      .collection('Farms')
      .where('farmer_id', '==', farmerId)
      .get();

    // Get livestock
    const livestockSnapshot = await firestore
      .collection('Livestock')
      .where('farmer_id', '==', farmerId)
      .get();

    // Get zones
    const zonesSnapshot = await firestore
      .collection('Zones')
      .where('farmer_id', '==', farmerId)
      .get();

    // Get active alerts
    const activeAlertsSnapshot = await firestore
      .collection('Alerts')
      .where('farmer_id', '==', farmerId)
      .where('status', '==', 'active')
      .get();

    // Get resolved alerts today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const resolvedTodaySnapshot = await firestore
      .collection('Alerts')
      .where('farmer_id', '==', farmerId)
      .where('status', '==', 'resolved')
      .where('resolved_at', '>=', today)
      .get();

    // Calculate average response time
    let totalResponseTime = 0;
    let alertsWithResponseTime = 0;
    
    resolvedTodaySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.response_time_minutes) {
        totalResponseTime += data.response_time_minutes;
        alertsWithResponseTime++;
      }
    });

    const avgResponseTime = alertsWithResponseTime > 0 
      ? Math.round(totalResponseTime / alertsWithResponseTime) 
      : null;

    res.status(200).json({
      success: true,
      data: {
        total_farms: farmsSnapshot.size,
        total_livestock: livestockSnapshot.size,
        total_zones: zonesSnapshot.size,
        active_alerts: activeAlertsSnapshot.size,
        resolved_alerts_today: resolvedTodaySnapshot.size,
        average_response_time_minutes: avgResponseTime,
        last_updated: FieldValue.serverTimestamp()
      }
    });

  } catch (error) {
    console.error('Get farmer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/farmers/me
 * @desc    Update current farmer's profile
 * @access  Protected
 */
router.put('/me', verifyToken, async (req, res) => {
  try {
    const farmer_id = req.user.userId;
    const { name, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    updateData.updated_at = FieldValue.serverTimestamp();

    await firestore
      .collection('Farmers')
      .doc(farmer_id)
      .update(updateData);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updateData
    });

  } catch (error) {
    console.error('Update farmer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/farmers/test
 * @desc    Test route
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Farmer route working properly!' 
  });
});

module.exports = router;