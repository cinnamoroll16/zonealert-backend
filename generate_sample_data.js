// generate_sample_data.js
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

const serviceAccount = require("./config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function generateSampleData() {
  console.log("🌱 Generating sample data...");

  // 1. Farmer
  const farmers = [];
  for (let i = 1; i <= 3; i++) {
    const id = uuidv4();
    const farmer = {
      farmer_id: id,
      name: `Farmer ${i}`,
      email: `farmer${i}@example.com`,
      password: "hashed_password_here",
      created_at: new Date(),
      last_login: new Date(),
    };
    await db.collection("Farmers").doc(id).set(farmer);
    farmers.push(farmer);
  }

  // 2. Farm
  const farms = [];
  for (const farmer of farmers) {
    for (let j = 1; j <= 2; j++) {
      const id = uuidv4();
      const farm = {
        farm_id: id,
        farmer_id: farmer.farmer_id,
        farm_name: `Farm ${j} of ${farmer.name}`,
        location: "Cebu, Philippines",
        total_area: `${Math.floor(Math.random() * 10) + 1} hectares`,
        created_at: new Date(),
      };
      await db.collection("Farms").doc(id).set(farm);
      farms.push(farm);
    }
  }

  // 3. Boundary_Zone
  const zones = [];
  for (const farm of farms) {
    const id = uuidv4();
    const zone = {
      zone_id: id,
      farm_id: farm.farm_id,
      zone_name: `Zone A - ${farm.farm_name}`,
      boundary_coordinates: "10.3157,123.8854",
      max_distance_threshold: 100,
      is_active: true,
      created_at: new Date(),
    };
    await db.collection("Boundary_Zones").doc(id).set(zone);
    zones.push(zone);
  }

  // 4. Sensor_Unit
  const sensors = [];
  for (const zone of zones) {
    const id = uuidv4();
    const sensor = {
      sensor_id: id,
      farm_id: zone.farm_id,
      zone_id: zone.zone_id,
      sensor_type: "Ultrasonic",
      device_id: `DEV-${Math.floor(Math.random() * 1000)}`,
      location_description: "North fence corner",
      battery_level: `${Math.floor(Math.random() * 100)}%`,
      is_operational: true,
    };
    await db.collection("Sensor_Units").doc(id).set(sensor);
    sensors.push(sensor);
  }

  // 5. Livestock
  const livestock = [];
  for (const zone of zones) {
    for (let i = 1; i <= 2; i++) {
      const id = uuidv4();
      const animal = {
        livestock_id: id,
        zone_id: zone.zone_id,
        animal_type: i % 2 === 0 ? "Goat" : "Cow",
        identification_tag: `TAG-${Math.floor(Math.random() * 10000)}`,
        current_status: "Active",
        is_detected: true,
        breach_count: Math.floor(Math.random() * 5),
      };
      await db.collection("Livestock").doc(id).set(animal);
      livestock.push(animal);
    }
  }

  // 6. Alerts
  for (const sensor of sensors) {
    const id = uuidv4();
    const alert = {
      alert_id: id,
      sensor_id: sensor.sensor_id,
      livestock_id: livestock[0].livestock_id,
      zone_id: sensor.zone_id,
      alert_type: "Boundary Breach",
      breach_level: "High",
      breach_distance: Math.random() * 50,
      description: "Livestock moved beyond boundary limit",
      is_resolved: false,
      detected_at: new Date(),
      received_at: null,
    };
    await db.collection("Alerts").doc(id).set(alert);
  }

  // 7. Notifications
  const notifications = [];
  for (let i = 0; i < 3; i++) {
    const id = uuidv4();
    const notif = {
      notification_id: id,
      alert_id: sensors[0].sensor_id,
      farmer_id: farmers[0].farmer_id,
      message: `Alert triggered at ${new Date().toLocaleTimeString()}`,
      is_read: false,
      delivery_status: "Delivered",
      sent_at: new Date(),
      read_at: null,
    };
    await db.collection("Notifications").doc(id).set(notif);
    notifications.push(notif);
  }

  // 8. System_Analog
  for (const sensor of sensors) {
    const id = uuidv4();
    const log = {
      log_id: id,
      sensor_id: sensor.sensor_id,
      event_type: "Battery Low",
      description: "Battery level dropped below 20%",
      timestamp: new Date(),
    };
    await db.collection("System_Analog").doc(id).set(log);
  }

  console.log("✅ Sample data generation complete!");
}

generateSampleData()
  .then(() => process.exit())
  .catch((error) => {
    console.error("❌ Error generating sample data:", error);
    process.exit(1);
  });
