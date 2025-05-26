const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { networkInterfaces } = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 3000;

// MySQL connection configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'zscaler',
  database: 'zscaler_extension'
};

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool(dbConfig);

// Initialize database tables
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create portal_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        url VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create protection_status table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS protection_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        enabled BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'checking',
        last_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        public_ip VARCHAR(45),
        private_ip VARCHAR(45),
        docker_ip VARCHAR(45),
        non_private_ip VARCHAR(45)
      )
    `);

    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Network utilities
async function getNetworkInfo() {
  const interfaces = networkInterfaces();
  const ips = {
    private: null,
    docker: null,
    nonPrivate: null
  };

  // Get local IPs
  Object.values(interfaces).flat().forEach(iface => {
    if (iface.family === 'IPv4') {
      if (iface.internal) return;
      
      if (iface.address.startsWith('172.17.')) {
        ips.docker = iface.address;
      } else if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
        ips.private = iface.address;
      } else {
        ips.nonPrivate = iface.address;
      }
    }
  });

  // Get public IP
  try {
    const { stdout } = await execAsync('curl -s https://api.ipify.org');
    ips.public = stdout.trim();
  } catch (error) {
    console.error('Error getting public IP:', error);
    ips.public = null;
  }

  return ips;
}

// Routes

// Get network status
app.get('/api/network-status', async (req, res) => {
  try {
    const networkInfo = await getNetworkInfo();
    
    res.json({
      success: true,
      ...networkInfo
    });
  } catch (error) {
    console.error('Error getting network status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get network status'
    });
  }
});

// Get protection status
app.get('/api/status', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM protection_status ORDER BY id DESC LIMIT 1');
    
    res.json({
      success: true,
      status: rows[0]?.status || 'checking',
      protectionEnabled: rows[0]?.enabled ?? true
    });
  } catch (error) {
    console.error('Error getting protection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get protection status'
    });
  }
});

// Update protection status
app.post('/api/protection', async (req, res) => {
  const { enabled } = req.body;
  
  try {
    await pool.execute(
      'INSERT INTO protection_status (enabled, status) VALUES (?, ?)',
      [enabled, enabled ? 'protected' : 'disabled']
    );
    
    res.json({
      success: true,
      enabled
    });
  } catch (error) {
    console.error('Error updating protection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update protection status'
    });
  }
});

// Get portal settings
app.get('/api/portal-settings/:type', async (req, res) => {
  const { type } = req.params;
  
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM portal_settings WHERE type = ? ORDER BY id DESC LIMIT 1',
      [type]
    );
    
    res.json({
      success: true,
      settings: rows[0] || null
    });
  } catch (error) {
    console.error('Error getting portal settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portal settings'
    });
  }
});

// Save portal settings
app.post('/api/portal-settings', async (req, res) => {
  const { type, email } = req.body;
  
  try {
    // Generate portal URL based on email domain
    const domain = email.split('@')[1];
    const url = `https://${domain}/portal`;
    
    await pool.execute(
      'INSERT INTO portal_settings (type, email, url) VALUES (?, ?, ?)',
      [type, email, url]
    );
    
    res.json({
      success: true,
      settings: { type, email, url }
    });
  } catch (error) {
    console.error('Error saving portal settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save portal settings'
    });
  }
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();
