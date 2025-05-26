// Constants
const CONFIG = {
  API_BASE_URL: 'http://localhost:3000',
  CHECK_INTERVAL: 5000, // 5 seconds
  RETRY_INTERVAL: 2000, // 2 seconds
  MAX_RETRIES: 3
};

// State management
let protectionEnabled = true;
let connectionStatus = 'checking';
let retryCount = 0;

// Initialize background service
async function initialize() {
  await checkProtectionStatus();
  startPeriodicChecks();
  setupMessageListeners();
  updateBadge();
}

// Setup Chrome runtime message listeners
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'setProtectionEnabled':
        handleProtectionToggle(request.enabled);
        break;
      case 'getStatus':
        sendResponse({
          protectionEnabled,
          connectionStatus,
          timestamp: Date.now()
        });
        break;
    }
  });
}

// Handle protection toggle
async function handleProtectionToggle(enabled) {
  protectionEnabled = enabled;
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/protection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) throw new Error('Failed to update protection status');
    
    updateBadge();
    
    // Notify all open popups
    chrome.runtime.sendMessage({
      action: 'protectionUpdated',
      enabled: protectionEnabled,
      status: connectionStatus
    });
  } catch (error) {
    console.error('Error updating protection status:', error);
    // Revert state if update failed
    protectionEnabled = !enabled;
    updateBadge();
  }
}

// Check protection status
async function checkProtectionStatus() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/status`);
    const data = await response.json();

    if (data.success) {
      connectionStatus = data.status;
      protectionEnabled = data.protectionEnabled;
      retryCount = 0; // Reset retry count on successful check
    } else {
      throw new Error('Invalid status response');
    }
  } catch (error) {
    console.error('Error checking protection status:', error);
    connectionStatus = 'error';
    
    // Implement retry logic
    if (retryCount < CONFIG.MAX_RETRIES) {
      retryCount++;
      setTimeout(checkProtectionStatus, CONFIG.RETRY_INTERVAL);
    }
  }

  updateBadge();
}

// Start periodic status checks
function startPeriodicChecks() {
  setInterval(checkProtectionStatus, CONFIG.CHECK_INTERVAL);
}

// Update extension badge
function updateBadge() {
  const badgeConfig = getBadgeConfig();
  
  chrome.action.setBadgeText({ text: badgeConfig.text });
  chrome.action.setBadgeBackgroundColor({ color: badgeConfig.color });
  
  // Update icon based on status
  const iconPath = getIconPath();
  chrome.action.setIcon({ path: iconPath });
}

// Get badge configuration based on current state
function getBadgeConfig() {
  if (!protectionEnabled) {
    return {
      text: 'OFF',
      color: '#888888'
    };
  }

  switch (connectionStatus) {
    case 'protected':
      return {
        text: 'ON',
        color: '#4CAF50'
      };
    case 'error':
      return {
        text: 'ERR',
        color: '#F44336'
      };
    case 'checking':
      return {
        text: '...',
        color: '#2196F3'
      };
    default:
      return {
        text: '?',
        color: '#FF9800'
      };
  }
}

// Get icon path based on current state
function getIconPath() {
  const size = { 16: '16', 48: '48', 128: '128' };
  const iconPaths = {};

  if (!protectionEnabled) {
    Object.keys(size).forEach(s => {
      iconPaths[s] = `icons/icon-disabled-${size[s]}.png`;
    });
    return iconPaths;
  }

  switch (connectionStatus) {
    case 'protected':
      Object.keys(size).forEach(s => {
        iconPaths[s] = `icons/icon-enabled-${size[s]}.png`;
      });
      break;
    case 'error':
      Object.keys(size).forEach(s => {
        iconPaths[s] = `icons/icon-error-${size[s]}.png`;
      });
      break;
    default:
      Object.keys(size).forEach(s => {
        iconPaths[s] = `icons/icon-unknown-${size[s]}.png`;
      });
  }

  return iconPaths;
}

// Handle protection state changes
async function handleProtectionState(enabled) {
  try {
    // Update local state
    protectionEnabled = enabled;
    
    // Update server state
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/protection-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) throw new Error('Failed to update protection state');

    // Update UI
    updateBadge();
    
    // Notify popup if open
    chrome.runtime.sendMessage({
      action: 'protectionStateChanged',
      enabled,
      status: connectionStatus
    });

    return true;
  } catch (error) {
    console.error('Error updating protection state:', error);
    // Revert state on failure
    protectionEnabled = !enabled;
    updateBadge();
    return false;
  }
}

// Network monitoring
class NetworkMonitor {
  constructor() {
    this.lastCheck = null;
    this.checkInterval = null;
  }

  start() {
    this.check();
    this.checkInterval = setInterval(() => this.check(), CONFIG.CHECK_INTERVAL);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async check() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/network-status`);
      const data = await response.json();

      if (data.success) {
        this.lastCheck = {
          timestamp: Date.now(),
          publicIP: data.publicIP,
          privateIP: data.privateIP,
          dockerIP: data.dockerIP,
          nonPrivateIP: data.nonPrivateIP
        };

        // Notify popup if open
        chrome.runtime.sendMessage({
          action: 'networkStatusUpdated',
          status: this.lastCheck
        });
      }
    } catch (error) {
      console.error('Error checking network status:', error);
    }
  }

  getLastCheck() {
    return this.lastCheck;
  }
}

// Initialize network monitor
const networkMonitor = new NetworkMonitor();

// Start background processes
initialize().catch(console.error);
networkMonitor.start();

// Cleanup on extension update or reload
chrome.runtime.onSuspend.addListener(() => {
  networkMonitor.stop();
});
