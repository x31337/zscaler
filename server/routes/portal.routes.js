const express = require('express');
const router = express.Router();

router.get('/status/:type', (req, res) => {
    const { type } = req.params;
    res.json({
        type,
        connected: true,
        lastCheck: new Date().toISOString(),
        url: type === 'company' ? 'admin.zscaler.net' : 'partner.zscaler.net'
    });
});

module.exports = router;
