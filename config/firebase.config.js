// config/firebase.config.js
const admin = require('firebase-admin');
const path = require('path');
// Initialize Firebase Admin SDK
// You need to download your service account key from Firebase Console
// and place it in the config folder or use environment variables

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // For production: Use environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // For development: Use service account file
    serviceAccount = require('./serviceAccountKey.json');
}

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://zonealert-6019d-default-rtdb.asia-southeast1.firebasedatabase.app',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'your-project.appspot.com'
});
// Get Firestore instance (for main data)
const firestore = admin.firestore();

// Get Realtime Database instance (for sensor readings)
const realtimeDb = admin.database();

// Get Firebase Auth instance
const auth = admin.auth();

// Get Firebase Storage instance
const storage = admin.storage();

// Configure Firestore settings
firestore.settings({
    ignoreUndefinedProperties: true,
    timestampsInSnapshots: true
});

// Export instances
module.exports = {
    admin,
    firestore,
    realtimeDb,
    auth,
    storage,
    // Helper functions
    FieldValue: admin.firestore.FieldValue,
    Timestamp: admin.firestore.Timestamp,
    GeoPoint: admin.firestore.GeoPoint,
    ServerValue: admin.database.ServerValue
};

console.log('✅ Firebase services initialized successfully');
console.log('- Firestore: Connected');
console.log('- Realtime Database: Connected');
console.log('- Authentication: Ready');
console.log('- Storage: Ready');