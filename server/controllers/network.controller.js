const si = require('systeminformation');
const os = require('os');
const https = require('https');

exports.getStatus = async (req, res) => {
    try {
        const [networkStats, internetLatency] = await Promise.all([
            si.networkStats(),
            si.inetLatency()
        ]);

        res.json({
            status: 'connected',
            stats: networkStats,
            latency: internetLatency,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPublicIP = async (req, res) => {
    try {
        const response = await new Promise((resolve, reject) => {
            https.get('https://api.ipify.org?format=json', (resp) => {
                let data = '';
                resp.on('data', (chunk) => { data += chunk; });
                resp.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPrivateIPs = (req, res) => {
    try {
        const interfaces = os.networkInterfaces();
        const ips = Object.entries(interfaces)
            .flatMap(([name, info]) => 
                info.filter(ip => ip.family === 'IPv4' && !ip.internal)
                    .map(ip => ({ interface: name, address: ip.address }))
            );

        res.json({ ips });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getLatency = async (req, res) => {
    try {
        const latency = await si.inetLatency();
        res.json({ latency });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
