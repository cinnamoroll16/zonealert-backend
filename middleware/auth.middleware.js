// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { auth, firestore } = require('../config/firebase.config');

/**
 * Verify JWT Token Middleware
 */
const verifyToken = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Optional: Verify user still exists in database
        const userDoc = await firestore
            .collection('farmers')
            .doc(decoded.userId)
            .get();

        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Add user info to request
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            userData: userDoc.data()
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
                expired: true
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Token verification failed',
            error: error.message
        });
    }
};

/**
 * Verify IoT Device API Key
 */
const verifyIoTDevice = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.body.api_key;

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key required'
        });
    }

    if (apiKey !== process.env.IOT_API_KEY) {
        return res.status(401).json({
            success: false,
            message: 'Invalid API key'
        });
    }

    next();
};

/**
 * Optional Authentication - Continues even if no token
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            req.user = {
                userId: decoded.userId,
                email: decoded.email
            };
        }

        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

/**
 * Check if user owns the farm
 */
const verifyFarmOwnership = async (req, res, next) => {
    try {
        const farmId = req.params.farmId || req.body.farm_id;
        const userId = req.user.userId;

        if (!farmId) {
            return res.status(400).json({
                success: false,
                message: 'Farm ID required'
            });
        }

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

        const farmData = farmDoc.data();

        if (farmData.farmer_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You do not own this farm'
            });
        }

        req.farm = {
            farmId,
            farmData
        };

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Failed to verify farm ownership',
            error: error.message
        });
    }
};

module.exports = {
    verifyToken,
    verifyIoTDevice,
    optionalAuth,
    verifyFarmOwnership
};