const express = require('express');
const mysql = require('mysql2/promise');
const { logger } = require('../utils/logger');
const networkMonitor = require('../utils/network');
const dbConfig = require('../config/database')[process.env.NODE_ENV || 'development'];

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: false,
        network: false
      },
      version: process.env.npm_package_version || '1.0.0'
    };

    // Check database connection
    try {
      const connection = await mysql.createConnection(dbConfig);
      await connection.execute('SELECT 1');
      await connection.end();
      healthStatus.services.database = true;
    } catch (dbError) {
      logger.error('Database health check failed:', dbError);
      healthStatus.services.database = false;
    }

    // Check network monitoring
    const networkStatus = networkMonitor.getLastCheck();
    if (networkStatus && Date.now() - networkStatus.timestamp < 10000) {
      healthStatus.services.network = true;
    }

    // Overall status
    healthStatus.status = Object.values(healthStatus.services).every(Boolean) ? 'ok' : 'degraded';

    const statusCode = healthStatus.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health metrics
router.get('/health/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      network: networkMonitor.getLastCheck(),
      database: {
        pool: {
          connections: 0,
          active: 0,
          idle: 0
        }
      }
    };

    // Get database pool metrics
    try {
      const pool = await mysql.createPool(dbConfig);
      const [rows] = await pool.execute('SHOW STATUS LIKE "Threads_%"');
      const threadMetrics = {};
      rows.forEach(row => {
        threadMetrics[row.Variable_name] = row.Value;
      });
      metrics.database.pool = threadMetrics;
      await pool.end();
    } catch (dbError) {
      logger.error('Failed to get database metrics:', dbError);
      metrics.database.error = dbError.message;
    }

    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get health metrics:', error);
    res.status(500).json({
      error: 'Failed to get health metrics',
      message: error.message
    });
  }
});

// Debug endpoint
router.get('/health/debug', async (req, res) => {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      config: {
        database: {
          ...dbConfig,
          password: '[REDACTED]'
        }
      },
      network: {
        lastCheck: networkMonitor.getLastCheck(),
        interfaces: require('os').networkInterfaces()
      }
    };

    // Get recent logs
    try {
      const { execSync } = require('child_process');
      const recentLogs = execSync('tail -n 50 logs/combined.log').toString();
      debugInfo.logs = recentLogs.split('\n');
    } catch (logError) {
      debugInfo.logs = ['Failed to read logs:', logError.message];
    }

    res.json(debugInfo);
  } catch (error) {
    logger.error('Failed to get debug info:', error);
    res.status(500).json({
      error: 'Failed to get debug info',
      message: error.message
    });
  }
});

module.exports = router;
