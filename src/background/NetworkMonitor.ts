import { ChromeDebugger } from './ChromeDebugger';
import { ZscalerProxyManager } from './ZscalerProxyManager';

interface NetworkStats {
  totalRequests: number;
  proxyRequests: number;
  failedRequests: number;
  avgResponseTime: number;
}

export class NetworkMonitor {
  private debugger: ChromeDebugger;
  private proxyManager: ZscalerProxyManager;
  private stats: NetworkStats;
  private requestTimes: Map<string, number>;
  private isMonitoring: boolean = false;

  constructor() {
    this.debugger = new ChromeDebugger();
    this.proxyManager = new ZscalerProxyManager();
    this.requestTimes = new Map();
    this.stats = this.initializeStats();

    // Listen for proxy setting changes
    chrome.proxy.settings.onChange.addListener(() => {
      this.handleProxyChange();
    });
  }

  private initializeStats(): NetworkStats {
    return {
      totalRequests: 0,
      proxyRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    try {
      await this.debugger.initialize();
      this.isMonitoring = true;

      // Add custom event listeners
      chrome.debugger.onEvent.addListener((source, method, params) => {
        this.handleDebuggerEvent(method, params);
      });

      // Start periodic status checks
      this.startPeriodicChecks();

    } catch (error) {
      console.error('Failed to start network monitoring:', error);
      throw error;
    }
  }

  private startPeriodicChecks() {
    // Check proxy status every minute
    setInterval(async () => {
      await this.checkProxyHealth();
    }, 60000);

    // Reset stats every hour
    setInterval(() => {
      this.stats = this.initializeStats();
    }, 3600000);
  }

  private async handleDebuggerEvent(method: string, params: any) {
    switch (method) {
      case 'Network.requestWillBeSent':
        this.handleRequest(params);
        break;
      case 'Network.responseReceived':
        await this.handleResponse(params);
        break;
      case 'Network.loadingFailed':
        this.handleFailure(params);
        break;
    }
  }

  private handleRequest(params: any) {
    const requestId = params.requestId;
    this.requestTimes.set(requestId, Date.now());
    this.stats.totalRequests++;

    // Check if request is going through proxy
    if (this.isProxiedRequest(params.request)) {
      this.stats.proxyRequests++;
    }
  }

  private async handleResponse(params: any) {
    const requestId = params.requestId;
    const startTime = this.requestTimes.get(requestId);

    if (startTime) {
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);
      this.requestTimes.delete(requestId);

      // Check for proxy-related issues
      await this.checkProxyResponse(params.response);
    }
  }

  private handleFailure(params: any) {
    this.stats.failedRequests++;
    this.requestTimes.delete(params.requestId);

    // Notify if failure might be proxy-related
    if (this.isProxyFailure(params.errorText)) {
      this.notifyProxyError(params.errorText);
    }
  }

  private isProxiedRequest(request: any): boolean {
    // Check headers for proxy indicators
    const headers = request.headers || {};
    return !!(
      headers['proxy-connection'] ||
      headers['x-zscaler-id'] ||
      headers['x-proxy-id']
    );
  }

  private async checkProxyResponse(response: any) {
    const proxyHeaders = [
      'x-zscaler-id',
      'x-proxy-id',
      'x-forwarded-for',
      'via'
    ];

    const hasProxyHeaders = proxyHeaders.some(header => 
      response.headers[header.toLowerCase()]
    );

    if (!hasProxyHeaders && await this.proxyManager.checkStatus()) {
      console.warn('Proxy headers missing in response');
    }
  }

  private isProxyFailure(error: string): boolean {
    const proxyErrors = [
      'proxy connection failed',
      'tunnel connection failed',
      'proxy authentication required',
      'could not connect to proxy'
    ];

    return proxyErrors.some(err => 
      error.toLowerCase().includes(err.toLowerCase())
    );
  }

  private updateAverageResponseTime(newTime: number) {
    const total = this.stats.avgResponseTime * (this.stats.totalRequests - 1);
    this.stats.avgResponseTime = (total + newTime) / this.stats.totalRequests;
  }

  private async handleProxyChange() {
    try {
      const status = await this.proxyManager.checkStatus();
      if (status.enabled) {
        console.log('Proxy settings changed - Zscaler proxy active');
        // Reset stats when proxy changes
        this.stats = this.initializeStats();
      } else {
        console.warn('Proxy settings changed - Zscaler proxy not detected');
      }
    } catch (error) {
      console.error('Error handling proxy change:', error);
    }
  }

  private async checkProxyHealth() {
    const status = await this.proxyManager.checkStatus();
    
    if (status.enabled) {
      // Check proxy health metrics
      const healthScore = this.calculateHealthScore();
      
      if (healthScore < 0.8) { // 80% threshold
        this.notifyProxyPerformanceIssue(healthScore);
      }
    }
  }

  private calculateHealthScore(): number {
    if (this.stats.totalRequests === 0) return 1;

    const successRate = 1 - (this.stats.failedRequests / this.stats.totalRequests);
    const proxyUsageRate = this.stats.proxyRequests / this.stats.totalRequests;
    
    // Weight factors
    const weights = {
      successRate: 0.6,
      proxyUsage: 0.4
    };

    return (successRate * weights.successRate) + 
           (proxyUsageRate * weights.proxyUsage);
  }

  private notifyProxyError(error: string) {
    chrome.runtime.sendMessage({
      type: 'PROXY_ERROR',
      error: error
    });
  }

  private notifyProxyPerformanceIssue(healthScore: number) {
    chrome.runtime.sendMessage({
      type: 'PROXY_PERFORMANCE',
      data: {
        healthScore,
        stats: this.stats
      }
    });
  }

  getStats(): NetworkStats {
    return { ...this.stats };
  }

  async cleanup(): Promise<void> {
    this.isMonitoring = false;
    await this.debugger.cleanup();
    this.stats = this.initializeStats();
    this.requestTimes.clear();
  }
}

