// routes/farmer.routes.js
const express = require('express');
const router = express.Router();

// Example route to test connectivity
router.get('/test', (req, res) => {
  res.json({ message: 'Farmer route working properly!' });
});

module.exports = router;
