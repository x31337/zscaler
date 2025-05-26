const si = require('systeminformation');

class MonitorService {
    constructor() {
        this.stats = {
            startTime: Date.now(),
            requests: {
                total: 0,
                success: 0,
                error: 0
            },
            memory: {
                current: 0,
                peak: 0
            },
            errors: []
        };
        this.startMonitoring();
    }

    async startMonitoring() {
        setInterval(async () => {
            await this.updateStats();
        }, 5000);
    }

    async updateStats() {
        try {
            const [cpu, mem, temp, load] = await Promise.all([
                si.cpu(),
                si.mem(),
                si.cpuTemperature(),
                si.currentLoad()
            ]);

            this.stats.system = {
                cpu: {
                    temperature: temp.main,
                    load: load.currentLoad,
                    cores: cpu.cores
                },
                memory: {
                    total: mem.total,
                    used: mem.used,
                    free: mem.free
                },
                lastUpdate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error updating system stats:', error);
        }
    }

    getStats() {
        return {
            uptime: process.uptime(),
            ...this.stats,
            timestamp: new Date().toISOString()
        };
    }

    trackRequest(success) {
        this.stats.requests.total++;
        if (success) {
            this.stats.requests.success++;
        } else {
            this.stats.requests.error++;
        }
    }

    trackError(error) {
        this.stats.errors.push({
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack
        });

        if (this.stats.errors.length > 1000) {
            this.stats.errors = this.stats.errors.slice(-1000);
        }
    }

    reset() {
        this.stats = {
            startTime: Date.now(),
            requests: {
                total: 0,
                success: 0,
                error: 0
            },
            memory: {
                current: 0,
                peak: 0
            },
            errors: []
        };
        return true;
    }
}

module.exports = new MonitorService();
