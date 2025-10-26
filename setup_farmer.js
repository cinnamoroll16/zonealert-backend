// setup_farmer.js
// Creates Firebase Auth user AND Farmer document in one step
const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const FARMER_EMAIL = 'demo@zonealert.com';
const FARMER_PASSWORD = 'password123';
const FARMER_NAME = 'Demo Farmer';

async function setupFarmer() {
  try {
    console.log('🔄 Setting up farmer account...\n');

    // Step 1: Create or get Firebase Auth user
    let user;
    try {
      user = await admin.auth().getUserByEmail(FARMER_EMAIL);
      console.log('✅ User already exists in Firebase Auth');
      console.log(`   UID: ${user.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log('📝 Creating new Firebase Auth user...');
        user = await admin.auth().createUser({
          email: FARMER_EMAIL,
          password: FARMER_PASSWORD,
          displayName: FARMER_NAME
        });
        console.log('✅ Firebase Auth user created');
        console.log(`   UID: ${user.uid}`);
      } else {
        throw error;
      }
    }

    // Step 2: Create Farmer document in Firestore
    const farmerData = {
      farmer_id: user.uid,
      name: FARMER_NAME,
      email: FARMER_EMAIL,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      farms_count: 0
    };

    await db.collection('Farmers').doc(user.uid).set(farmerData);

    console.log('\n✅ Farmer document created in Firestore');
    console.log('📋 Collection: Farmers');
    console.log(`   Document ID: ${user.uid}`);
    console.log(`   Name: ${FARMER_NAME}`);
    console.log(`   Email: ${FARMER_EMAIL}`);

    console.log('\n🎉 Setup complete!');
    console.log('\n📱 Next steps:');
    console.log('1. Run: node get_token.js');
    console.log('2. Copy the token');
    console.log('3. Use in Postman: Authorization: Bearer <token>');
    console.log('4. Create farms with POST /api/farms');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
    process.exit(1);
  }
}

setupFarmer();