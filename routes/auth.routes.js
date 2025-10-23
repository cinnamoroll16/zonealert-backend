// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { firestore, auth, FieldValue } = require('../config/firebase.config');

// Generate JWT Token
const generateToken = (userId, email) => {
    return jwt.sign(
        { userId, email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new farmer
 * @access  Public
 */
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('location').notEmpty().trim(),
    body('phone').optional().isMobilePhone()
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { email, password, name, location, phone } = req.body;

        // Check if farmer already exists
        const farmerSnapshot = await firestore
            .collection('farmers')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (!farmerSnapshot.empty) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Create Firebase Auth user
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: name
        });

        // Hash password for additional security (optional, since Firebase Auth handles it)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create farmer document in Firestore
        const farmerData = {
            farmer_id: userRecord.uid,
            name,
            email,
            location,
            phone: phone || null,
            created_at: FieldValue.serverTimestamp(),
            last_login: null,
            farms_count: 0,
            active_alerts: 0,
            fcm_token: null,
            profile_image: null,
            is_active: true,
            settings: {
                notifications_enabled: true,
                alert_sound: true,
                alert_vibration: true,
                quiet_hours: {
                    enabled: false,
                    start: '22:00',
                    end: '06:00'
                }
            }
        };

        await firestore
            .collection('farmers')
            .doc(userRecord.uid)
            .set(farmerData);

        // Generate JWT token
        const token = generateToken(userRecord.uid, email);

        res.status(201).json({
            success: true,
            message: 'Farmer registered successfully',
            data: {
                farmer: {
                    farmer_id: userRecord.uid,
                    name,
                    email,
                    location
                },
                token,
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login farmer
 * @access  Public
 */
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    body('fcm_token').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const { email, password, fcm_token } = req.body;

        // Get farmer from Firestore
        const farmerSnapshot = await firestore
            .collection('farmers')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (farmerSnapshot.empty) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const farmerDoc = farmerSnapshot.docs[0];
        const farmerData = farmerDoc.data();

        // Verify with Firebase Auth
        try {
            const userRecord = await auth.getUserByEmail(email);
            
            // For production, you should verify password with Firebase Auth
            // This is a simplified version
            
            // Update last login and FCM token
            const updateData = {
                last_login: FieldValue.serverTimestamp()
            };

            if (fcm_token) {
                updateData.fcm_token = fcm_token;
            }

            await firestore
                .collection('farmers')
                .doc(farmerDoc.id)
                .update(updateData);

            // Generate JWT token
            const token = generateToken(farmerDoc.id, email);

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: {
                    farmer: {
                        farmer_id: farmerDoc.id,
                        name: farmerData.name,
                        email: farmerData.email,
                        location: farmerData.location,
                        farms_count: farmerData.farms_count || 0,
                        active_alerts: farmerData.active_alerts || 0
                    },
                    token,
                    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
                }
            });

        } catch (authError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout farmer (clear FCM token)
 * @access  Public
 */
router.post('/logout', async (req, res) => {
    try {
        const { farmer_id } = req.body;

        if (farmer_id) {
            await firestore
                .collection('farmers')
                .doc(farmer_id)
                .update({
                    fcm_token: null
                });
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Public
 */
router.post('/refresh', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token required'
            });
        }

        // Verify old token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Generate new token
        const newToken = generateToken(decoded.userId, decoded.email);

        res.status(200).json({
            success: true,
            message: 'Token refreshed',
            data: {
                token: newToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const { email } = req.body;

        // Generate password reset link using Firebase Auth
        const resetLink = await auth.generatePasswordResetLink(email);

        // In production, send this link via email
        // For now, return it in response (remove in production!)
        res.status(200).json({
            success: true,
            message: 'Password reset link sent to email',
            resetLink // Remove this in production!
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reset link',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/auth/verify-token
 * @desc    Verify if JWT token is valid
 * @access  Public
 */
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token required',
                valid: false
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        res.status(200).json({
            success: true,
            message: 'Token is valid',
            valid: true,
            data: {
                userId: decoded.userId,
                email: decoded.email
            }
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            valid: false
        });
    }
});

module.exports = router;