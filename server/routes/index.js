const express = require('express');
const router = express.Router();

// Routes
const healthRoutes = require('./health.routes');
const networkRoutes = require('./network.routes');
const protectionRoutes = require('./protection.routes');
const portalRoutes = require('./portal.routes');
const monitorRoutes = require('./monitor.routes');

// Register routes
router.use('/health', healthRoutes);
router.use('/network', networkRoutes);
router.use('/protection', protectionRoutes);
router.use('/portal', portalRoutes);
router.use('/monitor', monitorRoutes);

module.exports = router;
