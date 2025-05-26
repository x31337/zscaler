const express = require('express');
const Docker = require('dockerode');
const app = express();
const docker = new Docker({socketPath: '/var/run/docker.sock'});

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files
app.use(express.static('public'));

// Get container stats
app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        res.json(containers.map(c => ({
            id: c.Id.slice(0, 12),
            name: c.Names[0].replace(/^\//, ''),
            image: c.Image,
            state: c.State,
            status: c.Status
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get container logs
app.get('/api/containers/:id/logs', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 100,
            timestamps: true
        });
        res.send(logs.toString());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
