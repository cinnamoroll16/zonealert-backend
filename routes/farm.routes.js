// routes/farm.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { firestore, FieldValue, GeoPoint } = require('../config/firebase.config');

/**
 * @route   POST /api/farms
 * @desc    Create a new farm
 * @access  Protected
 */
router.post('/', [
    body('farm_name').notEmpty().trim(),
    body('location.address').notEmpty(),
    body('location.coordinates.latitude').isFloat(),
    body('location.coordinates.longitude').isFloat(),
    body('total_area').isFloat({ min: 0 })
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

        // Get farmer name for denormalization
        const farmerDoc = await firestore
            .collection('farmers')
            .doc(farmer_id)
            .get();

        const farmerData = farmerDoc.data();

        const farmData = {
            farmer_id,
            farmer_name: farmerData.name,
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
            .collection('farms')
            .add(farmData);

        // Update farmer's farm count
        await firestore
            .collection('farmers')
            .doc(farmer_id)
            .update({
                farms_count: FieldValue.increment(1)
            });

        res.status(201).json({
            success: true,
            message: 'Farm created successfully',
            data: {
                farm_id: farmRef.id,
                ...farmData
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
router.get('/', async (req, res) => {
    try {
        const farmer_id = req.user.userId;

        const farmsSnapshot = await firestore
            .collection('farms')
            .where('farmer_id', '==', farmer_id)
            .get();

        const farms = [];
        farmsSnapshot.forEach(doc => {
            farms.push({
                farm_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Farms retrieved',
            data: {
                count: farms.length,
                farms
            }
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
router.get('/:farmId', async (req, res) => {
    try {
        const { farmId } = req.params;

        const farmDoc = await firestore
            .collection('farms')
            .doc(farmId)
            .get();

        if (!farmDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Farm not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Farm details retrieved',
            data: {
                farm_id: farmId,
                ...farmDoc.data()
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
router.put('/:farmId', async (req, res) => {
    try {
        const { farmId } = req.params;
        const updateData = { ...req.body };

        updateData.updated_at = FieldValue.serverTimestamp();

        await firestore
            .collection('farms')
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
router.delete('/:farmId', async (req, res) => {
    try {
        const { farmId } = req.params;
        const farmer_id = req.user.userId;

        await firestore
            .collection('farms')
            .doc(farmId)
            .delete();

        // Update farmer's farm count
        await firestore
            .collection('farmers')
            .doc(farmer_id)
            .update({
                farms_count: FieldValue.increment(-1)
            });

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