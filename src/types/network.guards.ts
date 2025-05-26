import type {
  ZscalerErrorType,
  ZscalerError,
  NetworkStats,
  NetworkMonitorConfig,
  ProxyHealthMetrics,
  ProxyConfig,
  ProxyRules,
  ProxyServer
} from './network';

/**
 * Type guard for ZscalerErrorType
 */
export function isZscalerErrorType(value: unknown): value is ZscalerErrorType {
  return typeof value === 'string' && [
    'AUTH_ERROR',
    'GATEWAY_ERROR',
    'PROXY_ERROR',
    'CONFIG_ERROR',
    'LATENCY_ERROR',
    'SSL_ERROR'
  ].includes(value as ZscalerErrorType);
}

/**
 * Type guard for ZscalerError
 */
export function isZscalerError(value: unknown): value is ZscalerError {
  if (!value || typeof value !== 'object') return false;
  
  const error = value as ZscalerError;
  
  return (
    typeof error.timestamp === 'number' &&
    isZscalerErrorType(error.type) &&
    typeof error.message === 'string' &&
    (error.requestUrl === undefined || typeof error.requestUrl === 'string') &&
    (error.details === undefined || (
      typeof error.details === 'object' &&
      (error.details.statusCode === undefined || typeof error.details.statusCode === 'number') &&
      (error.details.error === undefined || typeof error.details.error === 'string') &&
      (error.details.latency === undefined || typeof error.details.latency === 'number') &&
      (error.details.threshold === undefined || typeof error.details.threshold === 'number') &&
      (error.details.avgLatency === undefined || typeof error.details.avgLatency === 'number') &&
      (error.details.attempts === undefined || typeof error.details.attempts === 'number') &&
      (error.details.headers === undefined || (
        typeof error.details.headers === 'object' &&
        Object.entries(error.details.headers).every(([k, v]) => typeof k === 'string' && typeof v === 'string')
      ))
    ))
  );
}

/**
 * Type guard for NetworkStats
 */
export function isNetworkStats(value: unknown): value is NetworkStats {
  if (!value || typeof value !== 'object') return false;
  
  const stats = value as NetworkStats;
  
  return (
    typeof stats.totalRequests === 'number' &&
    typeof stats.proxyRequests === 'number' &&
    typeof stats.failedRequests === 'number' &&
    typeof stats.retrySuccesses === 'number' &&
    typeof stats.retryFailures === 'number' &&
    typeof stats.avgProxyLatency === 'number' &&
    Array.isArray(stats.zscalerErrors) &&
    stats.zscalerErrors.every(isZscalerError)
  );
}

/**
 * Type guard for NetworkMonitorConfig
 */
export function isNetworkMonitorConfig(value: unknown): value is NetworkMonitorConfig {
  if (!value || typeof value !== 'object') return false;
  
  const config = value as NetworkMonitorConfig;
  
  return (
    typeof config.retryConfig === 'object' &&
    typeof config.retryConfig.maxRetries === 'number' &&
    typeof config.retryConfig.backoffMs === 'number' &&
    Array.isArray(config.retryConfig.retryableErrors) &&
    config.retryConfig.retryableErrors.every(e => typeof e === 'string') &&
    typeof config.latencyThresholds === 'object' &&
    typeof config.latencyThresholds.warning === 'number' &&
    typeof config.latencyThresholds.critical === 'number' &&
    Array.isArray(config.zscalerDomains) &&
    config.zscalerDomains.every(d => typeof d === 'string')
  );
}

/**
 * Type guard for ProxyHealthMetrics
 */
export function isProxyHealthMetrics(value: unknown): value is ProxyHealthMetrics {
  if (!value || typeof value !== 'object') return false;
  
  const metrics = value as ProxyHealthMetrics;
  
  return (
    typeof metrics.healthScore === 'number' &&
    metrics.healthScore >= 0 &&
    metrics.healthScore <= 1 &&
    typeof metrics.latency === 'number' &&
    typeof metrics.successRate === 'number' &&
    metrics.successRate >= 0 &&
    metrics.successRate <= 1 &&
    typeof metrics.proxyUsage === 'number' &&
    metrics.proxyUsage >= 0 &&
    metrics.proxyUsage <= 1 &&
    typeof metrics.errorRate === 'number' &&
    metrics.errorRate >= 0 &&
    metrics.errorRate <= 1 &&
    Array.isArray(metrics.recentErrors) &&
    metrics.recentErrors.every(isZscalerError)
  );
}

/**
 * Type guard for ProxyServer configuration
 */
export function isProxyServer(value: unknown): value is ProxyServer {
  if (!value || typeof value !== 'object') return false;
  
  const server = value as ProxyServer;
  
  return (
    typeof server.host === 'string' &&
    (server.scheme === undefined || typeof server.scheme === 'string') &&
    (server.port === undefined || typeof server.port === 'number')
  );
}

/**
 * Type guard for ProxyRules configuration
 */
export function isProxyRules(value: unknown): value is ProxyRules {
  if (!value || typeof value !== 'object') return false;
  
  const rules = value as ProxyRules;
  
  return (
    (rules.singleProxy === undefined || isProxyServer(rules.singleProxy)) &&
    (rules.proxyForHttp === undefined || isProxyServer(rules.proxyForHttp)) &&
    (rules.proxyForHttps === undefined || isProxyServer(rules.proxyForHttps)) &&
    (rules.fallbackProxy === undefined || isProxyServer(rules.fallbackProxy)) &&
    (rules.bypassList === undefined || (
      Array.isArray(rules.bypassList) &&
      rules.bypassList.every(item => typeof item === 'string')
    ))
  );
}

/**
 * Type guard for complete ProxyConfig
 */
export function isProxyConfig(value: unknown): value is ProxyConfig {
  if (!value || typeof value !== 'object') return false;
  
  const config = value as ProxyConfig;
  
  return (
    (config.rules === undefined || isProxyRules(config.rules)) &&
    (config.mode === undefined || [
      'direct',
      'auto_detect',
      'pac_script',
      'fixed_servers',
      'system'
    ].includes(config.mode)) &&
    (config.pacScript === undefined || (
      typeof config.pacScript === 'object' &&
      (config.pacScript.data === undefined || typeof config.pacScript.data === 'string') &&
      (config.pacScript.url === undefined || typeof config.pacScript.url === 'string') &&
      (config.pacScript.mandatory === undefined || typeof config.pacScript.mandatory === 'boolean')
    ))
  );
}

/**
 * Validate network configuration
 * @throws {Error} if validation fails
 */
export function validateNetworkConfig(config: unknown): asserts config is NetworkMonitorConfig {
  if (!isNetworkMonitorConfig(config)) {
    throw new Error('Invalid network monitor configuration');
  }
  
  const typedConfig = config as NetworkMonitorConfig;
  
  // Additional validation rules
  if (typedConfig.retryConfig.maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }
  
  if (typedConfig.retryConfig.backoffMs < 0) {
    throw new Error('backoffMs must be non-negative');
  }
  
  if (typedConfig.latencyThresholds.warning < 0) {
    throw new Error('warning threshold must be non-negative');
  }
  
  if (typedConfig.latencyThresholds.critical < typedConfig.latencyThresholds.warning) {
    throw new Error('critical threshold must be greater than warning threshold');
  }
}

