// Zscaler Chrome Extension - Popup Script

document.addEventListener('DOMContentLoaded', async function() {
  // Get UI elements
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const statusDescription = document.getElementById('statusDescription');
  const protectionToggle = document.getElementById('protectionToggle');
  const refreshBtn = document.getElementById('refreshBtn');
  const cloudName = document.getElementById('cloudName');
  const userName = document.getElementById('userName');
  
  // Portal UI elements
  const portalStatusDot = document.getElementById('portalStatusDot');
  const portalStatusText = document.getElementById('portalStatusText');
  const portalLoginBtn = document.getElementById('portalLoginBtn');
  const portalURLInput = document.getElementById('portalURL');
  const savePortalURLBtn = document.getElementById('savePortalURL');
  
  // Initialize popup with current state
  await initializePopup();
  
  // Add event listeners
  protectionToggle.addEventListener('change', toggleProtection);
  refreshBtn.addEventListener('click', refreshStatus);
  portalLoginBtn.addEventListener('click', openPortal);
  savePortalURLBtn.addEventListener('click', savePortalURL);
  
  // Function to initialize popup with current state
  async function initializePopup() {
    // Get storage data using Promise
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['protectionEnabled', 'statusType', 'cloudName', 'userName', 'portalURL', 'portalLoginStatus'], resolve);
    });
      
    const enabled = result.protectionEnabled !== undefined ? result.protectionEnabled : true;
    const status = result.statusType || 'protected';
    
    updateUI(enabled, status);
    
    // Set toggle state
    protectionToggle.checked = enabled;
    
    // Set cloud and user info
    if (result.cloudName) {
      cloudName.textContent = result.cloudName;
    }
    
    if (result.userName) {
      userName.textContent = result.userName;
    }
    
    // Update portal UI
    if (result.portalURL) {
      portalURLInput.value = result.portalURL;
    }
    
    // Update portal status
    updatePortalStatusUI(result.portalLoginStatus || false);
    
    // Update IP addresses
    await updateIPAddresses();
    
    // Check portal login status
    await checkPortalStatus();
  }
  
  // Function to toggle protection
  async function toggleProtection() {
    const enabled = protectionToggle.checked;
    
    try {
      // Send message to background script and wait for response
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'toggleProtection',
          enabled: enabled
        }, resolve);
      });
      
      if (response && response.success) {
        updateUI(enabled, response.statusType);
      } else {
        // Handle error
        console.error('Failed to toggle protection');
        // Revert toggle if operation failed
        protectionToggle.checked = !enabled;
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
      // Revert toggle on error
      protectionToggle.checked = !enabled;
    }
  }
  
  // Function to refresh status
  async function refreshStatus() {
    // Disable refresh button temporarily
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    try {
      // Send message to background script and wait for response
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'refreshStatus'
        }, resolve);
      });

      if (response && response.success) {
        updateUI(response.enabled, response.statusType);
        
        // Update toggle state
        protectionToggle.checked = response.enabled;
        
        // Update IP addresses
        await updateIPAddresses();
        
        // Check portal status
        await checkPortalStatus();
      } else {
        // Handle error
        console.error('Failed to refresh status');
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
    } finally {
      // Re-enable refresh button
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Status';
    }
  }
  
  // Function to update UI based on state
  function updateUI(enabled, statusType) {
    // Update status icon
    if (enabled) {
      if (statusType === 'error') {
        statusIcon.src = '../icons/icon-enabled-error-48.png';
        statusText.textContent = 'Error';
        statusDescription.textContent = 'Zscaler is experiencing issues. Please try again later.';
      } else if (statusType === 'alert') {
        statusIcon.src = '../icons/icon-enabled-alert-48.png';
        statusText.textContent = 'Warning';
        statusDescription.textContent = 'Zscaler protection is active but has some warnings.';
      } else {
        statusIcon.src = '../icons/icon-enabled-48.png';
        statusText.textContent = 'Protected';
        statusDescription.textContent = 'Your internet traffic is being protected by Zscaler.';
      }
    } else {
      if (statusType === 'error') {
        statusIcon.src = '../icons/icon-disabled-error-48.png';
        statusText.textContent = 'Disabled (Error)';
        statusDescription.textContent = 'Zscaler protection is disabled with errors.';
      } else {
        statusIcon.src = '../icons/icon-disabled-48.png';
        statusText.textContent = 'Not Protected';
        statusDescription.textContent = 'Zscaler protection is currently disabled.';
      }
    }
    
    // Update container class for styling
    document.body.className = enabled ? 
      (statusType === 'error' ? 'status-error' : (statusType === 'alert' ? 'status-alert' : 'status-protected')) : 
      'status-disabled';
  }
});

// IP validation functions
function isValidIPv4(ip) {
  // Regular expression for IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  
  // Check each octet
  const octets = ip.split('.');
  return octets.every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

function isValidIPv6(ip) {
  // Regular expression for IPv6 validation
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
  return ipv6Regex.test(ip);
}

function validateIP(ip) {
  if (!ip || ip === 'Not available') return 'Not available';
  
  // Remove any surrounding whitespace
  ip = ip.trim();
  
  // Check for IPv4
  if (isValidIPv4(ip)) {
    return ip;
  }
  
  // Check for IPv6
  if (isValidIPv6(ip)) {
    return ip;
  }
  
  // If neither IPv4 nor IPv6, return error
  console.error('Invalid IP address:', ip);
  return 'Invalid IP';
}

// Add IP format display helper
function formatIP(ip) {
  if (!ip || ip === 'Not available' || ip === 'Invalid IP') return ip;
  
  // If IPv6, add brackets for better readability
  if (ip.includes(':')) {
    return `[${ip}]`;
  }
  
  return ip;
}

// Function to get public IP
async function getPublicIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return validateIP(data.ip);
  } catch (error) {
    console.error('Error fetching public IP:', error);
    return 'Not available';
  }
}

// Function to get private IP using WebRTC
function getPrivateIP() {
  return new Promise((resolve) => {
    try {
      // Create RTCPeerConnection
      const rtc = new RTCPeerConnection({
        iceServers: []
      });

      // Listen for candidate events
      rtc.onicecandidate = (event) => {
        if (!event.candidate) return;

        // Extract IP from candidate string
        const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/g
          .exec(event.candidate.candidate);

        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          if (!ip.startsWith('127.') && !ip.startsWith('::1')) {
            rtc.close();
            resolve(validateIP(ip));
          }
        }
      };

      // Create data channel and offer to trigger candidates
      rtc.createDataChannel('');
      rtc.createOffer()
        .then(offer => rtc.setLocalDescription(offer))
        .catch(() => resolve('Not available'));

      // Set timeout in case no viable candidates are found
      setTimeout(() => {
        rtc.close();
        resolve('Not available');
      }, 5000);
    } catch (error) {
      console.error('Error getting private IP:', error);
      resolve('Not available');
    }
  });
}

// Function to update IP addresses
async function updateIPAddresses() {
  const publicIPElement = document.getElementById('publicIP');
  const privateIPElement = document.getElementById('privateIP');

  // Update public IP
  publicIPElement.textContent = 'Loading...';
  const publicIP = await getPublicIP();
  publicIPElement.textContent = formatIP(publicIP);

  // Update private IP
  privateIPElement.textContent = 'Loading...';
  const privateIP = await getPrivateIP();
  privateIPElement.textContent = formatIP(privateIP);
}

// Portal-related functions

// Open company portal in new tab
async function openPortal() {
  try {
    // Disable button temporarily
    portalLoginBtn.disabled = true;
    portalLoginBtn.textContent = 'Opening...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'openPortal'
      }, resolve);
    });
    
    if (!response || !response.success) {
      // Handle error
      portalStatusText.textContent = response ? response.message : 'Failed to open portal';
      console.error('Failed to open portal:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error opening portal:', error);
    portalStatusText.textContent = 'Error opening portal';
  } finally {
    // Re-enable button
    portalLoginBtn.disabled = false;
    portalLoginBtn.textContent = 'Open Portal';
  }
}

// Save portal URL
async function savePortalURL() {
  try {
    const url = portalURLInput.value;
    
    // Disable button temporarily
    savePortalURLBtn.disabled = true;
    savePortalURLBtn.textContent = 'Saving...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'updatePortalURL',
        url: url
      }, resolve);
    });
    
    if (response && response.success) {
      // Update input with formatted URL if returned
      if (response.portalURL) {
        portalURLInput.value = response.portalURL;
      }
      
      // Update status
      portalStatusText.textContent = 'URL saved successfully';
      
      // Check portal status after URL update
      await checkPortalStatus();
    } else {
      // Handle error
      portalStatusText.textContent = response ? response.message : 'Failed to save URL';
      console.error('Failed to save portal URL:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error saving portal URL:', error);
    portalStatusText.textContent = 'Error saving URL';
  } finally {
    // Re-enable button
    savePortalURLBtn.disabled = false;
    savePortalURLBtn.textContent = 'Save';
  }
}

// Check portal login status
async function checkPortalStatus() {
  try {
    // Update UI to show checking
    portalStatusDot.className = 'status-dot';
    portalStatusText.textContent = 'Checking portal status...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'checkPortalLogin'
      }, resolve);
    });
    
    if (response && response.success) {
      // Update UI based on login status
      updatePortalStatusUI(response.loggedIn);
    } else {
      // Handle error
      portalStatusDot.className = 'status-dot';
      portalStatusText.textContent = response ? response.message : 'Failed to check portal status';
      console.error('Failed to check portal status:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error checking portal status:', error);
    portalStatusDot.className = 'status-dot';
    portalStatusText.textContent = 'Error checking portal status';
  }
}

// Update portal status UI
function updatePortalStatusUI(isLoggedIn) {
  if (isLoggedIn) {
    portalStatusDot.className = 'status-dot connected';
    portalStatusText.textContent = 'Connected to portal';
  } else {
    portalStatusDot.className = 'status-dot disconnected';
    portalStatusText.textContent = 'Not connected to portal';
  }
}

