const express = require('express');
const router = express.Router();
const networkController = require('../controllers/network.controller');

router.get('/status', networkController.getStatus);
router.get('/ip/public', networkController.getPublicIP);
router.get('/ip/private', networkController.getPrivateIPs);
router.get('/latency', networkController.getLatency);

module.exports = router;
