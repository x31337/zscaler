const si = require('systeminformation');

class ProtectionService {
    constructor() {
        this.state = {
            enabled: true,
            type: 'protected',
            threats: {
                blocked: 0,
                detected: 0,
                pending: 0
            },
            rules: [],
            logs: []
        };
        this.startMonitoring();
    }

    async startMonitoring() {
        setInterval(async () => {
            await this.checkThreats();
        }, 30000);
    }

    async checkThreats() {
        try {
            const [processes, connections] = await Promise.all([
                si.processes(),
                si.networkConnections()
            ]);

            // Example threat detection logic
            const suspiciousProcesses = processes.list.filter(p => 
                p.cpu > 90 || p.memRss > 1000000000
            );

            const suspiciousConnections = connections.filter(c => 
                c.state === 'LISTEN' && c.protocol === 'tcp' && c.localport > 1024
            );

            if (suspiciousProcesses.length > 0 || suspiciousConnections.length > 0) {
                this.state.threats.detected++;
                this.logThreat({
                    type: 'suspicious_activity',
                    processes: suspiciousProcesses,
                    connections: suspiciousConnections,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            console.error('Error checking threats:', error);
        }
    }

    logThreat(threat) {
        this.state.logs.push(threat);
        if (this.state.logs.length > 1000) {
            this.state.logs = this.state.logs.slice(-1000);
        }
    }

    getStatus() {
        return {
            enabled: this.state.enabled,
            type: this.state.type,
            threats: this.state.threats,
            lastCheck: new Date().toISOString()
        };
    }

    toggle(enabled) {
        this.state.enabled = enabled;
        this.state.type = enabled ? 'protected' : 'disabled';
        return this.getStatus();
    }

    getThreats() {
        return {
            total: Object.values(this.state.threats).reduce((a, b) => a + b, 0),
            ...this.state.threats,
            recentThreats: this.state.logs.slice(-5)
        };
    }

    getLogs() {
        return {
            logs: this.state.logs,
            total: this.state.logs.length
        };
    }
}

module.exports = new ProtectionService();
