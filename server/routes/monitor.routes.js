const express = require('express');
const router = express.Router();
const { monitorController } = require('../controllers');

router.get('/stats', monitorController.getStats);
router.post('/reset', monitorController.resetStats);

module.exports = router;
