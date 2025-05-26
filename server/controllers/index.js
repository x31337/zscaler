const networkController = require('./network.controller');
const protectionService = require('../services/protection.service');
const monitorService = require('../services/monitor.service');

// Protection controller
exports.protectionController = {
    getStatus: (req, res) => {
        res.json(protectionService.getStatus());
    },
    toggle: (req, res) => {
        const { enabled } = req.body;
        res.json(protectionService.toggle(enabled));
    },
    getThreats: (req, res) => {
        res.json(protectionService.getThreats());
    },
    getLogs: (req, res) => {
        res.json(protectionService.getLogs());
    }
};

// Monitor controller
exports.monitorController = {
    getStats: (req, res) => {
        res.json(monitorService.getStats());
    },
    resetStats: (req, res) => {
        monitorService.reset();
        res.json({ success: true });
    }
};

// Network controller export
exports.networkController = networkController;
