// Zscaler Chrome Extension - Background Service Worker

// Default state values
const defaultState = {
  protectionEnabled: true,
  statusType: 'protected',
  cloudName: 'zscaler.net',
  userName: 'User',
  lastChecked: Date.now(),
  portalURL: 'https://portal.zscaler.net',
  portalEmail: '',
  portalLoginStatus: false,
  portalLastChecked: null,
  partnerPortalURL: '',
  partnerPortalEmail: '',
  partnerPortalLoginStatus: false,
  partnerPortalLastChecked: null
};

// Initialize extension state
function initializeState() {
  chrome.storage.local.get(Object.keys(defaultState), (result) => {
    // Check if we need to set default values
    const newState = {};
    let needsUpdate = false;
    
    for (const key in defaultState) {
      if (result[key] === undefined) {
        newState[key] = defaultState[key];
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      chrome.storage.local.set(newState, () => {
        console.log('Zscaler extension state initialized');
      });
    }
    
    // Update the extension icon based on current state
    updateIcon(result.protectionEnabled !== undefined ? result.protectionEnabled : defaultState.protectionEnabled, 
               result.statusType || defaultState.statusType);
  });
}

// Update extension icon based on protection status
function updateIcon(enabled, statusType) {
  let iconPath;
  
  if (enabled) {
    if (statusType === 'error') {
      iconPath = {
        16: 'icons/icon-enabled-error-16.png',
        48: 'icons/icon-enabled-error-48.png',
        128: 'icons/icon-enabled-error-128.png'
      };
    } else if (statusType === 'alert') {
      iconPath = {
        16: 'icons/icon-enabled-alert-16.png',
        48: 'icons/icon-enabled-alert-48.png',
        128: 'icons/icon-enabled-alert-128.png'
      };
    } else {
      iconPath = {
        16: 'icons/icon-enabled-16.png',
        48: 'icons/icon-enabled-48.png',
        128: 'icons/icon-enabled-128.png'
      };
    }
  } else {
    if (statusType === 'error') {
      iconPath = {
        16: 'icons/icon-disabled-error-16.png',
        48: 'icons/icon-disabled-error-48.png',
        128: 'icons/icon-disabled-error-128.png'
      };
    } else {
      iconPath = {
        16: 'icons/icon-disabled-16.png',
        48: 'icons/icon-disabled-48.png',
        128: 'icons/icon-disabled-128.png'
      };
    }
  }
  
  chrome.action.setIcon({ path: iconPath });
}

// Show notification to user
function showNotification(title, message, type = 'basic') {
  chrome.notifications.create({
    type: type,
    iconUrl: chrome.runtime.getURL('icons/ZscalerAppSplash.png'), // This is already 128x128
    title: title,
    message: message
  });
}

// Simulate connection check
function simulateConnectionCheck() {
  return new Promise((resolve) => {
    // Simulate random network condition
    const random = Math.random();
    let status;
    
    if (random > 0.9) {
      status = 'error';
    } else if (random > 0.7) {
      status = 'alert';
    } else {
      status = 'protected';
    }
    
    // Simulate delay in checking
    setTimeout(() => {
      resolve(status);
    }, 1000);
  });
}

// Check portal login status
async function checkPortalLoginStatus() {
  try {
    // Get current portal URL and email from storage
    const state = await new Promise(resolve => {
      chrome.storage.local.get(['portalURL', 'portalEmail'], resolve);
    });
    
    const portalURL = state.portalURL || defaultState.portalURL;
    const portalEmail = state.portalEmail || defaultState.portalEmail;
    
    // If no portal URL is configured, return false
    if (!portalURL || portalURL.trim() === '') {
      return { success: true, loggedIn: false, message: 'No portal URL configured' };
    }
    
    // If no email is configured, return false
    if (!portalEmail || portalEmail.trim() === '') {
      return { success: true, loggedIn: false, message: 'No email configured' };
    }
    
    // In a real implementation, we would check the login status by making a request
    // to the portal and checking if the user is authenticated. For this simulation,
    // we'll just simulate a random login status.
    const isLoggedIn = Math.random() > 0.3; // 70% chance of being logged in
    
    // Update state in storage
    chrome.storage.local.set({
      portalLoginStatus: isLoggedIn,
      portalLastChecked: Date.now()
    });
    
    return { 
      success: true, 
      loggedIn: isLoggedIn, 
      message: isLoggedIn ? 'Logged in to portal' : 'Not logged in to portal'
    };
  } catch (error) {
    console.error('Error checking portal login status:', error);
    return { 
      success: false, 
      loggedIn: false, 
      message: 'Error checking portal login status'
    };
  }
}

// Open portal in new tab
async function openPortal() {
  try {
    // Get current portal URL from storage
    const state = await new Promise(resolve => {
      chrome.storage.local.get(['portalURL'], resolve);
    });
    
    const portalURL = state.portalURL || defaultState.portalURL;
    
    // If no portal URL is configured, return error
    if (!portalURL || portalURL.trim() === '') {
      return { success: false, message: 'No portal URL configured' };
    }
    
    // Open portal URL in new tab
    chrome.tabs.create({ url: portalURL });
    
    return { success: true, message: 'Portal opened in new tab' };
  } catch (error) {
    console.error('Error opening portal:', error);
    return { success: false, message: 'Error opening portal' };
  }
}

// Update portal URL
async function updatePortalURL(url) {
  try {
    // Validate URL
    let portalURL = url.trim();
    
    // Add https:// if not present and URL is not empty
    if (portalURL !== '' && !portalURL.startsWith('http://') && !portalURL.startsWith('https://')) {
      portalURL = 'https://' + portalURL;
    }
    
    // Update state in storage
    chrome.storage.local.set({
      portalURL: portalURL
    });
    
    return { success: true, portalURL: portalURL };
  } catch (error) {
    console.error('Error updating portal URL:', error);
    return { success: false, message: 'Error updating portal URL' };
  }
}

// Update portal configuration (URL and email)
async function updatePortalConfig(url, email) {
  try {
    // Validate URL
    let portalURL = url.trim();
    
    // Add https:// if not present and URL is not empty
    if (portalURL !== '' && !portalURL.startsWith('http://') && !portalURL.startsWith('https://')) {
      portalURL = 'https://' + portalURL;
    }
    
    // Validate email
    const portalEmail = email.trim();
    if (portalEmail !== '' && !isValidEmail(portalEmail)) {
      return { success: false, message: 'Invalid email format' };
    }
    
    // Update state in storage
    chrome.storage.local.set({
      portalURL: portalURL,
      portalEmail: portalEmail
    });
    
    return { success: true, portalURL: portalURL, portalEmail: portalEmail };
  } catch (error) {
    console.error('Error updating portal configuration:', error);
    return { success: false, message: 'Error updating portal configuration' };
  }
}

// Update partner portal configuration (URL and email)
async function updatePartnerPortalConfig(url, email) {
  try {
    // Validate URL
    let partnerPortalURL = url.trim();
    
    // Add https:// if not present and URL is not empty
    if (partnerPortalURL !== '' && !partnerPortalURL.startsWith('http://') && !partnerPortalURL.startsWith('https://')) {
      partnerPortalURL = 'https://' + partnerPortalURL;
    }
    
    // Validate email
    const partnerPortalEmail = email.trim();
    if (partnerPortalEmail !== '' && !isValidEmail(partnerPortalEmail)) {
      return { success: false, message: 'Invalid email format' };
    }
    
    // Update state in storage
    chrome.storage.local.set({
      partnerPortalURL: partnerPortalURL,
      partnerPortalEmail: partnerPortalEmail
    });
    
    return { 
      success: true, 
      partnerPortalURL: partnerPortalURL, 
      partnerPortalEmail: partnerPortalEmail 
    };
  } catch (error) {
    console.error('Error updating partner portal configuration:', error);
    return { success: false, message: 'Error updating partner portal configuration' };
  }
}

// Email validation function
function isValidEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

// Toggle protection state
async function toggleProtection(enabled) {
  try {
    // Simulate connection action
    const statusType = await simulateConnectionCheck();
    
    // Update state in storage
    chrome.storage.local.set({
      protectionEnabled: enabled,
      statusType: statusType,
      lastChecked: Date.now()
    });
    
    // Update icon
    updateIcon(enabled, statusType);
    
    // Show notification
    if (enabled) {
      showNotification(
        'Zscaler Protection Enabled',
        statusType === 'error' ? 'Protection enabled but experiencing issues.' :
        statusType === 'alert' ? 'Protection enabled with warnings.' :
        'Your internet traffic is now protected by Zscaler.'
      );
    } else {
      showNotification(
        'Zscaler Protection Disabled',
        'Your internet traffic is no longer being protected.'
      );
    }
    
    return { success: true, statusType: statusType };
  } catch (error) {
    console.error('Error toggling protection:', error);
    return { success: false };
  }
}

// Refresh connection status
async function refreshStatus() {
  try {
    // Get current state
    const state = await new Promise(resolve => {
      chrome.storage.local.get(['protectionEnabled'], resolve);
    });
    
    const enabled = state.protectionEnabled !== undefined ? state.protectionEnabled : defaultState.protectionEnabled;
    
    // Simulate connection check
    const statusType = await simulateConnectionCheck();
    
    // Update state in storage
    chrome.storage.local.set({
      statusType: statusType,
      lastChecked: Date.now()
    });
    
    // Update icon
    updateIcon(enabled, statusType);
    
    return { success: true, enabled: enabled, statusType: statusType };
  } catch (error) {
    console.error('Error refreshing status:', error);
    return { success: false };
  }
}

// Set up periodic status check (every 5 minutes)
function setupPeriodicCheck() {
  // Check Zscaler protection status
  setInterval(async () => {
    const result = await refreshStatus();
    
    if (result.success) {
      // If there's an error or alert, show notification
      if (result.statusType === 'error' || result.statusType === 'alert') {
        showNotification(
          result.statusType === 'error' ? 'Zscaler Connection Error' : 'Zscaler Connection Warning',
          result.statusType === 'error' ? 'There is an issue with your Zscaler connection.' : 'There are warnings with your Zscaler connection.'
        );
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Check portal login status (every 10 minutes)
  setInterval(async () => {
    const result = await checkPortalLoginStatus();
    
    // If portal login status changed, show notification
    if (result.success) {
      // Get previous login status
      const state = await new Promise(resolve => {
        chrome.storage.local.get(['portalLoginStatus'], resolve);
      });
      
      // If login status changed from logged in to logged out, show notification
      if (state.portalLoginStatus === true && result.loggedIn === false) {
        showNotification(
          'Portal Session Expired',
          'Your portal session has expired. Please log in again.'
        );
      }
    }
  }, 10 * 60 * 1000); // 10 minutes
  
  // Check partner portal login status (every 10 minutes)
  setInterval(async () => {
    const result = await checkPartnerPortalLoginStatus();
    
    // If partner portal login status changed, show notification
    if (result.success) {
      // Get previous login status
      const state = await new Promise(resolve => {
        chrome.storage.local.get(['partnerPortalLoginStatus'], resolve);
      });
      
      // If login status changed from logged in to logged out, show notification
      if (state.partnerPortalLoginStatus === true && result.loggedIn === false) {
        showNotification(
          'Partner Portal Session Expired',
          'Your partner portal session has expired. Please log in again.'
        );
      }
    }
  }, 10 * 60 * 1000); // 10 minutes
}

// Check partner portal login status
async function checkPartnerPortalLoginStatus() {
  try {
    // Get current partner portal URL and email from storage
    const state = await new Promise(resolve => {
      chrome.storage.local.get(['partnerPortalURL', 'partnerPortalEmail'], resolve);
    });
    
    const partnerPortalURL = state.partnerPortalURL || defaultState.partnerPortalURL;
    const partnerPortalEmail = state.partnerPortalEmail || defaultState.partnerPortalEmail;
    
    // If no partner portal URL is configured, return false
    if (!partnerPortalURL || partnerPortalURL.trim() === '') {
      return { success: true, loggedIn: false, message: 'No partner portal URL configured' };
    }
    
    // If no email is configured, return false
    if (!partnerPortalEmail || partnerPortalEmail.trim() === '') {
      return { success: true, loggedIn: false, message: 'No email configured' };
    }
    
    // In a real implementation, we would check the login status by making a request
    // to the partner portal and checking if the user is authenticated. For this simulation,
    // we'll just simulate a random login status.
    const isLoggedIn = Math.random() > 0.3; // 70% chance of being logged in
    
    // Update state in storage
    chrome.storage.local.set({
      partnerPortalLoginStatus: isLoggedIn,
      partnerPortalLastChecked: Date.now()
    });
    
    return { 
      success: true, 
      loggedIn: isLoggedIn, 
      message: isLoggedIn ? 'Logged in to partner portal' : 'Not logged in to partner portal'
    };
  } catch (error) {
    console.error('Error checking partner portal login status:', error);
    return { 
      success: false, 
      loggedIn: false, 
      message: 'Error checking partner portal login status'
    };
  }
}

// Open partner portal in new tab
async function openPartnerPortal() {
  try {
    // Get current partner portal URL from storage
    const state = await new Promise(resolve => {
      chrome.storage.local.get(['partnerPortalURL'], resolve);
    });
    
    const partnerPortalURL = state.partnerPortalURL || defaultState.partnerPortalURL;
    
    // If no partner portal URL is configured, return error
    if (!partnerPortalURL || partnerPortalURL.trim() === '') {
      return { success: false, message: 'No partner portal URL configured' };
    }
    
    // Open partner portal URL in new tab
    chrome.tabs.create({ url: partnerPortalURL });
    
    return { success: true, message: 'Partner portal opened in new tab' };
  } catch (error) {
    console.error('Error opening partner portal:', error);
    return { success: false, message: 'Error opening partner portal' };
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleProtection') {
    toggleProtection(message.enabled)
      .then(sendResponse)
      .catch(error => {
        console.error('Error in toggleProtection:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'refreshStatus') {
    refreshStatus()
      .then(sendResponse)
      .catch(error => {
        console.error('Error in refreshStatus:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'checkPortalLogin') {
    checkPortalLoginStatus()
      .then(sendResponse)
      .catch(error => {
        console.error('Error in checkPortalLogin:', error);
        sendResponse({ success: false, loggedIn: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'checkPartnerPortalLogin') {
    checkPartnerPortalLoginStatus()
      .then(sendResponse)
      .catch(error => {
        console.error('Error in checkPartnerPortalLogin:', error);
        sendResponse({ success: false, loggedIn: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'openPortal') {
    openPortal()
      .then(sendResponse)
      .catch(error => {
        console.error('Error in openPortal:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'openPartnerPortal') {
    openPartnerPortal()
      .then(sendResponse)
      .catch(error => {
        console.error('Error in openPartnerPortal:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'updatePortalURL') {
    updatePortalURL(message.url)
      .then(sendResponse)
      .catch(error => {
        console.error('Error in updatePortalURL:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'updatePortalConfig') {
    updatePortalConfig(message.url, message.email)
      .then(sendResponse)
      .catch(error => {
        console.error('Error in updatePortalConfig:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'updatePartnerPortalConfig') {
    updatePartnerPortalConfig(message.url, message.email)
      .then(sendResponse)
      .catch(error => {
        console.error('Error in updatePartnerPortalConfig:', error);
        sendResponse({ success: false });
      });
    return true; // Keep the message channel open for async response
  }
});

// Initialize when extension loads
initializeState();
setupPeriodicCheck();

// Initial status check
refreshStatus().catch(error => {
  console.error('Initial status check failed:', error);
});

// Initial portal login check
checkPortalLoginStatus().catch(error => {
  console.error('Initial portal login check failed:', error);
});

// Initial partner portal login check
checkPartnerPortalLoginStatus().catch(error => {
  console.error('Initial partner portal login check failed:', error);
});

