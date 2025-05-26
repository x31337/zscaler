import { vi } from "vitest";

// Mock Chrome API
const createMockChromeAPI = () => ({
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
});

// Mock global chrome API before each test
beforeEach(() => {
  global.chrome = createMockChromeAPI();
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});
