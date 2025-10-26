// config/firebase.config.js
/**
 * Firebase Admin SDK Configuration
 * 
 * Setup Instructions:
 * 1. Go to Firebase Console (https://console.firebase.google.com)
 * 2. Select your project
 * 3. Go to Project Settings > Service Accounts
 * 4. Click "Generate New Private Key"
 * 5. Save as 'serviceAccountKey.json' in this config folder
 * 6. Update the path below if needed
 */

const admin = require('firebase-admin');

// Import your service account key
// Download this from Firebase Console
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

// Get Firestore instance
const firestore = admin.firestore();

// Get Realtime Database instance
const realtimeDb = admin.database();

// Firestore helpers
const FieldValue = admin.firestore.FieldValue;
const GeoPoint = admin.firestore.GeoPoint;
const Timestamp = admin.firestore.Timestamp;

// Firestore settings (optional)
firestore.settings({
  timestampsInSnapshots: true
});

console.log('✅ Firebase Admin SDK initialized');
console.log(`📦 Project ID: ${serviceAccount.project_id}`);

// Export for use in routes
module.exports = {
  admin,
  firestore,
  realtimeDb,
  FieldValue,
  GeoPoint,
  Timestamp
};

// ========================================
// ALTERNATIVE: Environment Variables
// ========================================
// If you prefer to use environment variables instead of service account file:

/*
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const firestore = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const GeoPoint = admin.firestore.GeoPoint;
const Timestamp = admin.firestore.Timestamp;

module.exports = {
  admin,
  firestore,
  FieldValue,
  GeoPoint,
  Timestamp
};
*/

// ========================================
// EXAMPLE .env FILE
// ========================================
/*
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
*/