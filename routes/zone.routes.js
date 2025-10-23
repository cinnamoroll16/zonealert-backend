// routes/zone.routes.js
const express = require('express');
const router = express.Router();

// Example test route
router.get('/test', (req, res) => {
  res.json({ message: 'Zone route working properly!' });
});

module.exports = router;
