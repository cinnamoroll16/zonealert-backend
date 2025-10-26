// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { admin, firestore, FieldValue } = require('../config/firebase.config');
const { verifyToken } = require('../middleware/auth.middleware');
const crypto = require('crypto');

/**
 * @route   POST /api/auth/register
 * @desc    Register new farmer account
 * @access  Public
 */
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('phone').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password, name, phone } = req.body;

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    // Create Farmer document
    const farmerData = {
      farmer_id: userRecord.uid,
      name,
      email,
      phone: phone || null,
      created_at: FieldValue.serverTimestamp(),
      last_login: null,
      farms_count: 0,
      is_active: true
    };

    await firestore
      .collection('Farmers')
      .doc(userRecord.uid)
      .set(farmerData);

    // Generate first API key automatically
    const apiKey = 'zk_' + crypto.randomBytes(32).toString('hex');
    
    const apiKeyData = {
      farmer_id: userRecord.uid,
      api_key: apiKey,
      name: 'Default API Key',
      description: 'Auto-generated API key for IoT devices',
      created_at: FieldValue.serverTimestamp(),
      last_used: null,
      is_active: true,
      usage_count: 0
    };

    await firestore
      .collection('API_Keys')
      .add(apiKeyData);

    // Generate custom token for immediate login
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          name: name
        },
        api_key: apiKey,
        custom_token: customToken
      },
      note: 'Use custom_token to get ID token for authentication'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login and get custom token
 * @access  Public
 */
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Get user by email
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Note: Firebase Admin SDK cannot verify password directly
    // Password verification happens on client side or you need Firebase Auth REST API
    
    // Generate custom token
    const customToken = await admin.auth().createCustomToken(user.uid);

    // Update last login
    await firestore
      .collection('Farmers')
      .doc(user.uid)
      .update({
        last_login: FieldValue.serverTimestamp()
      });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          uid: user.uid,
          email: user.email,
          name: user.displayName
        },
        custom_token: customToken
      },
      note: 'Exchange custom_token for ID token using Firebase Auth SDK'
    });

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
 * @route   POST /api/auth/verify-password
 * @desc    Verify user password using Firebase Auth REST API
 * @access  Public
 */
router.post('/verify-password', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Use Firebase Auth REST API to verify password
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAlQYCzRWbQaE4b7QqeGCyOJLh0qwQH2uk';
    
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await firestore
      .collection('Farmers')
      .doc(data.localId)
      .update({
        last_login: FieldValue.serverTimestamp()
      });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          uid: data.localId,
          email: data.email
        },
        id_token: data.idToken,
        refresh_token: data.refreshToken,
        expires_in: data.expiresIn
      }
    });

  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
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

    res.status(200).json({
      success: true,
      message: 'Profile retrieved',
      data: {
        uid: farmer_id,
        ...farmerData
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Protected
 */
router.put('/profile', verifyToken, [
  body('name').optional().trim(),
  body('phone').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

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

    // Update display name in Firebase Auth
    if (name) {
      await admin.auth().updateUser(farmer_id, {
        displayName: name
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updateData
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Protected
 */
router.post('/change-password', verifyToken, [
  body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const farmer_id = req.user.userId;
    const { new_password } = req.body;

    await admin.auth().updateUser(farmer_id, {
      password: new_password
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Generate password reset link
    const link = await admin.auth().generatePasswordResetLink(email);

    res.status(200).json({
      success: true,
      message: 'Password reset link generated',
      data: {
        reset_link: link
      },
      note: 'In production, send this link via email. For demo, link is provided.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        message: 'No user found with this email'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to generate reset link',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Protected
 */
router.delete('/account', verifyToken, async (req, res) => {
  try {
    const farmer_id = req.user.userId;

    // Delete Farmer document
    await firestore
      .collection('Farmers')
      .doc(farmer_id)
      .delete();

    // Delete Firebase Auth user
    await admin.auth().deleteUser(farmer_id);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
});

module.exports = router;