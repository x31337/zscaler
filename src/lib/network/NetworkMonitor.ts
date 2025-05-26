import {
  NetworkMonitorConfig,
  NetworkStats,
  ZscalerError,
  ProxyHealthMetrics,
  DEFAULT_NETWORK_CONFIG,
  ZSCALER_ERROR_MESSAGES,
  ZscalerMonitorError
} from '@/types/network';

export class NetworkMonitor {
  private stats: NetworkStats = {
    totalRequests: 0,
    proxyRequests: 0,
    failedRequests: 0,
    retrySuccesses: 0,
    retryFailures: 0,
    avgProxyLatency: 0,
    zscalerErrors: []
  };

  private requestTimes: Map<string, number> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private isMonitoring: boolean = false;
  private readonly config: NetworkMonitorConfig;

  constructor(config: Partial<NetworkMonitorConfig> = {}) {
    // Deep merge with default config
    this.config = {
      ...DEFAULT_NETWORK_CONFIG,
      ...config,
      retryConfig: {
        ...DEFAULT_NETWORK_CONFIG.retryConfig,
        ...config.retryConfig,
        retryableErrors: [
          ...DEFAULT_NETWORK_CONFIG.retryConfig.retryableErrors,
          ...(config.retryConfig?.retryableErrors || [])
        ]
      },
      zscalerDomains: [
        ...DEFAULT_NETWORK_CONFIG.zscalerDomains,
        ...(config.zscalerDomains || [])
      ]
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    try {
      // Check initial proxy configuration
      const config = await this.getCurrentProxyConfig();
      if (!this.isZscalerProxyConfig(config)) {
        console.warn(ZSCALER_ERROR_MESSAGES.CONFIG_CHANGE);
      }

      // Setup network request listeners
      chrome.webRequest.onBeforeRequest.addListener(
        this.handleBeforeRequest.bind(this),
        { urls: ['<all_urls>'] }
      );

      chrome.webRequest.onCompleted.addListener(
        this.handleCompleted.bind(this),
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );

      chrome.webRequest.onErrorOccurred.addListener(
        this.handleError.bind(this),
        { urls: ['<all_urls>'] }
      );

      // Setup proxy settings listener
      chrome.proxy.settings.onChange.addListener(
        this.handleProxySettingsChange.bind(this)
      );

      this.isMonitoring = true;
    } catch (error) {
      const monitorError = new ZscalerMonitorError(
        ZSCALER_ERROR_MESSAGES.INITIALIZATION_FAILED,
        'PROXY_ERROR',
        { originalError: error }
      );
      this.handleZscalerError({
        timestamp: Date.now(),
        type: monitorError.type,
        message: monitorError.message,
        details: monitorError.details
      });
      throw monitorError;
    }
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    chrome.webRequest.onBeforeRequest.removeListener(this.handleBeforeRequest);
    chrome.webRequest.onCompleted.removeListener(this.handleCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(this.handleError);
    chrome.proxy.settings.onChange.removeListener(this.handleProxySettingsChange);

    this.cleanup();
    this.isMonitoring = false;
  }

  private handleBeforeRequest(details: chrome.webRequest.WebRequestDetails): void {
    this.requestTimes.set(details.requestId, Date.now());
    this.stats.totalRequests++;

    if (this.isZscalerRequest(details)) {
      this.stats.proxyRequests++;
    }
  }

  private handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): void {
    const startTime = this.requestTimes.get(details.requestId);
    if (startTime) {
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);
      this.requestTimes.delete(details.requestId);

      if (this.retryAttempts.has(details.requestId)) {
        this.stats.retrySuccesses++;
        this.retryAttempts.delete(details.requestId);
      }
    }

    if (details.responseHeaders) {
      this.checkZscalerResponse(details);
    }
  }

  private handleError(details: chrome.webRequest.WebResponseErrorDetails): void {
    this.stats.failedRequests++;
    this.requestTimes.delete(details.requestId);

    if (this.isProxyError(details.error)) {
      const attempts = this.retryAttempts.get(details.requestId) || 0;
      
      if (attempts < this.config.retryConfig.maxRetries) {
        this.retryAttempts.set(details.requestId, attempts + 1);
        const delay = this.config.retryConfig.backoffMs * Math.pow(2, attempts);
        
        setTimeout(() => {
          if (details.tabId && details.tabId !== -1) {
            chrome.tabs.reload(details.tabId);
          }
        }, delay);
      } else {
        this.stats.retryFailures++;
        this.handleZscalerError({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: ZSCALER_ERROR_MESSAGES.CONNECTION_FAILED,
          requestUrl: details.url,
          details: { error: details.error, attempts }
        });
      }
    }
  }

  private handleProxySettingsChange(config: chrome.proxy.ProxyConfig): void {
    if (!this.isZscalerProxyConfig(config)) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'CONFIG_ERROR',
        message: ZSCALER_ERROR_MESSAGES.CONFIG_CHANGE,
        details: { config }
      });
    }
  }

  private isZscalerRequest(details: chrome.webRequest.WebRequestDetails): boolean {
    return (
      this.config.zscalerDomains.some(domain => 
        details.url.includes(domain) ||
        (details.initiator && details.initiator.includes(domain))
      )
    );
  }

  private isProxyError(error: string): boolean {
    return this.config.retryConfig.retryableErrors.some(pattern => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private async getCurrentProxyConfig(): Promise<chrome.proxy.ProxyConfig> {
    return new Promise((resolve, reject) => {
      try {
        chrome.proxy.settings.get({}, (details) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(details.value);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private isZscalerProxyConfig(config: chrome.proxy.ProxyConfig): boolean {
    if (!config || !config.rules) return false;

    const proxyRules = [
      config.rules.proxyForHttp,
      config.rules.proxyForHttps,
      config.rules.fallbackProxy
    ].filter(Boolean);

    return proxyRules.some(rule => 
      this.config.zscalerDomains.some(domain =>
        rule.host?.toLowerCase().includes(domain)
      )
    );
  }

  private checkZscalerResponse(details: chrome.webRequest.WebResponseCacheDetails): void {
    if (!details.responseHeaders) return;

    const headers = new Map(
      details.responseHeaders.map(h => [h.name.toLowerCase(), h.value])
    );

    // Check for proxy auth errors
    if (headers.has('proxy-authenticate') || details.statusCode === 407) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'AUTH_ERROR',
        message: ZSCALER_ERROR_MESSAGES.AUTH_REQUIRED,
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode,
          headers: Object.fromEntries(headers)
        }
      });
    }

    // Check for gateway errors
    if (details.statusCode === 502 || details.statusCode === 504) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'GATEWAY_ERROR',
        message: ZSCALER_ERROR_MESSAGES.GATEWAY_ERROR,
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode,
          headers: Object.fromEntries(headers)
        }
      });
    }
  }

  private updateLatencyStats(latency: number): void {
    const alpha = 0.2; // Exponential moving average smoothing factor
    this.stats.avgProxyLatency = 
      (this.stats.avgProxyLatency * (1 - alpha)) + (latency * alpha);

    if (latency > this.config.latencyThresholds.critical) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'LATENCY_ERROR',
        message: ZSCALER_ERROR_MESSAGES.HIGH_LATENCY,
        details: {
          latency,
          threshold: this.config.latencyThresholds.critical,
          avgLatency: this.stats.avgProxyLatency
        }
      });
    }
  }

  private handleZscalerError(error: ZscalerError): void {
    this.stats.zscalerErrors.push(error);
    
    // Keep only last 100 errors
    if (this.stats.zscalerErrors.length > 100) {
      this.stats.zscalerErrors.shift();
    }

    // Notify extension
    chrome.runtime.sendMessage({
      type: 'ZSCALER_ERROR',
      error
    });
  }

  private cleanup(): void {
    this.stats = {
      totalRequests: 0,
      proxyRequests: 0,
      failedRequests: 0,
      retrySuccesses: 0,
      retryFailures: 0,
      avgProxyLatency: 0,
      zscalerErrors: []
    };
    this.requestTimes.clear();
    this.retryAttempts.clear();
  }

  getHealthMetrics(): ProxyHealthMetrics {
    const recentErrors = [...this.stats.zscalerErrors].slice(-10);
    return {
      healthScore: this.calculateHealthScore(),
      latency: this.stats.avgProxyLatency,
      successRate: this.stats.totalRequests > 0 
        ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
        : 1,
      proxyUsage: this.stats.totalRequests > 0
        ? this.stats.proxyRequests / this.stats.totalRequests
        : 0,
      errorRate: this.stats.totalRequests > 0
        ? this.stats.failedRequests / this.stats.totalRequests
        : 0,
      recentErrors
    };
  }

  private calculateHealthScore(): number {
    const latencyScore = Math.max(0, 1 - (this.stats.avgProxyLatency / this.config.latencyThresholds.critical));
    const successScore = this.stats.totalRequests > 0
      ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
      : 1;
    const retryScore = this.stats.retrySuccesses > 0
      ? this.stats.retrySuccesses / (this.stats.retrySuccesses + this.stats.retryFailures)
      : 1;

    return (latencyScore * 0.4 + successScore * 0.4 + retryScore * 0.2);
  }

  getStats(): NetworkStats {
    return { ...this.stats };
  }
}

import type { NetworkStats, ZscalerError, NetworkMonitorConfig, ProxyHealthMetrics } from '@/types/network';

const DEFAULT_CONFIG: NetworkMonitorConfig = {
  retryConfig: {
    maxRetries: 3,
    backoffMs: 1000,
    retryableErrors: [
      'proxy connection failed',
      'tunnel connection failed', 
      'network error'
    ]
  },
  latencyThresholds: {
    warning: 1000,   // 1 second
    critical: 5000   // 5 seconds
  }
};

export class NetworkMonitor {
  private stats: NetworkStats = {
    totalRequests: 0,
    proxyRequests: 0,
    failedRequests: 0,
    retrySuccesses: 0,
    retryFailures: 0,
    avgProxyLatency: 0,
    zscalerErrors: []
  };

  private requestTimes: Map<string, number> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private isMonitoring: boolean = false;
  private readonly config: NetworkMonitorConfig;

  constructor(config: Partial<NetworkMonitorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    // Setup network request listeners
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleBeforeRequest.bind(this),
      { urls: ['<all_urls>'] },
      ['requestHeaders']  // Request additional information
    );

    chrome.webRequest.onCompleted.addListener(
      this.handleCompleted.bind(this),
      { urls: ['<all_urls>'] },
      ['responseHeaders']  // Request additional information
    );

    chrome.webRequest.onErrorOccurred.addListener(
      this.handleError.bind(this),
      { urls: ['<all_urls>'] }
    );

    // Setup proxy settings listener
    chrome.proxy.settings.onChange.addListener(
      this.handleProxySettingsChange.bind(this)
    );

    this.isMonitoring = true;
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    chrome.webRequest.onBeforeRequest.removeListener(this.handleBeforeRequest);
    chrome.webRequest.onCompleted.removeListener(this.handleCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(this.handleError);
    chrome.proxy.settings.onChange.removeListener(this.handleProxySettingsChange);

    this.cleanup();
    this.isMonitoring = false;
  }

  private handleBeforeRequest(details: chrome.webRequest.WebRequestDetails): void {
    this.requestTimes.set(details.requestId, Date.now());
    this.stats.totalRequests++;

    // Check if request is going through Zscaler proxy
    if (this.isZscalerRequest(details)) {
      this.stats.proxyRequests++;
    }
  }

  private handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): void {
    const startTime = this.requestTimes.get(details.requestId);
    if (startTime) {
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);
      this.requestTimes.delete(details.requestId);

      // Reset retry attempts on success
      if (this.retryAttempts.has(details.requestId)) {
        this.stats.retrySuccesses++;
        this.retryAttempts.delete(details.requestId);
      }
    }

    // Check for Zscaler-specific response headers
    if (details.responseHeaders) {
      this.checkZscalerResponse(details);
    }
  }

  private handleError(details: chrome.webRequest.WebResponseErrorDetails): void {
    this.stats.failedRequests++;
    this.requestTimes.delete(details.requestId);

    if (this.isProxyError(details.error)) {
      const attempts = this.retryAttempts.get(details.requestId) || 0;
      
      if (attempts < this.config.retryConfig.maxRetries) {
        // Increment retry attempts
        this.retryAttempts.set(details.requestId, attempts + 1);
        
        // Schedule retry with exponential backoff
        const delay = this.config.retryConfig.backoffMs * Math.pow(2, attempts);
        setTimeout(() => {
          chrome.tabs.reload(details.tabId);
        }, delay);
      } else {
        this.stats.retryFailures++;
        this.handleZscalerError({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Proxy error after ${attempts} retries: ${details.error}`,
          requestUrl: details.url,
          details: {
            error: details.error,
            attempts
          }
        });
      }
    }
  }

  private handleProxySettingsChange(config: chrome.proxy.ProxyConfig): void {
    if (this.isZscalerProxyConfig(config)) {
      // Log proxy configuration changes
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'CONFIG_ERROR',
        message: 'Zscaler proxy configuration changed',
        details: { config }
      });
    }
  }

  private isZscalerRequest(details: chrome.webRequest.WebRequestDetails): boolean {
    // Enhanced Zscaler detection
    return details.url.includes('zscaler.net') ||
           details.url.includes('zscalerpartner.net') ||
           details.url.includes('zscloud.net') ||
           (details.initiator && details.initiator.includes('zscaler')) ||
           (details.requestHeaders?.some(h => 
             h.name.toLowerCase().includes('zscaler') ||
             h.name.toLowerCase() === 'proxy-authorization'
           ));
  }

  private isProxyError(error: string): boolean {
    return this.config.retryConfig.retryableErrors.some(e => 
      error.toLowerCase().includes(e)
    );
  }

  private isZscalerProxyConfig(config: chrome.proxy.ProxyConfig): boolean {
    if (!config.rules) return false;
    
    const configStr = JSON.stringify(config.rules).toLowerCase();
    return configStr.includes('zscaler') || 
           configStr.includes('zscloud') ||
           configStr.includes('zscalertwo') ||
           configStr.includes('zscalerthree');
  }

  private updateLatencyStats(latency: number): void {
    // Exponential moving average for latency
    const alpha = 0.2; // Smoothing factor
    this.stats.avgProxyLatency = 
      (this.stats.avgProxyLatency * (1 - alpha)) + (latency * alpha);

    if (latency > this.config.latencyThresholds.critical) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'LATENCY_ERROR',
        message: `High latency detected: ${latency}ms`,
        details: {
          latency,
          threshold: this.config.latencyThresholds.critical
        }
      });
    }
  }

  private checkZscalerResponse(details: chrome.webRequest.WebResponseCacheDetails): void {
    if (!details.responseHeaders) return;

    const headers = new Map(
      details.responseHeaders.map(h => [h.name.toLowerCase(), h.value])
    );

    // Check for authentication issues
    if (headers.has('proxy-authenticate') || details.statusCode === 407) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'AUTH_ERROR',
        message: 'Proxy authentication required',
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode,
          headers: Object.fromEntries(headers)
        }
      });
    }

    // Check for gateway errors
    if (details.statusCode === 502 || details.statusCode === 504) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'GATEWAY_ERROR',
        message: `Proxy gateway error: ${details.statusCode}`,
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode,
          headers: Object.fromEntries(headers)
        }
      });
    }
  }

  private handleZscalerError(error: ZscalerError): void {
    this.stats.zscalerErrors.push(error);
    
    // Keep only the last 100 errors
    if (this.stats.zscalerErrors.length > 100) {
      this.stats.zscalerErrors.shift();
    }

    // Notify extension UI
    chrome.runtime.sendMessage({
      type: 'ZSCALER_ERROR',
      error
    });
  }

  getHealthMetrics(): ProxyHealthMetrics {
    return {
      healthScore: this.calculateHealthScore(),
      latency: this.stats.avgProxyLatency,
      successRate: this.stats.totalRequests > 0 
        ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
        : 1,
      proxyUsage: this.stats.totalRequests > 0
        ? this.stats.proxyRequests / this.stats.totalRequests
        : 0,
      errorRate: this.stats.totalRequests > 0
        ? this.stats.failedRequests / this.stats.totalRequests
        : 0,
      recentErrors: [...this.stats.zscalerErrors].slice(-10)
    };
  }

  getStats(): NetworkStats {
    return { ...this.stats };
  }

  clearStats(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.stats = {
      totalRequests: 0,
      proxyRequests: 0,
      failedRequests: 0,
      retrySuccesses: 0,
      retryFailures: 0,
      avgProxyLatency: 0,
      zscalerErrors: []
    };
    this.requestTimes.clear();
    this.retryAttempts.clear();
  }

  private calculateHealthScore(): number {
    const latencyScore = Math.max(0, 1 - (this.stats.avgProxyLatency / this.config.latencyThresholds.critical));
    const successScore = this.stats.totalRequests > 0
      ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
      : 1;
    const retryScore = this.stats.retrySuccesses > 0
      ? this.stats.retrySuccesses / (this.stats.retrySuccesses + this.stats.retryFailures)
      : 1;

    return (latencyScore * 0.4 + successScore * 0.4 + retryScore * 0.2);
  }
}

import type { NetworkStats, ZscalerError } from '@/types/network';

export class NetworkMonitor {
  private stats: NetworkStats = {
    totalRequests: 0,
    proxyRequests: 0,
    failedRequests: 0,
    retrySuccesses: 0,
    retryFailures: 0,
    avgProxyLatency: 0,
    zscalerErrors: []
  };

  private requestTimes: Map<string, number> = new Map();
  private isMonitoring: boolean = false;

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    // Setup network request listeners
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleBeforeRequest.bind(this),
      { urls: ['<all_urls>'] }
    );

    chrome.webRequest.onCompleted.addListener(
      this.handleCompleted.bind(this),
      { urls: ['<all_urls>'] }
    );

    chrome.webRequest.onErrorOccurred.addListener(
      this.handleError.bind(this),
      { urls: ['<all_urls>'] }
    );

    // Setup proxy settings listener
    chrome.proxy.settings.onChange.addListener(
      this.handleProxySettingsChange.bind(this)
    );

    this.isMonitoring = true;
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    chrome.webRequest.onBeforeRequest.removeListener(this.handleBeforeRequest);
    chrome.webRequest.onCompleted.removeListener(this.handleCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(this.handleError);
    chrome.proxy.settings.onChange.removeListener(this.handleProxySettingsChange);

    this.isMonitoring = false;
  }

  private handleBeforeRequest(details: chrome.webRequest.WebRequestDetails): void {
    this.requestTimes.set(details.requestId, Date.now());
    this.stats.totalRequests++;

    // Check if request is going through Zscaler proxy
    if (this.isZscalerRequest(details)) {
      this.stats.proxyRequests++;
    }
  }

  private handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): void {
    const startTime = this.requestTimes.get(details.requestId);
    if (startTime) {
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);
      this.requestTimes.delete(details.requestId);
    }

    // Check for Zscaler-specific response headers
    if (details.responseHeaders) {
      const zscalerHeaders = details.responseHeaders.filter(h => 
        h.name.toLowerCase().includes('zscaler') ||
        h.name.toLowerCase().includes('x-proxy')
      );

      if (zscalerHeaders.length > 0) {
        this.checkZscalerResponse(details);
      }
    }
  }

  private handleError(details: chrome.webRequest.WebResponseErrorDetails): void {
    this.stats.failedRequests++;
    this.requestTimes.delete(details.requestId);

    // Handle proxy-related errors
    if (this.isProxyError(details.error)) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'PROXY_ERROR',
        message: `Proxy error: ${details.error}`,
        requestUrl: details.url
      });
    }
  }

  private handleProxySettingsChange(details: chrome.proxy.ProxyConfig): void {
    // Monitor for proxy configuration changes
    if (this.isZscalerProxyConfig(details)) {
      console.log('Zscaler proxy configuration changed:', details);
    }
  }

  private isZscalerRequest(details: chrome.webRequest.WebRequestDetails): boolean {
    // Check if request is going through Zscaler
    return details.url.includes('zscaler.net') ||
           details.url.includes('zscalerpartner.net') ||
           (details.initiator && details.initiator.includes('zscaler'));
  }

  private isProxyError(error: string): boolean {
    const proxyErrors = [
      'net::ERR_PROXY_CONNECTION_FAILED',
      'net::ERR_TUNNEL_CONNECTION_FAILED',
      'net::ERR_PROXY_CERTIFICATE_INVALID',
      'net::ERR_PROXY_AUTH_REQUIRED'
    ];
    return proxyErrors.some(e => error.includes(e));
  }

  private isZscalerProxyConfig(config: chrome.proxy.ProxyConfig): boolean {
    if (config.rules) {
      return JSON.stringify(config.rules).toLowerCase().includes('zscaler');
    }
    return false;
  }

  private updateLatencyStats(latency: number): void {
    // Simple moving average for latency
    this.stats.avgProxyLatency = 
      (this.stats.avgProxyLatency * 0.9) + (latency * 0.1);
  }

  private checkZscalerResponse(details: chrome.webRequest.WebResponseCacheDetails): void {
    if (!details.responseHeaders) return;

    // Check for authentication issues
    const authHeader = details.responseHeaders.find(h => 
      h.name.toLowerCase() === 'proxy-authenticate'
    );
    if (authHeader || details.statusCode === 407) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'AUTH_ERROR',
        message: 'Proxy authentication required',
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode,
          headers: details.responseHeaders.reduce((acc, h) => ({
            ...acc,
            [h.name]: h.value
          }), {})
        }
      });
    }

    // Check for SSL/TLS issues
    if (details.statusCode === 502 || details.statusCode === 504) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'GATEWAY_ERROR',
        message: `Proxy gateway error: ${details.statusCode}`,
        requestUrl: details.url,
        details: {
          statusCode: details.statusCode
        }
      });
    }
  }

  private handleZscalerError(error: ZscalerError): void {
    this.stats.zscalerErrors.push(error);
    // Keep only the last 100 errors
    if (this.stats.zscalerErrors.length > 100) {
      this.stats.zscalerErrors.shift();
    }
  }

  getStats(): NetworkStats {
    return { ...this.stats };
  }
}

import type {
  NetworkInterface,
  NetworkStats,
  ZscalerError,
  NetworkMonitorConfig,
  NetworkRequest,
  NetworkResponse,
  ProxyHealthMetrics
} from '../types/network';

const DEFAULT_CONFIG: NetworkMonitorConfig = {
  retryConfig: {
    maxRetries: 3,
    backoffMs: 1000,
    retryableErrors: [
      'proxy connection failed',
      'tunnel connection failed', 
      'network error'
    ]
  },
  latencyThresholds: {
    warning: 1000,
    critical: 5000
  }
};

export class NetworkMonitor {
  private stats: NetworkStats = {
    totalRequests: 0,
    proxyRequests: 0,
    failedRequests: 0,
    retrySuccesses: 0,
    retryFailures: 0,
    avgProxyLatency: 0,
    zscalerErrors: []
  };

  private requestTimes = new Map<string, number>();
  private retryAttempts = new Map<string, number>();
  private isMonitoring = false;
  private readonly config: NetworkMonitorConfig;
  
  constructor(config: Partial<NetworkMonitorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    try {
      await chrome.debugger.attach({tabId: -1}, '1.3');
      this.isMonitoring = true;

      chrome.debugger.onEvent.addListener(this.handleDebuggerEvent.bind(this));
      
      // Enable network tracking
      await chrome.debugger.sendCommand({tabId: -1}, 'Network.enable');

    } catch (error) {
      console.error('Failed to start network monitoring:', error);
      throw new Error(`Network monitoring initialization failed: ${error.message}`);
    }
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      await chrome.debugger.detach({tabId: -1});
      this.isMonitoring = false;
    } catch (error) {
      console.error('Failed to stop network monitoring:', error);
      throw new Error(`Network monitoring stop failed: ${error.message}`);
    }
  }

  private handleDebuggerEvent(source: chrome.debugger.Debuggee, method: string, params: any): void {
    switch (method) {
      case 'Network.requestWillBeSent':
        this.handleRequest(params);
        break;
      case 'Network.responseReceived':
        this.handleResponse(params);
        break;
      case 'Network.loadingFailed':
        this.handleFailure(params);
        break;
    }
  }

  private handleRequest(params: any): void {
    const { requestId, request } = params;
    this.requestTimes.set(requestId, Date.now());
    this.stats.totalRequests++;

    if (this.isProxiedRequest(request)) {
      this.stats.proxyRequests++;
    }
  }

  private handleResponse(params: any): void {
    const { requestId, response } = params;
    const startTime = this.requestTimes.get(requestId);

    if (startTime) {
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);
      this.requestTimes.delete(requestId);
      this.checkProxyResponse(response);
    }
  }

  private handleFailure(params: any): void {
    const { requestId, errorText } = params;
    
    this.stats.failedRequests++;
    if (this.isProxyFailure(errorText)) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'PROXY_ERROR',
        message: errorText
      });
    }
    
    this.requestTimes.delete(requestId);
  }

  private isProxiedRequest(request: any): boolean {
    return request.url.includes('zscaler') || request.headers['X-ZScaler-Auth'];
  }

  private updateAverageResponseTime(latency: number): void {
    const alpha = 0.2; // Smoothing factor for moving average
    this.stats.avgProxyLatency = alpha * latency + (1 - alpha) * this.stats.avgProxyLatency;

    if (latency > this.config.latencyThresholds.critical) {
      this.handleZscalerError({
        timestamp: Date.now(),
        type: 'LATENCY_CRITICAL',
        message: `Proxy latency critical: ${latency}ms`
      });
    }
  }

  private handleZscalerError(error: ZscalerError): void {
    this.stats.zscalerErrors.push(error);
    
    // Rotate error log if too large
    if (this.stats.zscalerErrors.length > 100) {
      this.stats.zscalerErrors.shift();
    }

    // Emit error event
    chrome.runtime.sendMessage({
      type: 'ZSCALER_ERROR',
      error
    });
  }

  private isProxyFailure(error: string): boolean {
    return this.config.retryConfig.retryableErrors.some(e => error.includes(e));
  }

  private async retryRequest(requestId: string, request: NetworkRequest): Promise<void> {
    const attempts = this.retryAttempts.get(requestId) || 0;
    
    if (attempts >= this.config.retryConfig.maxRetries) {
      this.stats.retryFailures++;
      return;
    }

    // Exponential backoff
    const delay = this.config.retryConfig.backoffMs * Math.pow(2, attempts);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await chrome.debugger.sendCommand(
        {tabId: -1},
        'Network.sendRequest',
        { request }
      );
      this.stats.retrySuccesses++;
      this.retryAttempts.set(requestId, attempts + 1);
    } catch (error) {
      this.stats.retryFailures++;
      console.error(`Retry attempt ${attempts + 1} failed:`, error);
    }
  }

  public getHealthMetrics(): ProxyHealthMetrics {
    return {
      healthScore: this.calculateHealthScore(),
      latency: this.stats.avgProxyLatency,
      successRate: this.stats.totalRequests > 0 
        ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
        : 1,
      proxyUsage: this.stats.totalRequests > 0
        ? this.stats.proxyRequests / this.stats.totalRequests
        : 0,
      errorRate: this.stats.totalRequests > 0
        ? this.stats.failedRequests / this.stats.totalRequests
        : 0,
      recentErrors: [...this.stats.zscalerErrors].slice(-10) // Last 10 errors
    };
  }

  public getNetworkStats(): NetworkStats {
    return { ...this.stats };
  }

  public clearStats(): void {
    this.stats = {
      totalRequests: 0,
      proxyRequests: 0,
      failedRequests: 0,
      retrySuccesses: 0,
      retryFailures: 0,
      avgProxyLatency: 0,
      zscalerErrors: []
    };
    this.requestTimes.clear();
    this.retryAttempts.clear();
  }

  private calculateHealthScore(): number {
    const latencyScore = Math.max(0, 1 - (this.stats.avgProxyLatency / this.config.latencyThresholds.critical));
    const successScore = this.stats.totalRequests > 0
      ? 1 - (this.stats.failedRequests / this.stats.totalRequests)
      : 1;
    const retryScore = this.stats.retrySuccesses > 0
      ? this.stats.retrySuccesses / (this.stats.retrySuccesses + this.stats.retryFailures)
      : 1;

    return (latencyScore * 0.4 + successScore * 0.4 + retryScore * 0.2);
  }
}

