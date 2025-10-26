// routes/farm.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth.middleware');
const { firestore, FieldValue, GeoPoint } = require('../config/firebase.config');

/**
 * @route   POST /api/farms
 * @desc    Create a new farm
 * @access  Protected
 */
router.post('/', verifyToken, [
    body('farm_name').notEmpty().trim().withMessage('Farm name is required'),
    body('location.address').notEmpty().withMessage('Address is required'),
    body('location.coordinates.latitude').isFloat().withMessage('Valid latitude required'),
    body('location.coordinates.longitude').isFloat().withMessage('Valid longitude required'),
    body('total_area').isFloat({ min: 0 }).withMessage('Valid area required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { farm_name, location, total_area, description } = req.body;
        const farmer_id = req.user.userId;

        // Get farmer name from Firestore
        const farmerDoc = await firestore
            .collection('Farmers')
            .doc(farmer_id)
            .get();

        let farmer_name = req.user.email || 'Unknown Farmer';
        
        if (farmerDoc.exists) {
            const farmerData = farmerDoc.data();
            farmer_name = farmerData.name || req.user.email;
        }

        const farmData = {
            farmer_id,
            farmer_name,
            farm_name,
            location: {
                address: location.address,
                coordinates: new GeoPoint(
                    location.coordinates.latitude,
                    location.coordinates.longitude
                )
            },
            total_area,
            description: description || null,
            created_at: FieldValue.serverTimestamp(),
            zones_count: 0,
            livestock_count: 0,
            sensors_count: 0,
            active_alerts: 0
        };

        const farmRef = await firestore
            .collection('Farms')
            .add(farmData);

        // Update farmer's farm count
        if (farmerDoc.exists) {
            await firestore
                .collection('Farmers')
                .doc(farmer_id)
                .update({
                    farms_count: FieldValue.increment(1)
                });
        }

        res.status(201).json({
            success: true,
            message: 'Farm created successfully',
            data: {
                farm_id: farmRef.id,
                farm_name: farmData.farm_name,
                location: farmData.location,
                total_area: farmData.total_area
            }
        });

    } catch (error) {
        console.error('Create farm error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create farm',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/farms
 * @desc    Get all farms for authenticated farmer
 * @access  Protected
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const farmer_id = req.user.userId;

        const farmsSnapshot = await firestore
            .collection('Farms')
            .where('farmer_id', '==', farmer_id)
            .get();

        const farms = [];
        farmsSnapshot.forEach(doc => {
            const data = doc.data();
            farms.push({
                farm_id: doc.id,
                farm_name: data.farm_name,
                location: data.location,
                total_area: data.total_area,
                zones_count: data.zones_count || 0,
                livestock_count: data.livestock_count || 0,
                active_alerts: data.active_alerts || 0,
                created_at: data.created_at
            });
        });

        res.status(200).json({
            success: true,
            message: 'Farms retrieved successfully',
            data: farms,
            total: farms.length
        });

    } catch (error) {
        console.error('Get farms error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get farms',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/farms/:farmId
 * @desc    Get single farm details
 * @access  Protected
 */
router.get('/:farmId', verifyToken, async (req, res) => {
    try {
        const { farmId } = req.params;
        const farmer_id = req.user.userId;

        const farmDoc = await firestore
            .collection('Farms')
            .doc(farmId)
            .get();

        if (!farmDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Farm not found'
            });
        }

        const farmData = farmDoc.data();

        // Verify ownership
        if (farmData.farmer_id !== farmer_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get zones
        const zonesSnapshot = await firestore
            .collection('Zones')
            .where('farm_id', '==', farmId)
            .get();

        const zones = [];
        zonesSnapshot.forEach(doc => {
            zones.push({
                zone_id: doc.id,
                ...doc.data()
            });
        });

        // Get livestock
        const livestockSnapshot = await firestore
            .collection('Livestock')
            .where('farm_id', '==', farmId)
            .get();

        const livestock = [];
        livestockSnapshot.forEach(doc => {
            livestock.push({
                livestock_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Farm details retrieved',
            data: {
                farm_id: farmId,
                ...farmData,
                zones,
                livestock,
                statistics: {
                    total_zones: zones.length,
                    total_livestock: livestock.length,
                    safe_zones: zones.filter(z => z.zone_type === 'safe').length,
                    danger_zones: zones.filter(z => z.zone_type === 'danger').length
                }
            }
        });

    } catch (error) {
        console.error('Get farm details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get farm details',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/farms/:farmId
 * @desc    Update farm information
 * @access  Protected
 */
router.put('/:farmId', verifyToken, async (req, res) => {
    try {
        const { farmId } = req.params;
        const farmer_id = req.user.userId;
        
        // Verify ownership
        const farmDoc = await firestore
            .collection('Farms')
            .doc(farmId)
            .get();

        if (!farmDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Farm not found'
            });
        }

        if (farmDoc.data().farmer_id !== farmer_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const updateData = { ...req.body };
        updateData.updated_at = FieldValue.serverTimestamp();

        await firestore
            .collection('Farms')
            .doc(farmId)
            .update(updateData);

        res.status(200).json({
            success: true,
            message: 'Farm updated successfully',
            data: {
                farm_id: farmId,
                updated_fields: Object.keys(updateData)
            }
        });

    } catch (error) {
        console.error('Update farm error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update farm',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/farms/:farmId
 * @desc    Delete a farm
 * @access  Protected
 */
router.delete('/:farmId', verifyToken, async (req, res) => {
    try {
        const { farmId } = req.params;
        const farmer_id = req.user.userId;

        // Verify ownership
        const farmDoc = await firestore
            .collection('Farms')
            .doc(farmId)
            .get();

        if (!farmDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Farm not found'
            });
        }

        if (farmDoc.data().farmer_id !== farmer_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        await firestore
            .collection('Farms')
            .doc(farmId)
            .delete();

        // Update farmer's farm count
        const farmerDoc = await firestore
            .collection('Farmers')
            .doc(farmer_id)
            .get();

        if (farmerDoc.exists) {
            await firestore
                .collection('Farmers')
                .doc(farmer_id)
                .update({
                    farms_count: FieldValue.increment(-1)
                });
        }

        res.status(200).json({
            success: true,
            message: 'Farm deleted successfully'
        });

    } catch (error) {
        console.error('Delete farm error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete farm',
            error: error.message
        });
    }
});

module.exports = router;