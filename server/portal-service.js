const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const si = require('systeminformation');
const docker = new Docker({socketPath: '/var/run/docker.sock'});

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use(helmet());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Network status endpoint
app.get('/api/network/status', async (req, res) => {
  try {
    const networkStats = await si.networkStats();
    res.json({
      status: 'active',
      stats: networkStats[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protection status endpoint
app.get('/api/protection/status', async (req, res) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

// Portal company status endpoint
app.get('/api/portal/status/company', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json({
      status: 'active',
      containers: containers.length,
      running: containers.filter(c => c.State === 'running').length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Container monitoring endpoints
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const containerDetails = await Promise.all(containers.map(async (c) => {
      const container = docker.getContainer(c.Id);
      let stats = {};
      if (c.State === 'running') {
        try {
          stats = await container.stats({ stream: false });
        } catch (e) {
          console.error(`Error getting stats for container ${c.Id}:`, e);
        }
      }
      return {
        id: c.Id.slice(0, 12),
        name: c.Names[0].replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        stats: stats
      };
    }));
    res.json(containerDetails);
  } catch (error) {
    console.error('Error listing containers:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Unified portal service running on port ${PORT}`);
});
