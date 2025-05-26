// Background service worker for Zscaler Security Extension

// Constants
const DEFAULT_CHECK_INTERVAL = 5000; // 5 seconds
const API_BASE_URL = 'http://localhost:3000/api';

// State management
let checkInterval = null;
let protectionEnabled = true;
let currentStatus = 'protected';

// Initialize background service
chrome.runtime.onInstalled.addListener(async () => {
    // Load initial settings
    const settings = await loadSettings();
    
    // Start monitoring
    startMonitoring(settings);
    
    // Set default state
    await chrome.storage.local.set({
        protectionEnabled: true,
        statusType: 'protected',
        lastUpdate: new Date().toISOString()
    });
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'toggleProtection':
            handleProtectionToggle(message.enabled).then(sendResponse);
            return true; // Keep channel open for async response

        case 'refreshStatus':
            refreshStatus().then(sendResponse);
            return true;

        case 'checkPortalLogin':
            checkPortalLogin().then(sendResponse);
            return true;

        case 'checkPartnerPortalLogin':
            checkPartnerPortalLogin().then(sendResponse);
            return true;

        case 'settingsUpdated':
            handleSettingsUpdate(message.settings).then(sendResponse);
            return true;
    }
});

// Handle protection toggle
async function handleProtectionToggle(enabled) {
    try {
        protectionEnabled = enabled;
        
        // Update storage
        await chrome.storage.local.set({
            protectionEnabled: enabled,
            statusType: enabled ? 'protected' : 'disabled',
            lastUpdate: new Date().toISOString()
        });

        // Update monitoring based on state
        if (enabled) {
            startMonitoring();
        } else {
            stopMonitoring();
        }

        return { success: true, statusType: enabled ? 'protected' : 'disabled' };
    } catch (error) {
        console.error('Error toggling protection:', error);
        return { success: false, error: error.message };
    }
}

// Start network monitoring
async function startMonitoring(settings = null) {
    if (!settings) {
        settings = await loadSettings();
    }

    // Clear existing interval
    stopMonitoring();

    // Start new monitoring interval
    checkInterval = setInterval(async () => {
        try {
            // Update IP information
            await updateIPInformation();
            
            // Check protection status
            await checkProtectionStatus();
            
            // Check portal status if enabled
            if (settings.checkPortalStatus) {
                await checkPortalLogin();
                await checkPartnerPortalLogin();
            }
        } catch (error) {
            console.error('Error in monitoring cycle:', error);
            updateErrorState(error);
        }
    }, settings.updateInterval || DEFAULT_CHECK_INTERVAL);
}

// Stop network monitoring
function stopMonitoring() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

// Update IP information
async function updateIPInformation() {
    try {
        const [publicIP, privateIPs] = await Promise.all([
            getPublicIP(),
            getAllPrivateIPs()
        ]);

        // Store updated IP information
        await chrome.storage.local.set({
            ipInfo: {
                public: publicIP,
                docker: privateIPs.docker,
                nonPrivate: privateIPs.nonPrivate,
                private: privateIPs.private,
                lastUpdate: new Date().toISOString()
            }
        });

        // Notify popup about IP updates
        chrome.runtime.sendMessage({
            action: 'ipUpdated',
            ipInfo: { publicIP, ...privateIPs }
        }).catch(() => {
            // Ignore errors if popup is not open
        });

        return true;
    } catch (error) {
        console.error('Error updating IP information:', error);
        updateErrorState(error);
        return false;
    }
}

// Check protection status
async function checkProtectionStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            currentStatus = data.status;
            await chrome.storage.local.set({
                statusType: data.status,
                lastCheck: new Date().toISOString()
            });

            // Update extension icon based on status
            updateExtensionIcon(data.status);
        }

        return data.success;
    } catch (error) {
        console.error('Error checking protection status:', error);
        updateErrorState(error);
        return false;
    }
}

// Load settings from storage
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get('networkSettings');
        return result.networkSettings || {
            updateInterval: DEFAULT_CHECK_INTERVAL,
            checkPortalStatus: true,
            autoReconnect: true,
            notifyOnError: true
        };
    } catch (error) {
        console.error('Error loading settings:', error);
        return {
            updateInterval: DEFAULT_CHECK_INTERVAL,
            checkPortalStatus: true,
            autoReconnect: true,
            notifyOnError: true
        };
    }
}

// Handle settings updates
async function handleSettingsUpdate(settings) {
    try {
        // Validate settings
        if (!validateSettings(settings)) {
            throw new Error('Invalid settings configuration');
        }

        // Save settings to storage
        await chrome.storage.local.set({ networkSettings: settings });

        // Restart monitoring with new settings
        await startMonitoring(settings);
        return { success: true };
    } catch (error) {
        console.error('Error handling settings update:', error);
        return { success: false, error: error.message };
    }
}

// Validate settings
function validateSettings(settings) {
    return (
        settings &&
        typeof settings.updateInterval === 'number' &&
        settings.updateInterval >= 1000 &&
        typeof settings.checkPortalStatus === 'boolean'
    );
}

// Update extension icon based on status
function updateExtensionIcon(status) {
    const iconPath = status === 'protected' 
        ? 'icons/icon-enabled-48.png'
        : status === 'error'
        ? 'icons/icon-enabled-error-48.png'
        : 'icons/icon-disabled-48.png';

    chrome.action.setIcon({ path: iconPath });
}

// Update error state
function updateErrorState(error) {
    chrome.storage.local.set({
        lastError: {
            message: error.message,
            timestamp: new Date().toISOString()
        }
    });

    // Update icon to error state
    updateExtensionIcon('error');

    // Show error notification if enabled
    chrome.storage.local.get('networkSettings', result => {
        if (result.networkSettings?.notifyOnError) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon-enabled-error-48.png',
                title: 'Zscaler Security Error',
                message: `Error: ${error.message}`
            });
        }
    });
}

// Check portal login status
async function checkPortalLogin() {
    try {
        const response = await fetch(`${API_BASE_URL}/portal/status`);
        const data = await response.json();
        
        await chrome.storage.local.set({
            portalLoginStatus: data.loggedIn,
            lastPortalCheck: new Date().toISOString()
        });

        return { success: true, loggedIn: data.loggedIn };
    } catch (error) {
        console.error('Error checking portal login:', error);
        return { success: false, error: error.message };
    }
}

// Check partner portal login status
async function checkPartnerPortalLogin() {
    try {
        const response = await fetch(`${API_BASE_URL}/partner-portal/status`);
        const data = await response.json();
        
        await chrome.storage.local.set({
            partnerPortalLoginStatus: data.loggedIn,
            lastPartnerPortalCheck: new Date().toISOString()
        });

        return { success: true, loggedIn: data.loggedIn };
    } catch (error) {
        console.error('Error checking partner portal login:', error);
        return { success: false, error: error.message };
    }
}

// IP utility functions from shared utils
async function getPublicIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error fetching public IP:', error);
        return null;
    }
}

// Get all private IPs using chrome.system.network API
async function getAllPrivateIPs() {
    return new Promise((resolve) => {
        chrome.system.network.getNetworkInterfaces((interfaces) => {
            const ips = {
                docker: null,
                nonPrivate: null,
                private: null
            };

            for (const iface of interfaces) {
                const ip = iface.address;
                
                // Skip IPv6 addresses
                if (ip.includes(':')) continue;

                // Check Docker network (172.17.x.x)
                if (ip.startsWith('172.17.')) {
                    ips.docker = ip;
                }
                // Check non-private IP
                else if (!ip.startsWith('10.') && 
                         !ip.startsWith('172.16.') &&
                         !ip.startsWith('192.168.')) {
                    ips.nonPrivate = ip;
                }
                // Check private IP
                else {
                    ips.private = ip;
                }
            }

            resolve(ips);
        });
    });
}

