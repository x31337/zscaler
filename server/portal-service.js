const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const si = require('systeminformation');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

// Configure logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Initialize Docker client
const docker = new Docker({socketPath: '/var/run/docker.sock'});

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Cache control middleware
const cacheControl = (maxAge) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${maxAge}`);
  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use('/api', limiter);

// Serve static files with proper caching
app.use(express.static(path.join(__dirname, '../dist'), {
  maxAge: '1h',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (path.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// API Routes
app.get('/api/health', cacheControl(30), (req, res) => {
  logger.info('Health check requested');
  res.json({
    status: 'healthy',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/network/status', cacheControl(5), async (req, res) => {
  try {
    logger.info('Network status requested');
    const networkStats = await si.networkStats();
    res.json({
      status: 'active',
      stats: networkStats[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Network status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/protection/status', cacheControl(5), async (req, res) => {
  try {
    logger.info('Protection status requested');
    const [cpu, mem] = await Promise.all([
      si.currentLoad(),
      si.mem()
    ]);
    res.json({
      status: 'active',
      system_load: {
        cpu: cpu.currentLoad,
        memory: (mem.used / mem.total) * 100
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Protection status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/portal/status/company', cacheControl(5), async (req, res) => {
  try {
    logger.info('Portal company status requested');
    const containers = await docker.listContainers({ all: true });
    res.json({
      status: 'active',
      containers: containers.length,
      running: containers.filter(c => c.State === 'running').length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Portal company status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  }
});

const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`Server running at http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received. Closing HTTP server...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});
