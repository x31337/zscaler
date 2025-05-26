import { describe, beforeAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';
import { ZSCALER_ERROR_MESSAGES } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let mockChrome: any;
  let defaultConfig: NetworkMonitorConfig;
  let mockNow: number;

  beforeAll(() => {
    mockNow = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
  });

  beforeEach(() => {
    mockChrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onCompleted: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onErrorOccurred: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: vi.fn(),
            removeListener: vi.fn()
          },
          get: vi.fn()
        }
      },
      runtime: {
        sendMessage: vi.fn(),
        lastError: null
      },
      tabs: {
        reload: vi.fn()
      }
    };

    global.chrome = mockChrome;

    defaultConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 100,
        retryableErrors: ['proxy connection failed', 'net::ERR_PROXY_CONNECTION_FAILED']
      },
      latencyThresholds: {
        warning: 500,
        critical: 1000
      },
      zscalerDomains: ['zscaler.net', 'zscalerone.net', 'zscalertwo.net']
    };

    monitor = new NetworkMonitor(defaultConfig);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
      expect(defaultMonitor['config'].retryConfig.maxRetries).toBeDefined();
    });

    it('should merge custom config with defaults preserving defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        },
        zscalerDomains: ['custom.zscaler.net']
      };
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.backoffMs).toBe(defaultConfig.retryConfig.backoffMs);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
      expect(customMonitor['config'].zscalerDomains).toContain('custom.zscaler.net');
      expect(customMonitor['config'].zscalerDomains).toContain('zscaler.net');
    });

    it('should validate config requirements', () => {
      const invalidConfig = {
        retryConfig: {
          maxRetries: -1,
          backoffMs: 0
        }
      };
      expect(() => new NetworkMonitor(invalidConfig)).not.toThrow();
      const monitor = new NetworkMonitor(invalidConfig);
      expect(monitor['config'].retryConfig.maxRetries).toBeGreaterThan(0);
      expect(monitor['config'].retryConfig.backoffMs).toBeGreaterThan(0);
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring with valid proxy config', async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        callback({ value: { rules: { proxyForHttp: { host: 'gateway.zscaler.net' } } } });
      });

      await monitor.startMonitoring();
      
      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] }
      );

      expect(mockChrome.webRequest.onCompleted.addListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );

      expect(monitor['isMonitoring']).toBe(true);
    });

    it('should handle proxy settings error during startup', async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        mockChrome.runtime.lastError = new Error('Access denied');
        callback({ value: null });
      });

      await expect(monitor.startMonitoring()).rejects.toThrow();
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'PROXY_ERROR'
          })
        })
      );
    });

    it('should prevent multiple monitoring starts', async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        callback({ value: { rules: { proxyForHttp: { host: 'gateway.zscaler.net' } } } });
      });

      await monitor.startMonitoring();
      await monitor.startMonitoring();

      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        callback({ value: { rules: { proxyForHttp: { host: 'gateway.zscaler.net' } } } });
      });
      await monitor.startMonitoring();
    });

    it('should accurately track normal and proxy requests', () => {
      const handlers = monitor['handlers'];
      
      // Normal request
      handlers.onBeforeRequest({
        requestId: 'normal-1',
        url: 'https://example.com',
        timeStamp: Date.now()
      });

      // Proxy request by domain
      handlers.onBeforeRequest({
        requestId: 'proxy-1',
        url: 'https://gateway.zscaler.net/path',
        timeStamp: Date.now()
      });

      // Proxy request by initiator
      handlers.onBeforeRequest({
        requestId: 'proxy-2',
        url: 'https://example.com',
        initiator: 'https://zscaler.net',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.proxyRequests).toBe(2);
    });

    it('should handle mixed traffic patterns', () => {
      const handlers = monitor['handlers'];
      const timestamps = [1000, 1100, 1200, 1300, 1400];
      
      // Mix of proxy and direct requests with varying latencies
      timestamps.forEach((time, i) => {
        const isProxy = i % 2 === 0;
        mockNow = time;
        
        handlers.onBeforeRequest({
          requestId: `req-${i}`,
          url: isProxy ? 'https://gateway.zscaler.net/path' : 'https://example.com',
          timeStamp: time
        });

        mockNow = time + (isProxy ? 300 : 100);
        
        handlers.onCompleted({
          requestId: `req-${i}`,
          url: isProxy ? 'https://gateway.zscaler.net/path' : 'https://example.com',
          timeStamp: mockNow,
          responseHeaders: []
        });
      });

      const stats = monitor.getStats();
      expect(stats.proxyRequests).toBe(3);
      expect(stats.totalRequests).toBe(5);
      expect(stats.avgProxyLatency).toBeGreaterThan(200);
    });

    it('should calculate latency metrics correctly', () => {
      const handlers = monitor['handlers'];
      const startTime = 1000;
      const requests = [100, 200, 300].map((latency, i) => {
        const requestId = `req-${i}`;
        mockNow = startTime;
        
        handlers.onBeforeRequest({
          requestId,
          url: 'https://gateway.zscaler.net/path',
          timeStamp: startTime
        });

        mockNow = startTime + latency;
        
        handlers.onCompleted({
          requestId,
          url: 'https://gateway.zscaler.net/path',
          timeStamp: startTime + latency,
          responseHeaders: []
        });

        return latency;
      });

      // With alpha = 0.2, EMA should be:
      // First: 100 * 0.2 = 20
      // Second: 20 * 0.8 + 200 * 0.2 = 52
      // Third: 52 * 0.8 + 300 * 0.2 = 101.6
      expect(monitor['stats'].avgProxyLatency).toBeCloseTo(101.6);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        callback({ value: { rules: { proxyForHttp: { host: 'gateway.zscaler.net' } } } });
      });
      await monitor.startMonitoring();
    });

    it('should handle errors with exponential backoff retry', () => {
      const handlers = monitor['handlers'];
      const requestId = 'error-1';
      const tabId = 42;

      for (let attempt = 0; attempt < defaultConfig.retryConfig.maxRetries; attempt++) {
        handlers.onErrorOccurred({
          requestId,
          url: 'https://example.com',
          error: 'net::ERR_PROXY_CONNECTION_FAILED',
          tabId,
          timeStamp: Date.now()
        });

        // Verify exponential backoff
        const expectedDelay = defaultConfig.retryConfig.backoffMs * Math.pow(2, attempt);
        expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expectedDelay);
        
        vi.runAllTimers();
        expect(mockChrome.tabs.reload).toHaveBeenLastCalledWith(tabId);
      }

      // One more error should trigger failure
      handlers.onErrorOccurred({
        requestId,
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId,
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(4);
      expect(stats.retryFailures).toBe(1);
      expect(stats.zscalerErrors.length).toBe(1);
      expect(stats.zscalerErrors[0].type).toBe('PROXY_ERROR');
    });

    it('should handle connection timeout errors', () => {
      const handlers = monitor['handlers'];
      const errors = [
        'net::ERR_CONNECTION_TIMED_OUT',
        'net::ERR_CONNECTION_CLOSED',
        'net::ERR_CONNECTION_RESET'
      ];

      errors.forEach((error, i) => {
        handlers.onErrorOccurred({
          requestId: `timeout-${i}`,
          url: 'https://example.com',
          error,
          timeStamp: Date.now()
        });
      });

      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(stats.zscalerErrors.filter(e => e.type === 'CONNECTION_ERROR').length).toBe(3);
    });

    it('should handle authentication errors', () => {
      const handlers = monitor['handlers'];
      const authErrors = [
        { status: 407, headers: [{ name: 'Proxy-Authenticate', value: 'Basic' }] },
        { status: 401, headers: [{ name: 'WWW-Authenticate', value: 'Basic' }] },
        { status: 403, headers: [] }
      ];

      authErrors.forEach((error, i) => {
        handlers.onCompleted({
          requestId: `auth-${i}`,
          url: 'https://example.com',
          statusCode: error.status,
          responseHeaders: error.headers,
          timeStamp: Date.now()
        });
      });

      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(stats.zscalerErrors.filter(e => e.type === 'AUTH_ERROR').length).toBe(2);
      expect(stats.zscalerErrors.filter(e => e.type === 'FORBIDDEN').length).toBe(1);
    });

    it('should handle intermittent network failures', () => {
      const handlers = monitor['handlers'];
      const networkErrors = [
        'net::ERR_NETWORK_CHANGED',
        'net::ERR_INTERNET_DISCONNECTED',
        'net::ERR_NAME_RESOLUTION_FAILED'
      ];

      networkErrors.forEach((error, i) => {
        handlers.onErrorOccurred({
          requestId: `network-${i}`,
          url: 'https://example.com',
          error,
          timeStamp: Date.now()
        });
      });

      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(stats.zscalerErrors.filter(e => e.type === 'NETWORK_ERROR').length).toBe(3);
    });
  });

  describe('Health Metrics and Scoring', () => {
    beforeEach(() => {
      monitor['stats'] = {
        totalRequests: 1000,
        proxyRequests: 800,
        failedRequests: 50,
        retrySuccesses: 30,
        retryFailures: 20,
        avgProxyLatency: 800,
        zscalerErrors: []
      };
    });

    it('should calculate comprehensive health metrics', () => {
      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeCloseTo(0.84, 2);
      expect(metrics.latency).toBe(800);
      expect(metrics.successRate).toBe(0.95); // (1000-50)/1000
      expect(metrics.proxyUsage).toBe(0.8); // 800/1000
      expect(metrics.errorRate).toBe(0.05); // 50/1000
    });

    it('should maintain limited error history', () => {
      // Add more than the limit of errors
      for (let i = 0; i < 120; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`,
          requestUrl: 'https://example.com'
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(monitor['stats'].zscalerErrors.length).toBe(100); // Should maintain max length
      expect(metrics.recentErrors.length).toBe(10); // Should return only most recent
      expect(metrics.recentErrors[0].message).toBe('Error 110');
      expect(metrics.recentErrors[9].message).toBe('Error 119');
    });

    it('should handle edge cases in health calculations', () => {
      // Test with zero requests
      monitor['stats'] = {
        totalRequests: 0,
        proxyRequests: 0,
        failedRequests: 0,
        retrySuccesses: 0,
        retryFailures: 0,
        avgProxyLatency: 0,
        zscalerErrors: []
      };

      let metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);

      // Test with very high latency
      monitor['stats'].avgProxyLatency = 10000;
      metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBeLessThan(0.5);
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      mockChrome.proxy.settings.get.mockImplementation((_, callback) => {
        callback({ value: { rules: { proxyForHttp: { host: 'gateway.zscaler.net' } } } });
      });
      await monitor.startMonitoring();
    });

    it('should properly clean up on stop', () => {
      // Add some test data
      monitor['stats'].totalRequests = 10;
      monitor['requestTimes'].set('123', Date.now());
      monitor['retryAttempts'].set('123', 1);

      monitor.stopMonitoring();
      
      expect(mockChrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(false);
      expect(monitor['stats'].totalRequests).toBe(0);
      expect(monitor['requestTimes'].size).toBe(0);
      expect(monitor['retryAttempts'].size).toBe(0);
    });

    it('should handle cleanup with pending operations', async () => {
      // Simulate some pending operations
      const handlers = monitor['handlers'];
      
      handlers.onBeforeRequest({
        requestId: 'pending-1',
        url: 'https://example.com',
        timeStamp: Date.now()
      });

      handlers.onErrorOccurred({
        requestId: 'pending-2',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        timeStamp: Date.now()
      });

      monitor.stopMonitoring();

      // Verify cleanup happened correctly
      expect(monitor['retryAttempts'].size).toBe(0);
      expect(monitor['requestTimes'].size).toBe(0);
      expect(monitor['stats'].totalRequests).toBe(0);
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let defaultConfig: NetworkMonitorConfig;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeAll(() => {
    // Mock Chrome APIs
    global.chrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onBeforeSendHeaders: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onCompleted: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onErrorOccurred: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: vi.fn(),
            removeListener: vi.fn()
          },
          get: vi.fn()
        }
      },
      tabs: {
        reload: vi.fn()
      },
      runtime: {
        sendMessage: vi.fn()
      },
      debugger: {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(),
        onEvent: {
          addListener: vi.fn()
        }
      }
    } as any;

    // Mock Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);

    // Silence console output during tests
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  beforeEach(() => {
    defaultConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        retryableErrors: ['proxy connection failed', 'net::ERR_PROXY_CONNECTION_FAILED']
      },
      latencyThresholds: {
        warning: 1000,
        critical: 5000
      },
      zscalerDomains: ['zscaler.net', 'zscalerone.net', 'zscalertwo.net']
    };

    monitor = new NetworkMonitor(defaultConfig);
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup default proxy settings mock
    chrome.proxy.settings.get.mockImplementation((opts, callback) => {
      callback({
        value: {
          rules: {
            proxyForHttp: { host: 'gateway.zscaler.net', port: 443 }
          }
        }
      });
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.clearAllTimers();
  });

  afterAll(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    vi.useRealTimers();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
      expect(defaultMonitor['config'].retryConfig.maxRetries).toBeGreaterThan(0);
      expect(defaultMonitor['config'].zscalerDomains).toContain('zscaler.net');
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        },
        zscalerDomains: ['custom.zscaler.net']
      };
      
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.backoffMs).toBe(defaultConfig.retryConfig.backoffMs);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
      expect(customMonitor['config'].zscalerDomains).toContain('custom.zscaler.net');
    });

    it('should handle invalid config values gracefully', () => {
      const invalidConfig = {
        retryConfig: {
          maxRetries: -1,
          backoffMs: -100
        }
      };

      const monitor = new NetworkMonitor(invalidConfig);
      expect(monitor['config'].retryConfig.maxRetries).toBeGreaterThan(0);
      expect(monitor['config'].retryConfig.backoffMs).toBeGreaterThan(0);
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring with proper listeners', async () => {
      await monitor.startMonitoring();
      
      expect(chrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(chrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(true);
    });

    it('should handle proxy settings errors', async () => {
      chrome.proxy.settings.get.mockImplementation((config, callback) => {
        throw new Error('Proxy settings unavailable');
      });

      await expect(monitor.startMonitoring()).rejects.toThrow('Proxy settings unavailable');
      expect(console.error).toHaveBeenCalled();
    });

    it('should prevent multiple monitoring starts', async () => {
      await monitor.startMonitoring();
      await monitor.startMonitoring();

      expect(chrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalledTimes(1);
    });

    it('should stop monitoring and cleanup properly', async () => {
      await monitor.startMonitoring();
      
      // Add some test data
      monitor['stats'].totalRequests = 10;
      monitor['requestTimes'].set('123', Date.now());
      monitor['retryAttempts'].set('123', 1);

      monitor.stopMonitoring();
      
      expect(chrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(false);
      expect(monitor['stats'].totalRequests).toBe(0);
      expect(monitor['requestTimes'].size).toBe(0);
      expect(monitor['retryAttempts'].size).toBe(0);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal and proxy requests separately', () => {
      const cases = [
        {
          url: 'https://example.com',
          isProxy: false
        },
        {
          url: 'https://gateway.zscaler.net/auth',
          isProxy: true
        },
        {
          url: 'https://example.com',
          initiator: 'https://zscaler.net',
          isProxy: true
        }
      ];

      cases.forEach(({ url, initiator, isProxy }, index) => {
        monitor['handleBeforeRequest']({
          requestId: `req-${index}`,
          url,
          initiator,
          timeStamp: Date.now()
        });
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.proxyRequests).toBe(2);
    });

    it('should handle mixed request traffic patterns', () => {
      // Success cases - simulate 8 successful requests
      for (let i = 0; i < 8; i++) {
        const startTime = 1000 + (i * 100);
        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime);
        
        monitor['handleBeforeRequest']({
          requestId: `success-${i}`,
          url: i < 6 ? 'https://gateway.zscaler.net/auth' : 'https://example.com',
          timeStamp: startTime
        });

        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime + 100);
        
        monitor['handleCompleted']({
          requestId: `success-${i}`,
          url: i < 6 ? 'https://gateway.zscaler.net/auth' : 'https://example.com',
          timeStamp: startTime + 100,
          statusCode: 200
        });
      }

      // Error cases - simulate 2 failed requests
      ['ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED'].forEach((error, i) => {
        monitor['handleError']({
          requestId: `error-${i}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          error: `net::${error}`
        });
      });

      const metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBeGreaterThan(0.7);
      expect(metrics.successRate).toBe(0.8);
      expect(metrics.proxyUsage).toBe(0.6);
      expect(metrics.errorRate).toBe(0.2);
      expect(metrics.latency).toBe(100);
    });

    it('should calculate latency metrics correctly', () => {
      const requestHandler = monitor['handleBeforeRequest'].bind(monitor);
      const responseHandler = monitor['handleCompleted'].bind(monitor);

      [100, 200, 300].forEach((latency, i) => {
        const startTime = 1000 + (i * 500);
        const requestId = `req-${i}`;

        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime);
        requestHandler({
          requestId,
          url: 'https://example.com',
          timeStamp: startTime
        });

        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime + latency);
        responseHandler({
          requestId,
          url: 'https://example.com',
          timeStamp: startTime + latency,
          statusCode: 200
        });
      });

      // With alpha = 0.2, EMA should be:
      // First: 100 * 0.2 = 20
      // Second: 20 * 0.8 + 200 * 0.2 = 52
      // Third: 52 * 0.8 + 300 * 0.2 = 101.6
      expect(monitor['stats'].avgProxyLatency).toBeCloseTo(101.6);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle exponential backoff for retries', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      };

      // First retry
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);
      vi.runOnlyPendingTimers();
      expect(chrome.tabs.reload).toHaveBeenCalledWith(1);
      
      // Second retry - should double the delay
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);
      vi.runOnlyPendingTimers();
      
      // Third retry - should double again
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(monitor['retryAttempts'].get('123')).toBe(3);
    });

    it('should handle various authentication errors', () => {
      const authErrorCases = [
        {
          statusCode: 407,
          headers: [{ name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }],
          expectedType: 'AUTH_ERROR'
        },
        {
          statusCode: 401,
          headers: [{ name: 'WWW-Authenticate', value: 'Bearer realm="Zscaler"' }],
          expectedType: 'AUTH_ERROR'
        },
        {
          statusCode: 403,
          headers: [{ name: 'X-Zscaler-Auth-Failed', value: 'true' }],
          expectedType: 'AUTH_ERROR'
        }
      ];

      authErrorCases.forEach((testCase, index) => {
        monitor['handleCompleted']({
          requestId: `auth-${index}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          statusCode: testCase.statusCode,
          statusLine: `HTTP/1.1 ${testCase.statusCode}`,
          responseHeaders: testCase.headers
        });

        expect(monitor['stats'].zscalerErrors[index].type).toBe(testCase.expectedType);
      });
    });

    it('should limit retry attempts', () => {
      const requestId = 'max-retries';
      const error = {
        requestId,
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      };

      // Exceed max retries
      for (let i = 0; i <= defaultConfig.retryConfig.maxRetries + 1; i++) {
        monitor['handleError'](error);
        vi.runAllTimers();
      }

      expect(monitor['retryAttempts'].get(requestId)).toBe(defaultConfig.retryConfig.maxRetries);
      expect(monitor['stats'].retryFailures).toBe(1);
    });
  });

  describe('Health Metrics', () => {
    it('should calculate comprehensive health metrics', () => {
      monitor['stats'] = {
        totalRequests: 1000,
        proxyRequests: 800,
        failedRequests: 50,
        retrySuccesses: 30,
        retryFailures: 20,
        avgProxyLatency: 800,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.95);
      expect(metrics.proxyUsage).toBe(0.8);
      expect(metrics.errorRate).toBe(0.05);
      expect(metrics.latency).toBe(800);
    });

    it('should handle edge cases in health calculations', () => {
      // Zero requests
      monitor['stats'] = {
        totalRequests: 0,
        proxyRequests: 0,
        failedRequests: 0,
        retrySuccesses: 0,
        retryFailures: 0,
        avgProxyLatency: 0,
        zscalerErrors: []
      };

      let metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);

      // Very high latency
      monitor['stats'].avgProxyLatency = 10000;
      metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBeLessThan(0.5);
    });

    it('should limit recent errors list', () => {
      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(metrics.recentErrors.length).toBe(10);
      expect(metrics.recentErrors[9].message).toBe('Error 14');
    });
  });

  describe('Cleanup', () => {
    it('should clear all internal state on cleanup', () => {
      monitor['stats'].totalRequests = 100;
      monitor['requestTimes'].set('123', 1000);
      monitor['retryAttempts'].set('123', 2);

      monitor['cleanup']();

      expect(monitor['stats'].totalRequests).toBe(0);
      expect(monitor['requestTimes'].size).toBe(0);
      expect(monitor['retryAttempts'].size).toBe(0);
      expect(monitor['stats'].zscalerErrors).toHaveLength(0);
    });

    it('should handle stopping monitoring when not started', () => {
      monitor['isMonitoring'] = false;
      monitor.stopMonitoring();
      expect(chrome.webRequest.onBeforeRequest.removeListener).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let defaultConfig: NetworkMonitorConfig;
  let mockChrome: {
    webRequest: {
      onBeforeRequest: { addListener: vi.Mock, removeListener: vi.Mock },
      onBeforeSendHeaders: { addListener: vi.Mock, removeListener: vi.Mock },
      onCompleted: { addListener: vi.Mock, removeListener: vi.Mock },
      onErrorOccurred: { addListener: vi.Mock, removeListener: vi.Mock }
    },
    proxy: {
      settings: {
        onChange: { addListener: vi.Mock, removeListener: vi.Mock },
        get: vi.Mock,
        clear: vi.Mock,
        set: vi.Mock
      }
    },
    tabs: {
      reload: vi.Mock,
      query: vi.Mock,
      update: vi.Mock
    },
    runtime: {
      sendMessage: vi.Mock,
      onMessage: { addListener: vi.Mock, removeListener: vi.Mock },
      lastError: null | Error
    },
    debugger: {
      attach: vi.Mock,
      detach: vi.Mock,
      sendCommand: vi.Mock,
      onEvent: { addListener: vi.Mock, removeListener: vi.Mock }
    }
  };

  beforeAll(() => {
    // Mock Chrome APIs
    mockChrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onBeforeSendHeaders: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onCompleted: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onErrorOccurred: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: vi.fn(),
            removeListener: vi.fn()
          },
          get: vi.fn(),
          clear: vi.fn(),
          set: vi.fn()
        }
      },
      tabs: {
        reload: vi.fn(),
        query: vi.fn(),
        update: vi.fn()
      },
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        lastError: null
      },
      debugger: {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(),
        onEvent: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      }
    };

    global.chrome = mockChrome as any;

    // Mock console methods
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset configuration
    defaultConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        retryableErrors: ['proxy connection failed', 'net::ERR_PROXY_CONNECTION_FAILED']
      },
      latencyThresholds: {
        warning: 1000,
        critical: 5000
      },
      zscalerDomains: ['zscaler.net', 'zscalerone.net', 'zscalertwo.net']
    };

    // Create fresh monitor instance
    monitor = new NetworkMonitor(defaultConfig);

    // Reset all mocks
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup default proxy settings mock
    mockChrome.proxy.settings.get.mockImplementation((opts, callback) => {
      callback({
        value: {
          rules: {
            proxyForHttp: { host: 'gateway.zscaler.net', port: 443 }
          }
        }
      });
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.clearAllTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default config when none provided', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
      expect(defaultMonitor['config'].retryConfig.maxRetries).toBeGreaterThan(0);
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        },
        zscalerDomains: ['custom.zscaler.net']
      };
      
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.backoffMs).toBe(defaultConfig.retryConfig.backoffMs);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
      expect(customMonitor['config'].zscalerDomains).toContain('custom.zscaler.net');
    });

    it('should setup Chrome API listeners on start', async () => {
      await monitor.startMonitoring();
      
      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] }
      );
      
      expect(mockChrome.webRequest.onCompleted.addListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );
      
      expect(mockChrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
    });

    it('should handle proxy settings error during startup', async () => {
      mockChrome.proxy.settings.get.mockImplementation((opts, callback) => {
        mockChrome.runtime.lastError = new Error('Access denied');
        callback({ value: null });
      });

      await expect(monitor.startMonitoring()).rejects.toThrow();
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'PROXY_ERROR'
          })
        })
      );
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal and proxy requests separately', () => {
      const cases = [
        {
          url: 'https://example.com',
          isProxy: false
        },
        {
          url: 'https://gateway.zscaler.net/auth',
          isProxy: true
        },
        {
          url: 'https://example.com',
          initiator: 'https://zscaler.net',
          isProxy: true
        }
      ];

      cases.forEach(({ url, initiator, isProxy }, index) => {
        monitor['handleBeforeRequest']({
          requestId: `req-${index}`,
          url,
          initiator,
          timeStamp: Date.now()
        });
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.proxyRequests).toBe(2);
    });

    it('should calculate request latency metrics', () => {
      const requestId = 'latency-1';
      const startTime = 1000;
      const endTime = 2500;

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      monitor['handleBeforeRequest']({ 
        requestId, 
        url: 'https://example.com',
        timeStamp: startTime
      });

      monitor['handleCompleted']({
        requestId,
        url: 'https://example.com',
        timeStamp: endTime
      });

      // EMA calculation: newValue * alpha + prevValue * (1 - alpha)
      // With alpha = 0.2: 1500 * 0.2 + 0 * 0.8 = 300
      expect(monitor['stats'].avgProxyLatency).toBe(300);
    });

    it('should detect high latency and trigger warnings', () => {
      monitor['updateLatencyStats'](6000); // Above critical threshold
      
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'LATENCY_ERROR',
            details: expect.objectContaining({
              latency: 6000,
              threshold: 5000
            })
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should implement exponential backoff for retries', () => {
      const details = {
        requestId: 'retry-1',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 42,
        timeStamp: Date.now()
      };

      // First retry
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);
      vi.runAllTimers();
      expect(mockChrome.tabs.reload).toHaveBeenCalledWith(42);

      // Second retry - delay should double
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);
      vi.runAllTimers();

      // Third retry - delay should double again
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000);

      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(monitor['retryAttempts'].get('retry-1')).toBe(3);
    });

    it('should handle authentication errors', () => {
      monitor['checkZscalerResponse']({
        requestId: 'auth-1',
        url: 'https://example.com',
        statusCode: 407,
        statusLine: 'HTTP/1.1 407 Proxy Authentication Required',
        responseHeaders: [
          { name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }
        ],
        timeStamp: Date.now()
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'AUTH_ERROR'
          })
        })
      );

      const stats = monitor.getStats();
      expect(stats.zscalerErrors[0].type).toBe('AUTH_ERROR');
    });

    it('should handle gateway errors', () => {
      monitor['checkZscalerResponse']({
        requestId: 'gateway-1',
        url: 'https://example.com',
        statusCode: 502,
        statusLine: 'HTTP/1.1 502 Bad Gateway',
        responseHeaders: [],
        timeStamp: Date.now()
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'GATEWAY_ERROR'
          })
        })
      );
    });

    it('should stop retrying after max attempts', () => {
      const details = {
        requestId: 'max-retry',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 42,
        timeStamp: Date.now()
      };

      // Exceed max retries
      for (let i = 0; i <= defaultConfig.retryConfig.maxRetries; i++) {
        monitor['handleError'](details);
        vi.runAllTimers();
      }

      const stats = monitor.getStats();
      expect(stats.retryFailures).toBe(1);
      expect(mockChrome.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'MAX_RETRIES_ERROR'
          })
        })
      );
    });
  });

  describe('Health Metrics', () => {
    it('should calculate comprehensive health metrics', () => {
      monitor['stats'] = {
        totalRequests: 1000,
        proxyRequests: 800,
        failedRequests: 50,
        retrySuccesses: 30,
        retryFailures: 20,
        avgProxyLatency: 800,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.95); // (1000-50)/1000
      expect(metrics.proxyUsage).toBe(0.8); // 800/1000
      expect(metrics.errorRate).toBe(0.05); // 50/1000
      expect(metrics.latency).toBe(800);
    });

    it('should handle edge cases in health calculations', () => {
      // Zero requests
      monitor['stats'] = {
        totalRequests: 0,
        proxyRequests: 0,
        failedRequests: 0,
        retrySuccesses: 0,
        retryFailures: 0,
        avgProxyLatency: 0,
        zscalerErrors: []
      };

      let metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);

      // Very high latency
      monitor['stats'].avgProxyLatency = 10000;
      metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBeLessThan(0.5);
    });
  });

  describe('Configuration Changes', () => {
    it('should detect proxy configuration removal', () => {
      monitor['handleProxySettingsChange']({ 
        value: {
          rules: {}
        }
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ZSCALER_ERROR',
          error: expect.objectContaining({
            type: 'CONFIG_ERROR'
          })
        })
      );
    });

    it('should validate Zscaler domains in proxy config', () => {
      expect(monitor['isZscalerProxyConfig']({
        rules: {
          proxyForHttp: { host: 'gateway.zscaler.net' }
        }
      })).toBe(true);

      expect(monitor['isZscalerProxyConfig']({
        rules: {
          proxyForHttp: { host: 'malicious.proxy.com' }
        }
      })).toBe(false);
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let defaultConfig: NetworkMonitorConfig;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeAll(() => {
    // Mock Chrome APIs
    global.chrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onBeforeSendHeaders: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onCompleted: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        onErrorOccurred: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: vi.fn(),
            removeListener: vi.fn()
          },
          get: vi.fn()
        }
      },
      tabs: {
        reload: vi.fn()
      },
      runtime: {
        sendMessage: vi.fn()
      },
      debugger: {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(),
        onEvent: {
          addListener: vi.fn()
        }
      }
    } as any;

    // Mock Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);

    // Silence console output during tests
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  beforeEach(() => {
    defaultConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 1000,
        critical: 5000
      },
      zscalerDomains: ['zscaler.net']
    };

    monitor = new NetworkMonitor(defaultConfig);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.clearAllTimers();
  });

  afterAll(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        }
      };
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
    });

    it('should handle initialization errors gracefully', async () => {
      chrome.proxy.settings.get.mockImplementation(() => {
        throw new Error('Proxy settings unavailable');
      });

      await expect(monitor.startMonitoring()).rejects.toThrow('Proxy settings unavailable');
      expect(console.error).toHaveBeenCalled();
    });

    it('should set up listeners with correct options', async () => {
      await monitor.startMonitoring();

      // Verify correct listener setup
      ['onBeforeRequest', 'onBeforeSendHeaders', 'onCompleted', 'onErrorOccurred'].forEach(event => {
        expect(chrome.webRequest[event].addListener).toHaveBeenCalled();
      });
      expect(chrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
      expect(chrome.debugger.attach).toHaveBeenCalled();
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal requests', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      };

      monitor['handleBeforeRequest'](details);
      
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(0);
    });

    it('should identify Zscaler requests by domain', () => {
      const details = {
        requestId: '123',
        url: 'https://gateway.zscaler.net/auth',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      };

      monitor['handleBeforeRequest'](details);
      
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(1);
    });

    it('should identify Zscaler requests by headers', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        requestHeaders: [
          { name: 'X-Zscaler-Auth', value: 'token' }
        ]
      };

      monitor['handleBeforeSendHeaders'](details);
      expect(monitor['stats'].proxyRequests).toBe(1);
    });

    it('should handle various Zscaler authentication headers', () => {
      const headerCases = [
        { name: 'X-Zscaler-Auth', value: 'token' },
        { name: 'X-Zscaler-Session', value: 'session' },
        { name: 'proxy-authenticate', value: 'Basic' },
        { name: 'WWW-Authenticate', value: 'Bearer realm="Zscaler"' }
      ];
      
      headerCases.forEach((header, index) => {
        monitor['handleBeforeSendHeaders']({
          requestId: `req-${index}`,
          url: 'https://example.com',
          requestHeaders: [header]
        });

        expect(monitor['stats'].proxyRequests).toBe(index + 1);
      });
    });

    it('should track request latency', () => {
      const startTime = 1000;
      const endTime = 2000;

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      monitor['handleBeforeRequest']({ requestId: '123', url: 'https://example.com' });
      monitor['handleCompleted']({ requestId: '123', url: 'https://example.com' });

      expect(monitor['stats'].avgProxyLatency).toBe(200); // Due to 0.2 alpha
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle proxy errors with retry', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      };

      monitor['handleError'](details);
      
      expect(setTimeout).toHaveBeenCalled();
      vi.runAllTimers();

      expect(chrome.tabs.reload).toHaveBeenCalledWith(1);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(1);
      expect(monitor['retryAttempts'].get('123')).toBe(1);
    });

    it('should implement exponential backoff for retries', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      };

      // First retry
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);
      vi.runAllTimers();
      
      // Second retry - should double the delay
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);
      vi.runAllTimers();
      
      // Third retry - should double again
      monitor['handleError'](details);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(monitor['retryAttempts'].get('123')).toBe(3);
    });

    it('should handle authentication errors', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        statusCode: 407,
        statusLine: 'HTTP/1.1 407 Proxy Authentication Required',
        responseHeaders: [
          { name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }
        ]
      };

      monitor['checkZscalerResponse'](details);
      
      const stats = monitor.getStats();
      expect(stats.zscalerErrors.length).toBe(1);
      expect(stats.zscalerErrors[0].type).toBe('AUTH_ERROR');
    });

    it('should handle gateway errors', () => {
      const details = {
        requestId: '123',
        statusCode: 502,
        url: 'https://example.com',
        responseHeaders: []
      };

      monitor['checkZscalerResponse'](details);
      expect(monitor['stats'].zscalerErrors[0].type).toBe('GATEWAY_ERROR');
    });
  });

  describe('Health Metrics', () => {
    it('should calculate health metrics correctly', () => {
      monitor['stats'] = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 10,
        retrySuccesses: 5,
        retryFailures: 5,
        avgProxyLatency: 1000,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.9);
      expect(metrics.proxyUsage).toBe(0.8);
      expect(metrics.errorRate).toBe(0.1);
      expect(metrics.latency).toBe(1000);
    });

    it('should handle high latency correctly', () => {
      monitor['updateLatencyStats'](6000); // Above critical threshold
      expect(monitor['stats'].zscalerErrors[0].type).toBe('LATENCY_ERROR');
      expect(monitor['stats'].zscalerErrors[0].details.threshold).toBe(5000);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should limit recent errors list', () => {
      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(metrics.recentErrors.length).toBe(10);
      expect(metrics.recentErrors[9].message).toBe('Error 14');
    });
  });

  describe('Configuration Changes', () => {
    it('should detect proxy config removal', () => {
      monitor['handleProxySettingsChange']({ rules: {} } as any);
      
      expect(monitor['stats'].zscalerErrors[0].type).toBe('CONFIG_ERROR');
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should validate Zscaler domains in config', () => {
      const validConfig = { 
        rules: { 
          proxyForHttp: { host: 'gateway.zscaler.net' } 
        } 
      };
      
      expect(monitor['isZscalerProxyConfig'](validConfig as any)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear all internal state on cleanup', () => {
      monitor['stats'].totalRequests = 100;
      monitor['requestTimes'].set('123', 1000);
      monitor['retryAttempts'].set('123', 2);

      monitor['cleanup']();

      expect(monitor['stats'].totalRequests).toBe(0);
      expect(monitor['requestTimes'].size).toBe(0);
      expect(monitor['retryAttempts'].size).toBe(0);
      expect(monitor['stats'].zscalerErrors).toHaveLength(0);
    });

    it('should handle stopping monitoring when not started', () => {
      monitor['isMonitoring'] = false;
      monitor.stopMonitoring();
      expect(chrome.webRequest.onBeforeRequest.removeListener).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let defaultConfig: NetworkMonitorConfig;

  beforeAll(() => {
    // Mock Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => 1000);
  });

  beforeEach(() => {
    defaultConfig = {
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

    monitor = new NetworkMonitor(defaultConfig);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        }
      };
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring successfully', async () => {
      chrome.proxy.settings.get.mockImplementation((config, callback) => {
        callback({ value: { rules: { zscaler: true } } });
      });

      await monitor.startMonitoring();
      
      expect(chrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(chrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(true);
    });

    it('should warn if Zscaler proxy not detected', async () => {
      chrome.proxy.settings.get.mockImplementation((config, callback) => {
        callback({ value: { rules: {} } });
      });
      
      const consoleSpy = vi.spyOn(console, 'warn');
      await monitor.startMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Zscaler proxy'));
    });

    it('should stop monitoring and cleanup', async () => {
      await monitor.startMonitoring();
      monitor.stopMonitoring();
      
      expect(chrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(chrome.webRequest.onCompleted.removeListener).toHaveBeenCalled();
      expect(chrome.webRequest.onErrorOccurred.removeListener).toHaveBeenCalled();
      expect(chrome.proxy.settings.onChange.removeListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(false);
      expect(monitor['stats'].totalRequests).toBe(0);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal requests', () => {
      const requestHandler = chrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(0);
    });

    it('should identify Zscaler requests by domain', () => {
      const requestHandler = chrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://gateway.zscaler.net/example',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(1);
    });

    it('should track request latency', () => {
      const requestHandler = chrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      const responseHandler = chrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      const startTime = 1000;
      const endTime = 2000;

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: startTime
      });

      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: endTime,
        statusCode: 200,
        statusLine: 'HTTP/1.1 200 OK'
      });

      const stats = monitor.getStats();
      expect(stats.avgProxyLatency).toBe(200); // Due to 0.2 alpha
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle proxy errors with retry', () => {
      const errorHandler = chrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenCalled();
      vi.runAllTimers();

      expect(chrome.tabs.reload).toHaveBeenCalledWith(1);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(1);
      expect(monitor['retryAttempts'].get('123')).toBe(1);
    });

    it('should handle retry exhaustion', () => {
      const errorHandler = chrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      // Simulate max retries
      monitor['retryAttempts'].set('123', defaultConfig.retryConfig.maxRetries);
      
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED'
      });

      const stats = monitor.getStats();
      expect(stats.retryFailures).toBe(1);
      expect(stats.zscalerErrors.length).toBe(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should handle authentication errors', () => {
      const responseHandler = chrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        statusCode: 407,
        statusLine: 'HTTP/1.1 407 Proxy Authentication Required',
        responseHeaders: [
          { name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }
        ]
      });

      const stats = monitor.getStats();
      expect(stats.zscalerErrors.length).toBe(1);
      expect(stats.zscalerErrors[0].type).toBe('AUTH_ERROR');
    });
  });

  describe('Health Metrics', () => {
    it('should calculate health metrics correctly', () => {
      monitor['stats'] = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 10,
        retrySuccesses: 5,
        retryFailures: 5,
        avgProxyLatency: 1000,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.9);
      expect(metrics.proxyUsage).toBe(0.8);
      expect(metrics.errorRate).toBe(0.1);
      expect(metrics.latency).toBe(1000);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should limit recent errors list', () => {
      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(metrics.recentErrors.length).toBe(10);
      expect(metrics.recentErrors[9].message).toBe('Error 14');
    });
  });

  describe('Configuration Changes', () => {
    it('should detect proxy config removal', () => {
      monitor['handleProxySettingsChange']({ rules: {} } as any);
      
      expect(monitor['stats'].zscalerErrors[0].type).toBe('CONFIG_ERROR');
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should validate Zscaler domains in config', () => {
      const validConfig = { 
        rules: { 
          proxyForHttp: { host: 'gateway.zscaler.net' } 
        } 
      };
      
      expect(monitor['isZscalerProxyConfig'](validConfig as any)).toBe(true);
    });
  });
  describe('Extended Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle various Zscaler authentication headers', () => {
      const requestHandler = chrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      const headerCases = [
        { name: 'X-Zscaler-Auth', value: 'token' },
        { name: 'X-Zscaler-Session', value: 'session' },
        { name: 'proxy-authenticate', value: 'Basic' },
        { name: 'WWW-Authenticate', value: 'Bearer realm="Zscaler"' }
      ];
      
      headerCases.forEach((header, index) => {
        requestHandler({
          requestId: `req-${index}`,
          url: 'https://example.com',
          requestHeaders: [header]
        });

        const stats = monitor.getStats();
        expect(stats.proxyRequests).toBe(index + 1);
      });
    });

    it('should handle mixed request traffic patterns', () => {
      const requestHandler = chrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      const responseHandler = chrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      const errorHandler = chrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];

      // Success cases - simulate 8 successful requests
      for (let i = 0; i < 8; i++) {
        const startTime = 1000 + (i * 100);
        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime);
        
        requestHandler({
          requestId: `success-${i}`,
          url: i < 6 ? 'https://gateway.zscaler.net/auth' : 'https://example.com',
          timeStamp: startTime
        });

        vi.spyOn(Date, 'now').mockReturnValueOnce(startTime + 100);
        
        responseHandler({
          requestId: `success-${i}`,
          url: i < 6 ? 'https://gateway.zscaler.net/auth' : 'https://example.com',
          timeStamp: startTime + 100,
          statusCode: 200
        });
      }

      // Error cases - simulate 2 failed requests
      ['ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED'].forEach((error, i) => {
        errorHandler({
          requestId: `error-${i}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          error: `net::${error}`
        });
      });

      const metrics = monitor.getHealthMetrics();
      expect(metrics.healthScore).toBeGreaterThan(0.7); // Good overall health
      expect(metrics.successRate).toBe(0.8); // 8 success out of 10 total
      expect(metrics.proxyUsage).toBe(0.6); // 6 proxy requests out of 10
      expect(metrics.errorRate).toBe(0.2); // 2 failures out of 10
      expect(metrics.latency).toBe(100); // Consistent 100ms latency
    });
  });

  describe('Extended Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle exponential backoff for retries', () => {
      const errorHandler = chrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      // First retry
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 100);
      vi.runOnlyPendingTimers();
      
      // Second retry - should double the delay
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 200);
      vi.runOnlyPendingTimers();
      
      // Third retry - should double again
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 400);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(3);
      expect(monitor['retryAttempts'].get('123')).toBe(3);
    });

    it('should handle various authentication error scenarios', () => {
      const responseHandler = chrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      const authErrorCases = [
        {
          statusCode: 407,
          headers: [{ name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }],
          expectedType: 'AUTH_ERROR'
        },
        {
          statusCode: 401,
          headers: [{ name: 'WWW-Authenticate', value: 'Bearer realm="Zscaler"' }],
          expectedType: 'AUTH_ERROR'
        },
        {
          statusCode: 403,
          headers: [{ name: 'X-Zscaler-Auth-Failed', value: 'true' }],
          expectedType: 'AUTH_ERROR'
        }
      ];

      authErrorCases.forEach((testCase, index) => {
        responseHandler({
          requestId: `auth-${index}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          statusCode: testCase.statusCode,
          statusLine: `HTTP/1.1 ${testCase.statusCode}`,
          responseHeaders: testCase.headers
        });

        const stats = monitor.getStats();
        expect(stats.zscalerErrors[index].type).toBe(testCase.expectedType);
      });
    });
  });
});

import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let mockChrome: any;
  let defaultConfig: NetworkMonitorConfig;

  beforeAll(() => {
    // Mock Date.now
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);
  });

  beforeEach(() => {
    // Setup mock Chrome API
    mockChrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        },
        onCompleted: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        },
        onErrorOccurred: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: jest.fn(),
            removeListener: jest.fn()
          },
          get: jest.fn()
        }
      },
      runtime: {
        sendMessage: jest.fn(),
        lastError: null
      },
      tabs: {
        reload: jest.fn()
      }
    };

    global.chrome = mockChrome;

    defaultConfig = {
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

    monitor = new NetworkMonitor(defaultConfig);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        }
      };
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring successfully', async () => {
      mockChrome.proxy.settings.get.mockImplementation((config, callback) => {
        callback({ value: { rules: { zscaler: true } } });
      });

      await monitor.startMonitoring();
      
      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(mockChrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(true);
    });

    it('should warn if Zscaler proxy not detected', async () => {
      mockChrome.proxy.settings.get.mockImplementation((config, callback) => {
        callback({ value: { rules: {} } });
      });
      
      const consoleSpy = jest.spyOn(console, 'warn');
      await monitor.startMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Zscaler proxy'));
    });

    it('should stop monitoring and cleanup', async () => {
      await monitor.startMonitoring();
      monitor.stopMonitoring();
      
      expect(mockChrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onErrorOccurred.removeListener).toHaveBeenCalled();
      expect(mockChrome.proxy.settings.onChange.removeListener).toHaveBeenCalled();
      expect(monitor['isMonitoring']).toBe(false);
      expect(monitor['stats'].totalRequests).toBe(0);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal requests', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(0);
    });

    it('should identify Zscaler requests by domain', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://gateway.zscaler.net/example',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(1);
    });

    it('should identify Zscaler requests by headers', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        requestHeaders: [
          { name: 'X-Zscaler-Auth', value: 'token' }
        ]
      });

      const stats = monitor.getStats();
      expect(stats.proxyRequests).toBe(1);
    });

    it('should track request latency', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      const responseHandler = mockChrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      const startTime = 1000;
      const endTime = 2000;

      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: startTime
      });

      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: endTime,
        statusCode: 200,
        statusLine: 'HTTP/1.1 200 OK'
      });

      const stats = monitor.getStats();
      expect(stats.avgProxyLatency).toBe(200); // Due to 0.2 alpha
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should handle proxy errors with retry', () => {
      const errorHandler = mockChrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenCalled();
      jest.runAllTimers();

      expect(mockChrome.tabs.reload).toHaveBeenCalledWith(1);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(1);
      expect(monitor['retryAttempts'].get('123')).toBe(1);
    });

    it('should handle retry exhaustion', () => {
      const errorHandler = mockChrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      // Simulate max retries
      monitor['retryAttempts'].set('123', defaultConfig.retryConfig.maxRetries);
      
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED'
      });

      const stats = monitor.getStats();
      expect(stats.retryFailures).toBe(1);
      expect(stats.zscalerErrors.length).toBe(1);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should handle authentication errors', () => {
      const responseHandler = mockChrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        statusCode: 407,
        statusLine: 'HTTP/1.1 407 Proxy Authentication Required',
        responseHeaders: [
          { name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }
        ]
      });

      const stats = monitor.getStats();
      expect(stats.zscalerErrors.length).toBe(1);
      expect(stats.zscalerErrors[0].type).toBe('AUTH_ERROR');
    });
  });

  describe('Health Metrics', () => {
    it('should calculate health metrics correctly', () => {
      // Setup test data
      monitor['stats'] = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 10,
        retrySuccesses: 5,
        retryFailures: 5,
        avgProxyLatency: 1000,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.9);
      expect(metrics.proxyUsage).toBe(0.8);
      expect(metrics.errorRate).toBe(0.1);
      expect(metrics.latency).toBe(1000);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should limit recent errors list', () => {
      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(metrics.recentErrors.length).toBe(10);
      expect(metrics.recentErrors[9].message).toBe('Error 14');
    });
  });

  describe('Configuration Changes', () => {
    it('should detect proxy config removal', () => {
      monitor['handleProxySettingsChange']({ rules: {} } as any);
      
      expect(monitor['stats'].zscalerErrors[0].type).toBe('CONFIG_ERROR');
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should validate Zscaler domains in config', () => {
      const validConfig = { 
        rules: { 
          proxyForHttp: { host: 'gateway.zscaler.net' } 
        } 
      };
      
      expect(monitor['isZscalerProxyConfig'](validConfig as any)).toBe(true);
    });
  });
});

import { NetworkMonitor } from '../NetworkMonitor';
import { NetworkMonitorConfig } from '@/types/network';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let mockChrome: any;

  beforeEach(() => {
    // Setup mock Chrome API
    mockChrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        },
        onCompleted: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        },
        onErrorOccurred: {
          addListener: jest.fn(),
          removeListener: jest.fn()
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            get: jest.fn()
          }
        }
      },
      runtime: {
        sendMessage: jest.fn(),
        lastError: null
      },
      tabs: {
        reload: jest.fn()
      }
    };

    global.chrome = mockChrome;
    
    const config: Partial<NetworkMonitorConfig> = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 100,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 500,
        critical: 1000
      }
    };

    monitor = new NetworkMonitor(config);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Monitoring lifecycle', () => {
    test('should start monitoring and setup listeners', async () => {
      await monitor.startMonitoring();

      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(mockChrome.proxy.settings.onChange.addListener).toHaveBeenCalled();
    });

    test('should stop monitoring and remove listeners', () => {
      monitor.stopMonitoring();

      expect(mockChrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onErrorOccurred.removeListener).toHaveBeenCalled();
      expect(mockChrome.proxy.settings.onChange.removeListener).toHaveBeenCalled();
    });
  });

  describe('Request handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    test('should track normal requests', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(0);
    });

    test('should identify Zscaler requests', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      
      requestHandler({
        requestId: '123',
        url: 'https://gateway.zscaler.net/example',
        method: 'GET',
        frameId: 0,
        parentFrameId: -1,
        tabId: 1,
        type: 'main_frame',
        timeStamp: Date.now()
      });

      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.proxyRequests).toBe(1);
    });

    test('should track request latency', () => {
      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      const responseHandler = mockChrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      // Simulate request start
      requestHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now()
      });

      // Advance timer by 500ms
      jest.advanceTimersByTime(500);

      // Simulate response
      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        statusCode: 200,
        statusLine: 'HTTP/1.1 200 OK'
      });

      const stats = monitor.getStats();
      expect(stats.avgProxyLatency).toBeGreaterThan(0);
    });

    test('should handle proxy errors and retry', () => {
      const errorHandler = mockChrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];
      
      errorHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1
      });

      expect(setTimeout).toHaveBeenCalled();
      jest.runAllTimers();

      expect(mockChrome.tabs.reload).toHaveBeenCalledWith(1);
      
      const stats = monitor.getStats();
      expect(stats.failedRequests).toBe(1);
      expect(stats.zscalerErrors.length).toBe(0); // No error recorded yet until max retries
    });

    test('should detect proxy authentication errors', () => {
      const responseHandler = mockChrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      
      responseHandler({
        requestId: '123',
        url: 'https://example.com',
        timeStamp: Date.now(),
        statusCode: 407,
        statusLine: 'HTTP/1.1 407 Proxy Authentication Required',
        responseHeaders: [
          { name: 'Proxy-Authenticate', value: 'Basic realm="Zscaler"' }
        ]
      });

      const stats = monitor.getStats();
      expect(stats.zscalerErrors.length).toBe(1);
      expect(stats.zscalerErrors[0].type).toBe('AUTH_ERROR');
    });
  });

  describe('Health metrics', () => {
    test('should calculate correct health score', async () => {
      await monitor.startMonitoring();

      const requestHandler = mockChrome.webRequest.onBeforeRequest.addListener.mock.calls[0][0];
      const responseHandler = mockChrome.webRequest.onCompleted.addListener.mock.calls[0][0];
      const errorHandler = mockChrome.webRequest.onErrorOccurred.addListener.mock.calls[0][0];

      // Simulate successful requests
      for (let i = 0; i < 10; i++) {
        requestHandler({
          requestId: `success-${i}`,
          url: 'https://example.com',
          timeStamp: Date.now()
        });

        jest.advanceTimersByTime(100); // 100ms latency

        responseHandler({
          requestId: `success-${i}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          statusCode: 200
        });
      }

      // Simulate failed requests
      for (let i = 0; i < 2; i++) {
        errorHandler({
          requestId: `error-${i}`,
          url: 'https://example.com',
          timeStamp: Date.now(),
          error: 'net::ERR_PROXY_CONNECTION_FAILED'
        });
      }

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeGreaterThan(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBe(0.833); // 10 success out of 12 total
      expect(metrics.errorRate).toBe(0.167); // 2 failures out of 12 total
    });
  });
});

import { NetworkMonitor } from '../NetworkMonitor';
import type { NetworkMonitorConfig, ZscalerError } from '@/types/network';

// Mock Chrome APIs
const mockAddListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockSendMessage = jest.fn();
const mockGetSettings = jest.fn();
const mockReloadTab = jest.fn();

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let defaultConfig: NetworkMonitorConfig;

  beforeAll(() => {
    // Mock Chrome APIs
    global.chrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener
        },
        onCompleted: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener
        },
        onErrorOccurred: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener
        }
      },
      proxy: {
        settings: {
          onChange: {
            addListener: mockAddListener,
            removeListener: mockRemoveListener
          },
          get: mockGetSettings
        }
      },
      tabs: {
        reload: mockReloadTab
      },
      runtime: {
        sendMessage: mockSendMessage
      }
    } as any;

    // Mock Date.now
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);
  });

  beforeEach(() => {
    defaultConfig = {
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        retryableErrors: ['proxy connection failed']
      },
      latencyThresholds: {
        warning: 1000,
        critical: 5000
      },
      zscalerDomains: ['zscaler.net']
    };

    monitor = new NetworkMonitor(defaultConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new NetworkMonitor();
      expect(defaultMonitor).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        retryConfig: {
          maxRetries: 5,
          retryableErrors: ['custom error']
        }
      };
      const customMonitor = new NetworkMonitor(customConfig);
      
      expect(customMonitor['config'].retryConfig.maxRetries).toBe(5);
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('custom error');
      expect(customMonitor['config'].retryConfig.retryableErrors).toContain('proxy connection failed');
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring successfully', async () => {
      mockGetSettings.mockImplementation((config, callback) => {
        callback({ value: { rules: { zscaler: true } } });
      });

      await monitor.startMonitoring();
      
      expect(mockAddListener).toHaveBeenCalledTimes(4);
      expect(monitor['isMonitoring']).toBe(true);
    });

    it('should warn if Zscaler proxy not detected', async () => {
      mockGetSettings.mockImplementation((config, callback) => {
        callback({ value: { rules: {} } });
      });
      
      const consoleSpy = jest.spyOn(console, 'warn');
      await monitor.startMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith('Zscaler proxy not detected in initial configuration');
    });

    it('should stop monitoring and cleanup', () => {
      monitor['isMonitoring'] = true;
      monitor.stopMonitoring();
      
      expect(mockRemoveListener).toHaveBeenCalledTimes(4);
      expect(monitor['isMonitoring']).toBe(false);
      expect(monitor['stats'].totalRequests).toBe(0);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track normal requests', () => {
      const request = {
        requestId: '123',
        url: 'https://example.com',
        requestHeaders: []
      };

      monitor['handleBeforeRequest'](request as any);
      
      expect(monitor['stats'].totalRequests).toBe(1);
      expect(monitor['stats'].proxyRequests).toBe(0);
    });

    it('should identify Zscaler requests by domain', () => {
      const request = {
        requestId: '123',
        url: 'https://gateway.zscaler.net/auth',
        requestHeaders: []
      };

      monitor['handleBeforeRequest'](request as any);
      
      expect(monitor['stats'].proxyRequests).toBe(1);
    });

    it('should identify Zscaler requests by headers', () => {
      const request = {
        requestId: '123',
        url: 'https://example.com',
        requestHeaders: [
          { name: 'X-Zscaler-Auth', value: 'token' }
        ]
      };

      monitor['handleBeforeRequest'](request as any);
      
      expect(monitor['stats'].proxyRequests).toBe(1);
    });

    it('should track request latency', () => {
      const requestId = '123';
      const startTime = 1000;
      const endTime = 2000;

      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      monitor['handleBeforeRequest']({ requestId } as any);
      monitor['handleCompleted']({ 
        requestId,
        responseHeaders: []
      } as any);

      expect(monitor['stats'].avgProxyLatency).toBe(200); // Due to 0.2 alpha
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
      jest.useFakeTimers();
    });

    it('should handle proxy errors with retry', () => {
      const details = {
        requestId: '123',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: 1,
        url: 'https://example.com'
      };

      monitor['handleError'](details as any);
      
      expect(monitor['stats'].failedRequests).toBe(1);
      expect(monitor['retryAttempts'].get('123')).toBe(1);
      
      jest.runAllTimers();
      expect(mockReloadTab).toHaveBeenCalledWith(1);
    });

    it('should handle retry exhaustion', () => {
      const details = {
        requestId: '123',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        url: 'https://example.com'
      };

      // Simulate max retries
      monitor['retryAttempts'].set('123', defaultConfig.retryConfig.maxRetries);
      monitor['handleError'](details as any);
      
      expect(monitor['stats'].retryFailures).toBe(1);
      expect(monitor['stats'].zscalerErrors.length).toBe(1);
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should track authentication errors', () => {
      const details = {
        requestId: '123',
        statusCode: 407,
        url: 'https://example.com',
        responseHeaders: [
          { name: 'proxy-authenticate', value: 'Basic' }
        ]
      };

      monitor['checkZscalerResponse'](details as any);
      
      expect(monitor['stats'].zscalerErrors[0].type).toBe('AUTH_ERROR');
    });
  });

  describe('Health Metrics', () => {
    it('should calculate health score components correctly', () => {
      monitor['stats'] = {
        totalRequests: 100,
        proxyRequests: 80,
        failedRequests: 10,
        retrySuccesses: 5,
        retryFailures: 5,
        avgProxyLatency: 1000,
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBeDefined();
      expect(metrics.successRate).toBe(0.9);
      expect(metrics.proxyUsage).toBe(0.8);
      expect(metrics.errorRate).toBe(0.1);
      expect(metrics.latency).toBe(1000);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = monitor.getHealthMetrics();
      
      expect(metrics.healthScore).toBe(1);
      expect(metrics.successRate).toBe(1);
      expect(metrics.proxyUsage).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should limit recent errors list', () => {
      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        monitor['handleZscalerError']({
          timestamp: Date.now(),
          type: 'PROXY_ERROR',
          message: `Error ${i}`
        });
      }

      const metrics = monitor.getHealthMetrics();
      expect(metrics.recentErrors.length).toBe(10);
      expect(metrics.recentErrors[9].message).toBe('Error 14');
    });
  });

  describe('Configuration Changes', () => {
    it('should detect proxy config removal', () => {
      const config = { rules: {} };
      
      monitor['handleProxySettingsChange'](config as any);
      
      expect(monitor['stats'].zscalerErrors[0].type).toBe('CONFIG_ERROR');
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should validate Zscaler domains in config', () => {
      const validConfig = { 
        rules: { 
          proxyForHttp: { host: 'gateway.zscaler.net' } 
        } 
      };
      
      const isValid = monitor['isZscalerProxyConfig'](validConfig as any);
      expect(isValid).toBe(true);
    });
  });
});

