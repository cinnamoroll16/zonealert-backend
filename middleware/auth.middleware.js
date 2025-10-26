// middleware/auth.middleware.js
const { admin } = require('../config/firebase.config');

/**
 * Middleware to verify Firebase ID token
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;

    // Debug logging
    console.log('=== AUTH DEBUG ===');
    console.log('Authorization Header:', authHeader);
    
    // Check if authorization header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
        hint: 'Include header: Authorization: Bearer <your_id_token>'
      });
    }

    // Check if it starts with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format',
        hint: 'Authorization header must start with "Bearer "',
        received: authHeader.substring(0, 20) + '...'
      });
    }

    // Extract token - Fix for "Token unformat" issue
    // Method 1: Using substring (more reliable)
    const idToken = authHeader.substring(7).trim();
    
    // Method 2: Using split (alternative)
    // const idToken = authHeader.split('Bearer ')[1].trim();
    
    console.log('Extracted Token Length:', idToken.length);
    console.log('Token Preview:', idToken.substring(0, 30) + '...');

    // Validate token is not empty
    if (!idToken || idToken === '') {
      return res.status(401).json({
        success: false,
        message: 'Token is empty after Bearer prefix'
      });
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('✅ Token verified for user:', decodedToken.uid);
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError.code, verifyError.message);
      
      // Handle specific Firebase Auth errors
      if (verifyError.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
          hint: 'Please login again to get a new token'
        });
      }

      if (verifyError.code === 'auth/argument-error') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format',
          hint: 'Token must be a valid Firebase ID token',
          debug: {
            tokenLength: idToken.length,
            tokenPreview: idToken.substring(0, 50) + '...'
          }
        });
      }

      if (verifyError.code === 'auth/id-token-revoked') {
        return res.status(401).json({
          success: false,
          message: 'Token has been revoked',
          hint: 'Please login again'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid or malformed token',
        error: verifyError.message,
        code: verifyError.code
      });
    }

    // Attach user data to request object
    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name || null
    };

    console.log('✅ User authenticated:', req.user.userId);
    console.log('=== AUTH SUCCESS ===\n');

    // Continue to next middleware/route handler
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

/**
 * Optional: Middleware to verify API Key for IoT devices
 */
const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required',
        hint: 'Include header: X-API-Key: <your_api_key>'
      });
    }

    // Verify API key exists in database
    const { firestore } = require('../config/firebase.config');
    const apiKeySnapshot = await firestore
      .collection('API_Keys')
      .where('api_key', '==', apiKey)
      .where('is_active', '==', true)
      .limit(1)
      .get();

    if (apiKeySnapshot.empty) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API key'
      });
    }

    const apiKeyDoc = apiKeySnapshot.docs[0];
    const apiKeyData = apiKeyDoc.data();

    // Update last used timestamp and usage count
    await apiKeyDoc.ref.update({
      last_used: admin.firestore.FieldValue.serverTimestamp(),
      usage_count: admin.firestore.FieldValue.increment(1)
    });

    // Attach farmer_id to request
    req.apiAuth = {
      farmer_id: apiKeyData.farmer_id,
      api_key_id: apiKeyDoc.id
    };

    next();

  } catch (error) {
    console.error('API key verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'API key verification failed',
      error: error.message
    });
  }
};

// IMPORTANT: Export as an object with named functions
module.exports = {
  verifyToken,
  verifyApiKey
};