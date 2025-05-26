const express = require('express');
const router = express.Router();
const { protectionController } = require('../controllers');

router.get('/status', protectionController.getStatus);
router.post('/toggle', protectionController.toggle);
router.get('/threats', protectionController.getThreats);
router.get('/logs', protectionController.getLogs);

module.exports = router;
