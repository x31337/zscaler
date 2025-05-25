// Portal Service Implementation
const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const app = express();

// Database configuration
const pool = mysql.createPool({
    host: 'localhost',
    user: 'zscaler',
    password: 'zscaler123',
    database: 'zscaler_settings',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Zscaler settings mapping
const ZSCALER_SETTINGS = {
    company: {
        base: 'zscaler.net',
        portal: 'admin.zscaler.net',
        api: 'api.zscaler.net'
    },
    partner: {
        base: 'zscalerpartner.net',
        portal: 'partner.zscaler.net',
        api: 'api.zscalerpartner.net'
    }
};

app.use(cors());
app.use(express.json());

// Auto-detect Zscaler settings based on email
function detectZscalerSettings(email, portalType) {
    if (!email || !email.includes('@')) {
        throw new Error('Invalid email format');
    }

    const domain = email.split('@')[1];
    const settings = ZSCALER_SETTINGS[portalType];
    
    return {
        ...settings,
        domain: domain,
        portal: `${domain}.${settings.base}`,
        lastUpdated: new Date().toISOString()
    };
}

// Save portal settings with auto-detection
app.post('/api/portal-settings', async (req, res) => {
    const { portal_type, email } = req.body;
    
    try {
        // Auto-detect settings based on email
        const settings = detectZscalerSettings(email, portal_type);
        
        // Store in database with auto-detected settings
        const [result] = await pool.promise().execute(
            'INSERT INTO portal_settings (portal_type, email, url, settings, auto_detected) ' +
            'VALUES (?, ?, ?, ?, true) ' +
            'ON DUPLICATE KEY UPDATE email = ?, url = ?, settings = ?, auto_detected = true',
            [
                portal_type,
                email,
                settings.portal,
                JSON.stringify(settings),
                email,
                settings.portal,
                JSON.stringify(settings)
            ]
        );
        
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('Error saving portal settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save settings' 
        });
    }
});

// Get portal settings
app.get('/api/portal-settings/:type', async (req, res) => {
    const portalType = req.params.type;
    
    try {
        const [rows] = await pool.promise().execute(
            'SELECT email, url, settings, auto_detected FROM portal_settings WHERE portal_type = ?',
            [portalType]
        );
        
        if (rows.length > 0) {
            res.json({ 
                success: true, 
                settings: rows[0] 
            });
        } else {
            res.json({ 
                success: true, 
                settings: null 
            });
        }
    } catch (error) {
        console.error('Error getting portal settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get settings' 
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Portal settings service running on port ${PORT}`);
});

module.exports = app;
