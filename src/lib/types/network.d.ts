export interface NetworkInterface {
  address: string;
  name: string;
  prefixLength: number;
}

export interface NetworkStats {
  totalRequests: number;
  proxyRequests: number;
  failedRequests: number;
  retrySuccesses: number;
  retryFailures: number;
  avgProxyLatency: number;
  zscalerErrors: ZscalerError[];
}

export interface ZscalerError {
  timestamp: number;
  type: string;
  message: string;
  requestUrl?: string;
}

export interface NetworkMonitorConfig {
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
    retryableErrors: string[];
  };
  latencyThresholds: {
    warning: number;
    critical: number;
  };
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  requestId: string;
  timestamp: number;
  responseTime?: number;
}

export interface NetworkResponse {
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timestamp: number;
}

export interface ProxyHealthMetrics {
  healthScore: number;
  latency: number;
  successRate: number;
  proxyUsage: number;
  errorRate: number;
  recentErrors: ZscalerError[];
}

export interface NetworkMonitor {
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  getHealthMetrics(): ProxyHealthMetrics;
  getNetworkStats(): NetworkStats;
  clearStats(): void;
}

