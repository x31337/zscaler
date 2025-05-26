import {
  isZscalerErrorType,
  isZscalerError,
  isNetworkStats,
  isNetworkMonitorConfig,
  isProxyHealthMetrics,
  isProxyServer,
  isProxyRules,
  isProxyConfig,
  validateNetworkConfig
} from '../network.guards';
import type { 
  ZscalerError, 
  NetworkStats,
  NetworkMonitorConfig,
  ProxyHealthMetrics,
  ProxyServer,
  ProxyRules,
  ProxyConfig
} from '../network.types';

describe('Network Type Guards', () => {
  describe('ZscalerError Validation', () => {
    describe('isZscalerErrorType', () => {
      it('should validate valid error types', () => {
        expect(isZscalerErrorType('AUTH_ERROR')).toBe(true);
        expect(isZscalerErrorType('GATEWAY_ERROR')).toBe(true);
        expect(isZscalerErrorType('PROXY_ERROR')).toBe(true);
        expect(isZscalerErrorType('CONFIG_ERROR')).toBe(true);
        expect(isZscalerErrorType('LATENCY_ERROR')).toBe(true);
        expect(isZscalerErrorType('SSL_ERROR')).toBe(true);
      });

      it('should reject invalid error types', () => {
        expect(isZscalerErrorType('UNKNOWN_ERROR')).toBe(false);
        expect(isZscalerErrorType('')).toBe(false);
        expect(isZscalerErrorType(123)).toBe(false);
        expect(isZscalerErrorType(null)).toBe(false);
        expect(isZscalerErrorType(undefined)).toBe(false);
      });
    });

    describe('isZscalerError', () => {
      const validError: ZscalerError = {
        timestamp: Date.now(),
        type: 'PROXY_ERROR',
        message: 'Connection failed',
        requestUrl: 'https://example.com'
      };

      it('should validate minimal valid error', () => {
        expect(isZscalerError(validError)).toBe(true);
      });

      it('should validate error with complete details', () => {
        const fullError: ZscalerError = {
          ...validError,
          details: {
            statusCode: 407,
            error: 'Proxy Authentication Required',
            latency: 1000,
            threshold: 500,
            avgLatency: 750,
            attempts: 3,
            headers: {
              'Proxy-Authenticate': 'Basic realm="zscaler"',
              'Proxy-Connection': 'close'
            }
          }
        };
        expect(isZscalerError(fullError)).toBe(true);
      });

      it('should validate error with partial details', () => {
        const partialError: ZscalerError = {
          ...validError,
          details: {
            statusCode: 407,
            headers: {
              'Proxy-Authenticate': 'Basic'
            }
          }
        };
        expect(isZscalerError(partialError)).toBe(true);
      });

      it('should reject error details with invalid types', () => {
        const invalidError = {
          timestamp: Date.now(),
          type: 'SSL_ERROR',
          message: 'SSL error',
          details: {
            statusCode: '407', // Should be number
            attempts: '3', // Should be number
            headers: 'invalid' // Should be object
          }
        };
        expect(isZscalerError(invalidError)).toBe(false);
      });

      it('should reject invalid errors', () => {
        expect(isZscalerError(null)).toBe(false);
        expect(isZscalerError({})).toBe(false);
        expect(isZscalerError({ ...validError, type: 'INVALID' })).toBe(false);
        expect(isZscalerError({ ...validError, timestamp: '123' })).toBe(false);
        expect(isZscalerError({ ...validError, details: { statusCode: '407' } })).toBe(false);
      });
    });
  });

  describe('Network Stats and Metrics', () => {
    describe('NetworkStats validation', () => {
      const baseStats: NetworkStats = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 5,
        retrySuccesses: 3,
        retryFailures: 2,
        avgProxyLatency: 250,
        zscalerErrors: []
      };

      it('should validate consistent request counts', () => {
        expect(isNetworkStats({
          ...baseStats,
          totalRequests: 10,
          proxyRequests: 8,
          failedRequests: 2
        })).toBe(true);
      });

      it('should validate zero counts', () => {
        expect(isNetworkStats({
          ...baseStats,
          totalRequests: 0,
          proxyRequests: 0,
          failedRequests: 0,
          retrySuccesses: 0,
          retryFailures: 0,
          avgProxyLatency: 0
        })).toBe(true);
      });

      it('should validate stats with errors', () => {
        const statsWithErrors: NetworkStats = {
          ...baseStats,
          zscalerErrors: [{
            timestamp: Date.now(),
            type: 'PROXY_ERROR',
            message: 'Test error'
          }]
        };
        expect(isNetworkStats(statsWithErrors)).toBe(true);
      });

      it('should reject invalid stats', () => {
        expect(isNetworkStats(null)).toBe(false);
        expect(isNetworkStats({})).toBe(false);
        expect(isNetworkStats({ ...baseStats, totalRequests: '100' })).toBe(false);
        expect(isNetworkStats({ ...baseStats, zscalerErrors: [{}] })).toBe(false);
      });
    });

    describe('ProxyHealthMetrics validation', () => {
      const baseMetrics: ProxyHealthMetrics = {
        healthScore: 0.5,
        latency: 100,
        successRate: 0.95,
        proxyUsage: 0.8,
        errorRate: 0.05,
        recentErrors: []
      };

      it('should validate edge case ratios', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 1 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 1 })).toBe(true);
      });

      it('should reject out of bounds ratios', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: -0.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 1.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: -0.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 1.1 })).toBe(false);
      });

      it('should validate zero and positive latencies', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: Number.MAX_SAFE_INTEGER })).toBe(true);
      });

      it('should reject negative latencies', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: -1 })).toBe(false);
      });

      it('should validate metrics with errors', () => {
        const metricsWithErrors: ProxyHealthMetrics = {
          ...baseMetrics,
          recentErrors: [{
            timestamp: Date.now(),
            type: 'PROXY_ERROR',
            message: 'Test error'
          }]
        };
        expect(isProxyHealthMetrics(metricsWithErrors)).toBe(true);
      });

      it('should reject invalid metrics', () => {
        expect(isProxyHealthMetrics(null)).toBe(false);
        expect(isProxyHealthMetrics({})).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 1.5 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: -0.1 })).toBe(false);
      });
    });
  });

  describe('Proxy Configuration', () => {
    const validServer: ProxyServer = {
      host: 'proxy.example.com',
      scheme: 'https',
      port: 8080
    };

    describe('ProxyServer validation', () => {
      it('should validate minimal server config', () => {
        expect(isProxyServer({ host: 'proxy.example.com' })).toBe(true);
      });

      it('should validate complete server config', () => {
        expect(isProxyServer(validServer)).toBe(true);
      });

      it('should validate proxy server URLs with different schemes', () => {
        ['http', 'https', 'socks4', 'socks5'].forEach(scheme => {
          expect(isProxyServer({
            host: 'proxy.example.com',
            scheme
          })).toBe(true);
        });
      });

      it('should reject invalid schemes', () => {
        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'ftp'
        })).toBe(false);
      });

      it('should reject invalid servers', () => {
        expect(isProxyServer(null)).toBe(false);
        expect(isProxyServer({})).toBe(false);
        expect(isProxyServer({ host: 'proxy.example.com', port: '8080' })).toBe(false);
      });
    });

    describe('ProxyRules validation', () => {
      it('should validate minimal rules', () => {
        expect(isProxyRules({})).toBe(true);
      });

      it('should validate complete rules', () => {
        const rules: ProxyRules = {
          singleProxy: validServer,
          proxyForHttp: validServer,
          proxyForHttps: validServer,
          fallbackProxy: validServer,
          bypassList: ['*.example.com']
        };
        expect(isProxyRules(rules)).toBe(true);
      });

      it('should reject invalid rules', () => {
        expect(isProxyRules(null)).toBe(false);
        expect(isProxyRules({ singleProxy: {} })).toBe(false);
        expect(isProxyRules({ bypassList: ['*.example.com', 123] })).toBe(false);
      });
    });

    describe('ProxyConfig validation', () => {
      it('should validate all proxy modes', () => {
        expect(isProxyConfig({ mode: 'direct' })).toBe(true);
        expect(isProxyConfig({ mode: 'auto_detect' })).toBe(true);
        expect(isProxyConfig({ mode: 'pac_script' })).toBe(true);
        expect(isProxyConfig({ mode: 'fixed_servers' })).toBe(true);
        expect(isProxyConfig({ mode: 'system' })).toBe(true);
      });

      it('should validate mode-specific configurations', () => {
        // PAC script configuration
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            data: 'function FindProxyForURL() { return "DIRECT"; }'
          }
        })).toBe(true);

        // Fixed server configuration
        expect(isProxyConfig({
          mode: 'fixed_servers',
          rules: {
            singleProxy: { host: 'proxy.example.com' }
          }
        })).toBe(true);
      });

      it('should validate PAC script URLs', () => {
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'http://example.com/proxy.pac'
          }
        })).toBe(true);

        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'https://example.com/proxy.pac'
          }
        })).toBe(true);
      });

      it('should allow empty rules with non-fixed_servers mode', () => {
        expect(isProxyConfig({
          mode: 'direct',
          rules: {}
        })).toBe(true);
      });

      it('should reject invalid PAC script URLs', () => {
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'ftp://example.com/proxy.pac'
          }
        })).toBe(false);
      });

      it('should reject invalid configs', () => {
        expect(isProxyConfig(null)).toBe(false);
        expect(isProxyConfig({ mode: 'invalid' })).toBe(false);
        expect(isProxyConfig({ pacScript: { data: 123 } })).toBe(false);
      });
    });
  });

  describe('Network Monitor Configuration', () => {
    const validConfig: NetworkMonitorConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 100,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 500,
        critical: 1000
      },
      zscalerDomains: ['zscaler.net']
    };

    describe('isNetworkMonitorConfig', () => {
      it('should validate valid config', () => {
        expect(isNetworkMonitorConfig(validConfig)).toBe(true);
      });

      it('should validate config with multiple domains and errors', () => {
        const extendedConfig: NetworkMonitorConfig = {
          ...validConfig,
          zscalerDomains: ['zscaler.net', 'zscalerone.net'],
          retryConfig: {
            ...validConfig.retryConfig,
            retryableErrors: ['proxy connection failed', 'gateway timeout']
          }
        };
        expect(isNetworkMonitorConfig(extendedConfig)).toBe(true);
      });

      it('should reject invalid configs', () => {
        expect(isNetworkMonitorConfig(null)).toBe(false);
        expect(isNetworkMonitorConfig({})).toBe(false);
        expect(isNetworkMonitorConfig({ ...validConfig, retryConfig: null })).toBe(false);
        expect(isNetworkMonitorConfig({
          ...validConfig,
          zscalerDomains: ['zscaler.net', 123]
        })).toBe(false);
      });
    });

    describe('validateNetworkConfig', () => {
      it('should pass validation for valid config', () => {
        expect(() => validateNetworkConfig(validConfig)).not.toThrow();
      });

      it('should throw for invalid config structure', () => {
        expect(() => validateNetworkConfig(null)).toThrow('Invalid network monitor configuration');
        expect(() => validateNetworkConfig({})).toThrow('Invalid network monitor configuration');
      });

      it('should throw for negative maxRetries', () => {
        expect(() => validateNetworkConfig({
          ...validConfig,
          retryConfig: { ...validConfig.retryConfig, maxRetries: -1 }
        })).toThrow('maxRetries must be non-negative');
      });

      it('should throw for negative backoffMs', () => {
        expect(() => validateNetworkConfig({
          ...validConfig,
          retryConfig: { ...validConfig.retryConfig, backoffMs: -1 }
        })).toThrow('backoffMs must be non-negative');
      });

      it('should throw for negative warning threshold', () => {
        expect(() => validateNetworkConfig({
          ...validConfig,
          latencyThresholds: { ...validConfig.latencyThresholds, warning: -1 }
        })).toThrow('warning threshold must be non-negative');
      });

      it('should throw when critical threshold is less than warning', () => {
        expect(() => validateNetworkConfig({
          ...validConfig,
          latencyThresholds: { warning: 1000, critical: 500 }
        })).toThrow('critical threshold must be greater than warning threshold');
      });
    });
  });
});

import { 
  isProxyHealthMetrics,
  isNetworkStats,
  isProxyConfig,
  isProxyServer,
  isZscalerError
} from '../network.guards';
import type {
  ProxyHealthMetrics,
  NetworkStats,
  ZscalerError
} from '../network.types';

describe('Network Type Guards', () => {
  describe('Numeric Validation Edge Cases', () => {
    describe('ProxyHealthMetrics bounds', () => {
      const baseMetrics: ProxyHealthMetrics = {
        healthScore: 0.5,
        latency: 100,
        successRate: 0.95,
        proxyUsage: 0.8,
        errorRate: 0.05,
        recentErrors: []
      };

      it('should validate edge case ratios', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 1 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 1 })).toBe(true);
      });

      it('should reject out of bounds ratios', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: -0.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, healthScore: 1.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: -0.1 })).toBe(false);
        expect(isProxyHealthMetrics({ ...baseMetrics, successRate: 1.1 })).toBe(false);
      });

      it('should validate zero and positive latencies', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: 0 })).toBe(true);
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: Number.MAX_SAFE_INTEGER })).toBe(true);
      });

      it('should reject negative latencies', () => {
        expect(isProxyHealthMetrics({ ...baseMetrics, latency: -1 })).toBe(false);
      });
    });

    describe('NetworkStats validation', () => {
      const baseStats: NetworkStats = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 5,
        retrySuccesses: 3,
        retryFailures: 2,
        avgProxyLatency: 250,
        zscalerErrors: []
      };

      it('should validate consistent request counts', () => {
        expect(isNetworkStats({
          ...baseStats,
          totalRequests: 10,
          proxyRequests: 8,
          failedRequests: 2
        })).toBe(true);
      });

      it('should validate zero counts', () => {
        expect(isNetworkStats({
          ...baseStats,
          totalRequests: 0,
          proxyRequests: 0,
          failedRequests: 0,
          retrySuccesses: 0,
          retryFailures: 0,
          avgProxyLatency: 0
        })).toBe(true);
      });
    });
  });

  describe('Chrome Proxy Configuration', () => {
    describe('ProxyConfig mode transitions', () => {
      it('should validate all proxy modes', () => {
        expect(isProxyConfig({ mode: 'direct' })).toBe(true);
        expect(isProxyConfig({ mode: 'auto_detect' })).toBe(true);
        expect(isProxyConfig({ mode: 'pac_script' })).toBe(true);
        expect(isProxyConfig({ mode: 'fixed_servers' })).toBe(true);
        expect(isProxyConfig({ mode: 'system' })).toBe(true);
      });

      it('should validate mode-specific configurations', () => {
        // PAC script configuration
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            data: 'function FindProxyForURL() { return "DIRECT"; }'
          }
        })).toBe(true);

        // Fixed server configuration
        expect(isProxyConfig({
          mode: 'fixed_servers',
          rules: {
            singleProxy: { host: 'proxy.example.com' }
          }
        })).toBe(true);
      });

      it('should allow empty rules with non-fixed_servers mode', () => {
        expect(isProxyConfig({
          mode: 'direct',
          rules: {}
        })).toBe(true);
      });
    });

    describe('URL validation', () => {
      it('should validate proxy server URLs', () => {
        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'http'
        })).toBe(true);
        
        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'https'
        })).toBe(true);

        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'socks4'
        })).toBe(true);

        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'socks5'
        })).toBe(true);
      });

      it('should reject invalid schemes', () => {
        expect(isProxyServer({
          host: 'proxy.example.com',
          scheme: 'ftp'
        })).toBe(false);
      });

      it('should validate PAC script URLs', () => {
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'http://example.com/proxy.pac'
          }
        })).toBe(true);

        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'https://example.com/proxy.pac'
          }
        })).toBe(true);
      });

      it('should reject invalid PAC script URLs', () => {
        expect(isProxyConfig({
          mode: 'pac_script',
          pacScript: {
            url: 'ftp://example.com/proxy.pac'
          }
        })).toBe(false);
      });
    });
  });

  describe('Error Details Validation', () => {
    it('should validate detailed error information', () => {
      const error: ZscalerError = {
        timestamp: Date.now(),
        type: 'PROXY_ERROR',
        message: 'Proxy authentication failed',
        requestUrl: 'https://example.com/api',
        details: {
          statusCode: 407,
          error: 'net::ERR_PROXY_AUTH_REQUIRED',
          latency: 1500,
          threshold: 1000,
          avgLatency: 800,
          attempts: 3,
          headers: {
            'Proxy-Authenticate': 'Basic realm="zscaler"',
            'Proxy-Connection': 'close'
          }
        }
      };

      expect(isZscalerError(error)).toBe(true);
    });

    it('should validate error details with missing optional fields', () => {
      const error: ZscalerError = {
        timestamp: Date.now(),
        type: 'SSL_ERROR',
        message: 'SSL certificate validation failed',
        requestUrl: 'https://example.com',
        details: {
          error: 'net::ERR_CERT_AUTHORITY_INVALID'
        }
      };

      expect(isZscalerError(error)).toBe(true);
    });

    it('should reject error details with invalid types', () => {
      const invalidError = {
        timestamp: Date.now(),
        type: 'SSL_ERROR',
        message: 'SSL error',
        details: {
          statusCode: '407', // Should be number
          attempts: '3', // Should be number
          headers: 'invalid' // Should be object
        }
      };

      expect(isZscalerError(invalidError)).toBe(false);
    });
  });
});

import {
  isZscalerErrorType,
  isZscalerError,
  isNetworkStats,
  isNetworkMonitorConfig,
  isProxyHealthMetrics,
  isProxyServer,
  isProxyRules,
  isProxyConfig,
  validateNetworkConfig
} from '../network.guards';
import type { 
  ZscalerError, 
  NetworkStats,
  NetworkMonitorConfig,
  ProxyHealthMetrics,
  ProxyServer,
  ProxyRules,
  ProxyConfig
} from '../network';

describe('Network Type Guards', () => {
  describe('isZscalerErrorType', () => {
    it('should validate valid error types', () => {
      expect(isZscalerErrorType('AUTH_ERROR')).toBe(true);
      expect(isZscalerErrorType('GATEWAY_ERROR')).toBe(true);
      expect(isZscalerErrorType('PROXY_ERROR')).toBe(true);
      expect(isZscalerErrorType('CONFIG_ERROR')).toBe(true);
      expect(isZscalerErrorType('LATENCY_ERROR')).toBe(true);
      expect(isZscalerErrorType('SSL_ERROR')).toBe(true);
    });

    it('should reject invalid error types', () => {
      expect(isZscalerErrorType('UNKNOWN_ERROR')).toBe(false);
      expect(isZscalerErrorType('')).toBe(false);
      expect(isZscalerErrorType(123)).toBe(false);
      expect(isZscalerErrorType(null)).toBe(false);
      expect(isZscalerErrorType(undefined)).toBe(false);
    });
  });

  describe('isZscalerError', () => {
    const validError: ZscalerError = {
      timestamp: Date.now(),
      type: 'PROXY_ERROR',
      message: 'Connection failed',
      requestUrl: 'https://example.com'
    };

    it('should validate minimal valid error', () => {
      expect(isZscalerError(validError)).toBe(true);
    });

    it('should validate error with complete details', () => {
      const fullError: ZscalerError = {
        ...validError,
        details: {
          statusCode: 407,
          error: 'Proxy Authentication Required',
          latency: 1000,
          threshold: 500,
          avgLatency: 750,
          attempts: 3,
          headers: {
            'Proxy-Authenticate': 'Basic'
          }
        }
      };
      expect(isZscalerError(fullError)).toBe(true);
    });

    it('should validate error with partial details', () => {
      const partialError: ZscalerError = {
        ...validError,
        details: {
          statusCode: 407,
          headers: {
            'Proxy-Authenticate': 'Basic'
          }
        }
      };
      expect(isZscalerError(partialError)).toBe(true);
    });

    it('should reject invalid errors', () => {
      expect(isZscalerError(null)).toBe(false);
      expect(isZscalerError({})).toBe(false);
      expect(isZscalerError({ ...validError, type: 'INVALID' })).toBe(false);
      expect(isZscalerError({ ...validError, timestamp: '123' })).toBe(false);
      expect(isZscalerError({ ...validError, details: { statusCode: '407' } })).toBe(false);
    });
  });

  describe('isNetworkStats', () => {
    const validStats: NetworkStats = {
      totalRequests: 100,
      proxyRequests: 80,
      failedRequests: 5,
      retrySuccesses: 3,
      retryFailures: 2,
      avgProxyLatency: 250,
      zscalerErrors: []
    };

    it('should validate valid stats', () => {
      expect(isNetworkStats(validStats)).toBe(true);
    });

    it('should validate stats with errors', () => {
      const statsWithErrors: NetworkStats = {
        ...validStats,
        zscalerErrors: [{
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: 'Test error'
        }]
      };
      expect(isNetworkStats(statsWithErrors)).toBe(true);
    });

    it('should reject invalid stats', () => {
      expect(isNetworkStats(null)).toBe(false);
      expect(isNetworkStats({})).toBe(false);
      expect(isNetworkStats({ ...validStats, totalRequests: '100' })).toBe(false);
      expect(isNetworkStats({ ...validStats, zscalerErrors: [{}] })).toBe(false);
    });
  });

  describe('isNetworkMonitorConfig', () => {
    const validConfig: NetworkMonitorConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 100,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 500,
        critical: 1000
      },
      zscalerDomains: ['zscaler.net']
    };

    it('should validate valid config', () => {
      expect(isNetworkMonitorConfig(validConfig)).toBe(true);
    });

    it('should validate config with multiple domains and errors', () => {
      const extendedConfig: NetworkMonitorConfig = {
        ...validConfig,
        zscalerDomains: ['zscaler.net', 'zscalerone.net'],
        retryConfig: {
          ...validConfig.retryConfig,
          retryableErrors: ['proxy connection failed', 'gateway timeout']
        }
      };
      expect(isNetworkMonitorConfig(extendedConfig)).toBe(true);
    });

    it('should reject invalid configs', () => {
      expect(isNetworkMonitorConfig(null)).toBe(false);
      expect(isNetworkMonitorConfig({})).toBe(false);
      expect(isNetworkMonitorConfig({ ...validConfig, retryConfig: null })).toBe(false);
      expect(isNetworkMonitorConfig({
        ...validConfig,
        zscalerDomains: ['zscaler.net', 123]
      })).toBe(false);
    });
  });

  describe('isProxyHealthMetrics', () => {
    const validMetrics: ProxyHealthMetrics = {
      healthScore: 0.95,
      latency: 250,
      successRate: 0.98,
      proxyUsage: 0.8,
      errorRate: 0.02,
      recentErrors: []
    };

    it('should validate valid metrics', () => {
      expect(isProxyHealthMetrics(validMetrics)).toBe(true);
    });

    it('should validate metrics with errors', () => {
      const metricsWithErrors: ProxyHealthMetrics = {
        ...validMetrics,
        recentErrors: [{
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: 'Test error'
        }]
      };
      expect(isProxyHealthMetrics(metricsWithErrors)).toBe(true);
    });

    it('should reject invalid metrics', () => {
      expect(isProxyHealthMetrics(null)).toBe(false);
      expect(isProxyHealthMetrics({})).toBe(false);
      expect(isProxyHealthMetrics({ ...validMetrics, healthScore: 1.5 })).toBe(false);
      expect(isProxyHealthMetrics({ ...validMetrics, successRate: -0.1 })).toBe(false);
    });
  });

  describe('isProxyServer', () => {
    const validServer: ProxyServer = {
      host: 'proxy.example.com'
    };

    it('should validate minimal server config', () => {
      expect(isProxyServer(validServer)).toBe(true);
    });

    it('should validate complete server config', () => {
      const fullServer: ProxyServer = {
        host: 'proxy.example.com',
        scheme: 'https',
        port: 8080
      };
      expect(isProxyServer(fullServer)).toBe(true);
    });

    it('should reject invalid servers', () => {
      expect(isProxyServer(null)).toBe(false);
      expect(isProxyServer({})).toBe(false);
      expect(isProxyServer({ ...validServer, port: '8080' })).toBe(false);
    });
  });

  describe('isProxyRules', () => {
    const validServer: ProxyServer = {
      host: 'proxy.example.com',
      scheme: 'https',
      port: 8080
    };

    it('should validate minimal rules', () => {
      expect(isProxyRules({})).toBe(true);
    });

    it('should validate complete rules', () => {
      const rules: ProxyRules = {
        singleProxy: validServer,
        proxyForHttp: validServer,
        proxyForHttps: validServer,
        fallbackProxy: validServer,
        bypassList: ['*.example.com']
      };
      expect(isProxyRules(rules)).toBe(true);
    });

    it('should reject invalid rules', () => {
      expect(isProxyRules(null)).toBe(false);
      expect(isProxyRules({ singleProxy: {} })).toBe(false);
      expect(isProxyRules({ bypassList: ['*.example.com', 123] })).toBe(false);
    });
  });

  describe('isProxyConfig', () => {
    const validServer: ProxyServer = {
      host: 'proxy.example.com',
      scheme: 'https',
      port: 8080
    };

    it('should validate minimal config', () => {
      expect(isProxyConfig({})).toBe(true);
    });

    it('should validate complete config', () => {
      const config: ProxyConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: validServer,
          bypassList: ['*.example.com']
        },
        pacScript: {
          data: 'function FindProxyForURL(url, host) { return "DIRECT"; }',
          url: 'https://example.com/proxy.pac',
          mandatory: true
        }
      };
      expect(isProxyConfig(config)).toBe(true);
    });

    it('should reject invalid configs', () => {
      expect(isProxyConfig(null)).toBe(false);
      expect(isProxyConfig({ mode: 'invalid' })).toBe(false);
      expect(isProxyConfig({ pacScript: { data: 123 } })).toBe(false);
    });
  });

  describe('validateNetworkConfig', () => {
    const validConfig: NetworkMonitorConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 100,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 500,
        critical: 1000
      },
      zscalerDomains: ['zscaler.net']
    };

    it('should pass validation for valid config', () => {
      expect(() => validateNetworkConfig(validConfig)).not.toThrow();
    });

    it('should throw for invalid config structure', () => {
      expect(() => validateNetworkConfig(null)).toThrow('Invalid network monitor configuration');
      expect(() => validateNetworkConfig({})).toThrow('Invalid network monitor configuration');
    });

    it('should throw for negative maxRetries', () => {
      expect(() => validateNetworkConfig({
        ...validConfig,
        retryConfig: { ...validConfig.retryConfig, maxRetries: -1 }
      })).toThrow('maxRetries must be non-negative');
    });

    it('should throw for negative backoffMs', () => {
      expect(() => validateNetworkConfig({
        ...validConfig,
        retryConfig: { ...validConfig.retryConfig, backoffMs: -1 }
      })).toThrow('backoffMs must be non-negative');
    });

    it('should throw for negative warning threshold', () => {
      expect(() => validateNetworkConfig({
        ...validConfig,
        latencyThresholds: { ...validConfig.latencyThresholds, warning: -1 }
      })).toThrow('warning threshold must be non-negative');
    });

    it('should throw when critical threshold is less than warning', () => {
      expect(() => validateNetworkConfig({
        ...validConfig,
        latencyThresholds: { warning: 1000, critical: 500 }
      })).toThrow('critical threshold must be greater than warning threshold');
    });
  });
});

