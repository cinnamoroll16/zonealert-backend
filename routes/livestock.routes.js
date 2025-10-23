// routes/livestock.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { firestore, FieldValue } = require('../config/firebase.config');

/**
 * @route   POST /api/livestock
 * @desc    Add new livestock
 * @access  Protected
 */
router.post('/', [
    body('zone_id').notEmpty(),
    body('farm_id').notEmpty(),
    body('animal_type').isIn(['Goat', 'Chicken', 'Cow', 'Sheep', 'Pig']),
    body('identification_tag').notEmpty().trim(),
    body('age_months').optional().isInt({ min: 0 }),
    body('weight_kg').optional().isFloat({ min: 0 }),
    body('health_status').optional().isIn(['healthy', 'sick', 'injured', 'quarantine'])
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
            zone_id,
            farm_id,
            animal_type,
            identification_tag,
            age_months,
            weight_kg,
            health_status = 'healthy',
            breed,
            gender,
            notes
        } = req.body;

        // Check if tag already exists
        const existingTag = await firestore
            .collection('livestock')
            .where('identification_tag', '==', identification_tag)
            .where('farm_id', '==', farm_id)
            .limit(1)
            .get();

        if (!existingTag.empty) {
            return res.status(409).json({
                success: false,
                message: 'Identification tag already exists'
            });
        }

        // Get zone details for denormalization
        const zoneDoc = await firestore
            .collection('boundary_zones')
            .doc(zone_id)
            .get();

        if (!zoneDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        const zoneData = zoneDoc.data();

        // Create livestock document
        const livestockData = {
            zone_id,
            zone_name: zoneData.zone_name, // Denormalized
            farm_id,
            animal_type,
            identification_tag,
            current_status: 'inside_boundary',
            last_detected: FieldValue.serverTimestamp(),
            require_alert: false,
            health_status,
            age_months: age_months || null,
            weight_kg: weight_kg || null,
            breed: breed || null,
            gender: gender || null,
            notes: notes || null,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
            vaccination_records: [],
            medical_history: [],
            movement_history: [],
            last_known_position: {
                distance_from_boundary: 0,
                sensor_id: null,
                timestamp: FieldValue.serverTimestamp()
            }
        };

        const livestockRef = await firestore
            .collection('livestock')
            .add(livestockData);

        // Update zone livestock count
        await firestore
            .collection('boundary_zones')
            .doc(zone_id)
            .update({
                current_livestock_count: FieldValue.increment(1)
            });

        // Update farm livestock count
        await firestore
            .collection('farms')
            .doc(farm_id)
            .update({
                livestock_count: FieldValue.increment(1)
            });

        res.status(201).json({
            success: true,
            message: 'Livestock added successfully',
            data: {
                livestock_id: livestockRef.id,
                ...livestockData
            }
        });

    } catch (error) {
        console.error('Add livestock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add livestock',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/livestock
 * @desc    Get all livestock with filters
 * @access  Protected
 */
router.get('/', [
    query('farm_id').optional(),
    query('zone_id').optional(),
    query('animal_type').optional(),
    query('status').optional().isIn(['inside_boundary', 'outside_boundary', 'unknown']),
    query('health_status').optional(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
], async (req, res) => {
    try {
        const {
            farm_id,
            zone_id,
            animal_type,
            status,
            health_status,
            limit = 50,
            offset = 0
        } = req.query;

        let query = firestore.collection('livestock');

        // Apply filters
        if (farm_id) {
            query = query.where('farm_id', '==', farm_id);
        }

        if (zone_id) {
            query = query.where('zone_id', '==', zone_id);
        }

        if (animal_type) {
            query = query.where('animal_type', '==', animal_type);
        }

        if (status) {
            query = query.where('current_status', '==', status);
        }

        if (health_status) {
            query = query.where('health_status', '==', health_status);
        }

        // Apply pagination
        query = query.limit(parseInt(limit)).offset(parseInt(offset));

        const snapshot = await query.get();
        const livestock = [];

        snapshot.forEach(doc => {
            livestock.push({
                livestock_id: doc.id,
                ...doc.data()
            });
        });

        // Get total count for pagination
        const countSnapshot = await firestore
            .collection('livestock')
            .where('farm_id', '==', farm_id || '')
            .get();

        res.status(200).json({
            success: true,
            message: 'Livestock retrieved',
            data: {
                count: livestock.length,
                total: countSnapshot.size,
                offset: parseInt(offset),
                livestock
            }
        });

    } catch (error) {
        console.error('Get livestock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get livestock',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/livestock/:livestockId
 * @desc    Get single livestock details
 * @access  Protected
 */
router.get('/:livestockId', async (req, res) => {
    try {
        const { livestockId } = req.params;

        const livestockDoc = await firestore
            .collection('livestock')
            .doc(livestockId)
            .get();

        if (!livestockDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Livestock not found'
            });
        }

        const livestockData = livestockDoc.data();

        // Get recent movement history from alerts
        const recentAlerts = await firestore
            .collection('alerts')
            .where('livestock_id', '==', livestockId)
            .orderBy('detected_at', 'desc')
            .limit(10)
            .get();

        const alerts = [];
        recentAlerts.forEach(doc => {
            alerts.push({
                alert_id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            message: 'Livestock details retrieved',
            data: {
                livestock_id: livestockId,
                ...livestockData,
                recent_alerts: alerts
            }
        });

    } catch (error) {
        console.error('Get livestock details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get livestock details',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/livestock/:livestockId
 * @desc    Update livestock information
 * @access  Protected
 */
router.put('/:livestockId', [
    body('zone_id').optional(),
    body('health_status').optional().isIn(['healthy', 'sick', 'injured', 'quarantine']),
    body('weight_kg').optional().isFloat({ min: 0 }),
    body('notes').optional()
], async (req, res) => {
    try {
        const { livestockId } = req.params;
        const updateData = { ...req.body };

        // Remove undefined values
        Object.keys(updateData).forEach(key => 
            updateData[key] === undefined && delete updateData[key]
        );

        // Add updated timestamp
        updateData.updated_at = FieldValue.serverTimestamp();

        // If zone is being changed, update counts
        if (updateData.zone_id) {
            const livestockDoc = await firestore
                .collection('livestock')
                .doc(livestockId)
                .get();

            if (livestockDoc.exists) {
                const oldZoneId = livestockDoc.data().zone_id;

                // Decrease old zone count
                await firestore
                    .collection('boundary_zones')
                    .doc(oldZoneId)
                    .update({
                        current_livestock_count: FieldValue.increment(-1)
                    });

                // Increase new zone count
                await firestore
                    .collection('boundary_zones')
                    .doc(updateData.zone_id)
                    .update({
                        current_livestock_count: FieldValue.increment(1)
                    });

                // Get new zone name for denormalization
                const newZoneDoc = await firestore
                    .collection('boundary_zones')
                    .doc(updateData.zone_id)
                    .get();

                if (newZoneDoc.exists) {
                    updateData.zone_name = newZoneDoc.data().zone_name;
                }
            }
        }

        await firestore
            .collection('livestock')
            .doc(livestockId)
            .update(updateData);

        res.status(200).json({
            success: true,
            message: 'Livestock updated successfully',
            data: {
                livestock_id: livestockId,
                updated_fields: Object.keys(updateData)
            }
        });

    } catch (error) {
        console.error('Update livestock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update livestock',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/livestock/:livestockId
 * @desc    Remove livestock from system
 * @access  Protected
 */
router.delete('/:livestockId', async (req, res) => {
    try {
        const { livestockId } = req.params;

        // Get livestock data first
        const livestockDoc = await firestore
            .collection('livestock')
            .doc(livestockId)
            .get();

        if (!livestockDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Livestock not found'
            });
        }

        const livestockData = livestockDoc.data();

        // Delete the livestock
        await firestore
            .collection('livestock')
            .doc(livestockId)
            .delete();

        // Update zone count
        await firestore
            .collection('boundary_zones')
            .doc(livestockData.zone_id)
            .update({
                current_livestock_count: FieldValue.increment(-1)
            });

        // Update farm count
        await firestore
            .collection('farms')
            .doc(livestockData.farm_id)
            .update({
                livestock_count: FieldValue.increment(-1)
            });

        res.status(200).json({
            success: true,
            message: 'Livestock removed successfully',
            data: {
                livestock_id: livestockId,
                identification_tag: livestockData.identification_tag
            }
        });

    } catch (error) {
        console.error('Delete livestock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove livestock',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/livestock/:livestockId/vaccination
 * @desc    Add vaccination record
 * @access  Protected
 */
router.post('/:livestockId/vaccination', [
    body('vaccine_name').notEmpty(),
    body('vaccination_date').isISO8601(),
    body('next_due_date').optional().isISO8601(),
    body('veterinarian').optional(),
    body('notes').optional()
], async (req, res) => {
    try {
        const { livestockId } = req.params;
        const {
            vaccine_name,
            vaccination_date,
            next_due_date,
            veterinarian,
            notes
        } = req.body;

        const vaccinationRecord = {
            vaccine_name,
            vaccination_date,
            next_due_date: next_due_date || null,
            veterinarian: veterinarian || null,
            notes: notes || null,
            recorded_at: FieldValue.serverTimestamp()
        };

        await firestore
            .collection('livestock')
            .doc(livestockId)
            .update({
                vaccination_records: FieldValue.arrayUnion(vaccinationRecord),
                updated_at: FieldValue.serverTimestamp()
            });

        res.status(200).json({
            success: true,
            message: 'Vaccination record added',
            data: vaccinationRecord
        });

    } catch (error) {
        console.error('Add vaccination error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add vaccination record',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/livestock/:livestockId/medical
 * @desc    Add medical history entry
 * @access  Protected
 */
router.post('/:livestockId/medical', [
    body('condition').notEmpty(),
    body('treatment').notEmpty(),
    body('date').isISO8601(),
    body('veterinarian').optional(),
    body('medication').optional(),
    body('follow_up_date').optional().isISO8601()
], async (req, res) => {
    try {
        const { livestockId } = req.params;
        const {
            condition,
            treatment,
            date,
            veterinarian,
            medication,
            follow_up_date
        } = req.body;

        const medicalRecord = {
            condition,
            treatment,
            date,
            veterinarian: veterinarian || null,
            medication: medication || null,
            follow_up_date: follow_up_date || null,
            recorded_at: FieldValue.serverTimestamp()
        };

        await firestore
            .collection('livestock')
            .doc(livestockId)
            .update({
                medical_history: FieldValue.arrayUnion(medicalRecord),
                health_status: 'sick', // Auto-update health status
                updated_at: FieldValue.serverTimestamp()
            });

        res.status(200).json({
            success: true,
            message: 'Medical record added',
            data: medicalRecord
        });

    } catch (error) {
        console.error('Add medical record error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add medical record',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/livestock/stats/:farmId
 * @desc    Get livestock statistics for a farm
 * @access  Protected
 */
router.get('/stats/:farmId', async (req, res) => {
    try {
        const { farmId } = req.params;

        // Get all livestock for the farm
        const livestockSnapshot = await firestore
            .collection('livestock')
            .where('farm_id', '==', farmId)
            .get();

        const stats = {
            total_count: 0,
            by_type: {},
            by_zone: {},
            by_health_status: {
                healthy: 0,
                sick: 0,
                injured: 0,
                quarantine: 0
            },
            by_status: {
                inside_boundary: 0,
                outside_boundary: 0,
                unknown: 0
            }
        };

        livestockSnapshot.forEach(doc => {
            const data = doc.data();
            stats.total_count++;

            // Count by type
            stats.by_type[data.animal_type] = (stats.by_type[data.animal_type] || 0) + 1;

            // Count by zone
            stats.by_zone[data.zone_name] = (stats.by_zone[data.zone_name] || 0) + 1;

            // Count by health status
            if (stats.by_health_status.hasOwnProperty(data.health_status)) {
                stats.by_health_status[data.health_status]++;
            }

            // Count by boundary status
            if (stats.by_status.hasOwnProperty(data.current_status)) {
                stats.by_status[data.current_status]++;
            }
        });

        res.status(200).json({
            success: true,
            message: 'Livestock statistics retrieved',
            data: stats
        });

    } catch (error) {
        console.error('Get livestock stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get livestock statistics',
            error: error.message
        });
    }
});

module.exports = router;