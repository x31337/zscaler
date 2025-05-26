import { NetworkMonitor } from './NetworkMonitor';
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
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeAll(() => {
    // Mock Chrome APIs
    global.chrome = {
      webRequest: {
        onBeforeRequest: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener
        },
        onBeforeSendHeaders: {
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

    // Silence console output during tests
    console.warn = jest.fn();
    console.error = jest.fn();
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
    jest.clearAllTimers();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    jest.clearAllTimers();
  });

  afterAll(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe('Initialization', () => {
    it('should handle initialization errors gracefully', async () => {
      mockGetSettings.mockImplementation(() => {
        throw new Error('Proxy settings unavailable');
      });

      await expect(monitor.startMonitoring()).rejects.toThrow('Proxy settings unavailable');
      expect(console.error).toHaveBeenCalled();
    });

    it('should set up listeners with correct options', async () => {
      await monitor.startMonitoring();

      // Check onBeforeRequest options
      expect(mockAddListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['extraHeaders']
      );

      // Check onBeforeSendHeaders options
      expect(mockAddListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['requestHeaders', 'extraHeaders']
      );

      // Check onCompleted options
      expect(mockAddListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['responseHeaders', 'extraHeaders']
      );
    });
  });

  describe('Request Header Handling', () => {
    beforeEach(async () => {
      await monitor.startMonitoring();
    });

    it('should track proxy headers in onBeforeSendHeaders', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com',
        requestHeaders: [
          { name: 'Proxy-Authorization', value: 'Basic xyz' },
          { name: 'X-Forwarded-For', value: '1.2.3.4' }
        ]
      };

      monitor['handleBeforeSendHeaders'](details as any);
      expect(monitor['stats'].proxyRequests).toBe(1);
    });

    it('should handle missing request headers', () => {
      const details = {
        requestId: '123',
        url: 'https://example.com'
      };

      monitor['handleBeforeSendHeaders'](details as any);
      expect(monitor['stats'].proxyRequests).toBe(0);
    });

    it('should not double count proxy requests', () => {
      const details = {
        requestId: '123',
        url: 'https://zscaler.net',
        requestHeaders: [
          { name: 'Proxy-Authorization', value: 'Basic xyz' }
        ]
      };

      monitor['handleBeforeRequest'](details as any);
      monitor['handleBeforeSendHeaders'](details as any);
      expect(monitor['stats'].proxyRequests).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-retryable errors', () => {
      const details = {
        requestId: '123',
        error: 'net::ERR_CONNECTION_REFUSED',
        url: 'https://example.com'
      };

      monitor['handleError'](details as any);
      expect(monitor['stats'].failedRequests).toBe(1);
      expect(monitor['retryAttempts'].size).toBe(0);
      expect(mockReloadTab).not.toHaveBeenCalled();
    });

    it('should handle invalid tab IDs during retry', () => {
      const details = {
        requestId: '123',
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        tabId: -1,
        url: 'https://example.com'
      };

      monitor['handleError'](details as any);
      jest.runAllTimers();
      expect(mockReloadTab).not.toHaveBeenCalled();
    });

    it('should report gateway errors', () => {
      const details = {
        requestId: '123',
        statusCode: 502,
        url: 'https://example.com',
        responseHeaders: []
      };

      monitor['checkZscalerResponse'](details as any);
      expect(monitor['stats'].zscalerErrors[0].type).toBe('GATEWAY_ERROR');
    });
  });

  describe('Health Metrics', () => {
    it('should calculate correct health score weights', () => {
      monitor['stats'] = {
        totalRequests: 100,
        proxyRequests: 90,
        failedRequests: 10,
        retrySuccesses: 8,
        retryFailures: 2,
        avgProxyLatency: 2500, // Half of critical threshold
        zscalerErrors: []
      };

      const metrics = monitor.getHealthMetrics();
      // Latency score: 0.5 * 0.4 = 0.2
      // Success score: 0.9 * 0.4 = 0.36
      // Retry score: 0.8 * 0.2 = 0.16
      // Total: 0.72
      expect(metrics.healthScore).toBeCloseTo(0.72, 2);
    });

    it('should handle high latency correctly', () => {
      monitor['updateLatencyStats'](6000); // Above critical threshold
      expect(monitor['stats'].zscalerErrors[0].type).toBe('LATENCY_ERROR');
      expect(monitor['stats'].zscalerErrors[0].details.threshold).toBe(5000);
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
      expect(mockRemoveListener).not.toHaveBeenCalled();
    });
  });
});

