// Zscaler Chrome Extension - Popup Script

// Database operations
const dbConfig = {
    host: 'localhost',
    user: 'zscaler',
    password: 'zscaler123',
    database: 'zscaler_settings'
};


// Initialize API endpoint
const API_ENDPOINT = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', function() {
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
  const portalEmailInput = document.getElementById('portalEmail');
  const savePortalConfigBtn = document.getElementById('savePortalConfig');
  
  // Partner Portal UI elements
  const partnerPortalStatusDot = document.getElementById('partnerPortalStatusDot');
  const partnerPortalStatusText = document.getElementById('partnerPortalStatusText');
  const partnerPortalLoginBtn = document.getElementById('partnerPortalLoginBtn');
  const partnerPortalURLInput = document.getElementById('partnerPortalURL');
  const partnerPortalEmailInput = document.getElementById('partnerPortalEmail');
  const savePartnerPortalConfigBtn = document.getElementById('savePartnerPortalConfig');
  
  // Initialize popup with current state
  await initializePopup();
  
  // Add event listeners
  protectionToggle.addEventListener('change', toggleProtection);
  refreshBtn.addEventListener('click', refreshStatus);
  portalLoginBtn.addEventListener('click', openPortal);
  savePortalConfigBtn.addEventListener('click', savePortalConfig);
  partnerPortalLoginBtn.addEventListener('click', openPartnerPortal);
  savePartnerPortalConfigBtn.addEventListener('click', savePartnerPortalConfig);
  
  // Function to initialize popup with current state
  async function initializePopup() {
    // Get storage data using Promise
    const result = await new Promise(resolve => {
      chrome.storage.local.get([
        'protectionEnabled', 
        'statusType', 
        'cloudName', 
        'userName', 
        'portalURL', 
        'portalEmail',
        'portalLoginStatus',
        'partnerPortalURL',
        'partnerPortalEmail',
        'partnerPortalLoginStatus'
      ], resolve);
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
    
    if (result.portalEmail) {
      portalEmailInput.value = result.portalEmail;
    }
    
    // Update partner portal UI
    if (result.partnerPortalURL) {
      partnerPortalURLInput.value = result.partnerPortalURL;
    }
    
    if (result.partnerPortalEmail) {
      partnerPortalEmailInput.value = result.partnerPortalEmail;
    }
    
    // Update portal statuses
    updatePortalStatusUI(result.portalLoginStatus || false);
    updatePartnerPortalStatusUI(result.partnerPortalLoginStatus || false);
    
    // Update IP addresses
    await updateIPAddresses();
    
    // Check portal login statuses
    await checkPortalStatus();
    await checkPartnerPortalStatus();
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

// Function to get all private IPs categorized by type
async function getAllPrivateIPs() {
  try {
    // First try using native messaging host (which uses ifconfig)
    try {
      // Get all interfaces from native host
      const allIPs = await getAllIPsWithNativeHost();
      return categorizeIPs(allIPs);
    } catch (nativeHostError) {
      console.warn("Native host error, falling back to system.network API:", nativeHostError);
      
      // If native messaging fails, try system.network API
      if (chrome.system && chrome.system.network && chrome.system.network.getNetworkInterfaces) {
        return new Promise((resolve) => {
          chrome.system.network.getNetworkInterfaces((interfaces) => {
            // Filter out loopback and non-IPv4 addresses
            const validInterfaces = interfaces.filter(iface => 
              iface.address && 
              iface.address.indexOf(':') === -1 && // Not IPv6
              !iface.address.startsWith('127.') &&  // Not loopback
              !iface.address.startsWith('169.254.') // Not link-local
            );
            
            if (validInterfaces.length > 0) {
              const allIPs = validInterfaces.map(iface => iface.address);
              resolve(categorizeIPs(allIPs));
            } else {
              // Fallback to WebRTC method
              getAllIPsWithWebRTC().then(ips => resolve(categorizeIPs(ips)));
            }
          });
        });
      } else {
        // If system.network is not available, fall back to WebRTC
        console.warn("system.network API not available, falling back to WebRTC");
        const ips = await getAllIPsWithWebRTC();
        return categorizeIPs(ips);
      }
    }
  } catch (error) {
    console.error('Error getting private IPs:', error);
    return {
      docker: null,
      nonPrivate: null,
      private: null
    };
  }
}

// For backward compatibility - get a single preferred private IP
async function getPrivateIP() {
  const allIPs = await getAllPrivateIPs();
  
  // Prefer non-private IP, then private IP, then Docker IP
  return allIPs.nonPrivate || allIPs.private || allIPs.docker || 'Not available';
}

// Function to get all IPs using native messaging host
function getAllIPsWithNativeHost() {
  return new Promise((resolve, reject) => {
    try {
      // Connect to native messaging host
      const port = chrome.runtime.connectNative('com.zscaler.native_host');
      
      // Set up message listener
      port.onMessage.addListener((response) => {
        if (response.success && response.ips && Array.isArray(response.ips)) {
          // Validate each IP
          const validIPs = response.ips.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP');
          resolve(validIPs);
        } else if (response.success && response.ip) {
          // For backward compatibility if the host returns a single IP
          resolve([validateIP(response.ip)]);
        } else {
          reject(new Error(response.error || 'Failed to get IPs from native host'));
        }
        
        // Disconnect from native host
        port.disconnect();
      });
      
      // Set up disconnect listener
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Native host disconnected: ${chrome.runtime.lastError.message}`));
        }
      });
      
      // Send request to native host
      port.postMessage({ action: 'getAllIPs' });
      
      // Set timeout
      setTimeout(() => {
        if (port) {
          port.disconnect();
          reject(new Error('Timeout waiting for native host response'));
        }
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

// For backward compatibility
function getPrivateIPWithNativeHost() {
  return new Promise((resolve, reject) => {
    getAllIPsWithNativeHost()
      .then(ips => {
        if (ips && ips.length > 0) {
          // Prefer non-private IP
          const nonPrivateIP = ips.find(ip => 
            !ip.startsWith('10.') && 
            !ip.startsWith('172.16.') &&
            !ip.startsWith('172.17.') &&
            !ip.startsWith('172.18.') &&
            !ip.startsWith('172.19.') &&
            !ip.startsWith('172.2') &&
            !ip.startsWith('172.30.') &&
            !ip.startsWith('172.31.') &&
            !ip.startsWith('192.168.')
          );
          
          resolve(nonPrivateIP || ips[0]);
        } else {
          reject(new Error('No valid IPs found'));
        }
      })
      .catch(reject);
  });
}

// Function to get all IPs using WebRTC
function getAllIPsWithWebRTC() {
  return new Promise((resolve) => {
    try {
      // Array to collect IP addresses
      const ipAddresses = [];
      
      // Create RTCPeerConnection with STUN servers to increase reliability
      const rtc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Listen for candidate events
      rtc.onicecandidate = (event) => {
        if (!event.candidate) {
          // No more candidates, resolve with all collected IPs
          rtc.close();
          
          if (ipAddresses.length > 0) {
            resolve(ipAddresses.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP'));
          } else {
            resolve([]);
          }
          return;
        }

        // Extract IP from candidate string
        const candidateStr = event.candidate.candidate;
        const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3})/g.exec(candidateStr);

        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          // Collect valid IPs (skip loopback and link-local)
          if (!ip.startsWith('127.') && 
              !ip.startsWith('169.254.') && 
              !ipAddresses.includes(ip)) {
            ipAddresses.push(ip);
          }
        }
      };

      // Create data channel and offer to trigger candidates
      rtc.createDataChannel('');
      rtc.createOffer()
        .then(offer => rtc.setLocalDescription(offer))
        .catch(() => resolve([]));

      // Set timeout in case no viable candidates are found
      setTimeout(() => {
        rtc.close();
        if (ipAddresses.length > 0) {
          // Return all collected IPs
          resolve(ipAddresses.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP'));
        } else {
          resolve([]);
        }
      }, 3000);
    } catch (error) {
      console.error('Error getting IPs with WebRTC:', error);
      resolve([]);
    }
  });
}

// For backward compatibility
function getPrivateIPWithWebRTC() {
  return new Promise((resolve) => {
    getAllIPsWithWebRTC()
      .then(ips => {
        if (ips && ips.length > 0) {
          // Prefer non-private IP
          const nonPrivateIP = ips.find(ip => 
            !ip.startsWith('10.') && 
            !ip.startsWith('172.16.') &&
            !ip.startsWith('172.17.') &&
            !ip.startsWith('172.18.') &&
            !ip.startsWith('172.19.') &&
            !ip.startsWith('172.2') &&
            !ip.startsWith('172.30.') &&
            !ip.startsWith('172.31.') &&
            !ip.startsWith('192.168.')
          );
          
          resolve(nonPrivateIP || ips[0]);
        } else {
          resolve('Not available');
        }
      })
      .catch(error => {
        console.error('Error in getPrivateIPWithWebRTC:', error);
        resolve('Not available');
      });
  });
}

// Function to categorize IPs by type
function categorizeIPs(ips) {
  const result = {
    docker: null,
    nonPrivate: null,
    private: null
  };
  
  if (!ips || ips.length === 0) {
    return result;
  }
  
  // Look for Docker IP (172.17.x.x)
  const dockerIP = ips.find(ip => ip.startsWith('172.17.'));
  if (dockerIP) {
    result.docker = dockerIP;
  }
  
  // Look for non-private IP
  const nonPrivateIP = ips.find(ip => 
    !ip.startsWith('10.') && 
    !ip.startsWith('172.16.') &&
    !ip.startsWith('172.17.') &&
    !ip.startsWith('172.18.') &&
    !ip.startsWith('172.19.') &&
    !ip.startsWith('172.2') &&
    !ip.startsWith('172.30.') &&
    !ip.startsWith('172.31.') &&
    !ip.startsWith('192.168.')
  );
  if (nonPrivateIP) {
    result.nonPrivate = nonPrivateIP;
  }
  
  // Look for private IP (10.x.x.x, 172.16.x.x-172.31.x.x except 172.17.x.x, 192.168.x.x)
  const privateIP = ips.find(ip => 
    ip.startsWith('10.') || 
    ip.startsWith('172.16.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('192.168.')
  );
  if (privateIP) {
    result.private = privateIP;
  }
  
  return result;
}

// Function to update IP addresses
async function updateIPAddresses() {
  const publicIPElement = document.getElementById('publicIP');
  const dockerIPElement = document.getElementById('dockerIP');
  const nonPrivateIPElement = document.getElementById('nonPrivateIP');
  const privateIPElement = document.getElementById('privateIP');

  // Update public IP
  publicIPElement.textContent = 'Loading...';
  const publicIP = await getPublicIP();
  publicIPElement.textContent = formatIP(publicIP);

  // Set all private IP sections to loading
  dockerIPElement.textContent = 'Loading...';
  nonPrivateIPElement.textContent = 'Loading...';
  privateIPElement.textContent = 'Loading...';

  // Get all private IPs
  const privateIPs = await getAllPrivateIPs();
  
  // Update Docker IP
  if (privateIPs.docker) {
    dockerIPElement.textContent = formatIP(privateIPs.docker);
  } else {
    dockerIPElement.textContent = 'None detected';
  }
  
  // Update non-private IP
  if (privateIPs.nonPrivate) {
    nonPrivateIPElement.textContent = formatIP(privateIPs.nonPrivate);
  } else {
    nonPrivateIPElement.textContent = 'None detected';
  }
  
  // Update private IP
  if (privateIPs.private) {
    privateIPElement.textContent = formatIP(privateIPs.private);
  } else {
    privateIPElement.textContent = 'None detected';
  }
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

// Save portal configuration with auto-detection
async function savePortalConfig() {
  try {
    const email = portalEmailInput.value;
    
    // Validate email
    if (!email || !email.includes('@')) {
      portalStatusText.textContent = 'Please enter a valid email';
      return;
    }
    
    // Show loading state
    savePortalConfigBtn.disabled = true;
    savePortalConfigBtn.textContent = 'Configuring...';
    portalStatusText.textContent = 'Detecting settings...';
    
    // Save to database and auto-detect settings
    const response = await fetch('http://localhost:3000/api/portal-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portal_type: 'company',
        email: email
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save settings');
    }

    const data = await response.json();
    
    // Update UI with detected settings
    if (data.success && data.settings) {
      // Save to Chrome storage
      await chrome.storage.local.set({
        portalEmail: email,
        portalURL: data.settings.portal,
        portalSettings: data.settings
      });
      
      portalStatusText.textContent = 'Settings configured successfully';
      portalStatusDot.className = 'status-dot connected';
      
      // Check portal status after save
      await checkPortalStatus();
    }
  } catch (error) {
    console.error('Error saving portal configuration:', error);
    portalStatusText.textContent = 'Error saving settings';
    portalStatusDot.className = 'status-dot disconnected';
  } finally {
    // Re-enable button
    savePortalConfigBtn.disabled = false;
    savePortalConfigBtn.textContent = 'Save';
  }
}

// Partner portal configuration with auto-detection
async function savePartnerPortalConfig() {
  try {
    const email = partnerPortalEmailInput.value;
    
    // Validate email
    if (!email || !email.includes('@')) {
      partnerPortalStatusText.textContent = 'Please enter a valid email';
      return;
    }
    
    // Show loading state
    savePartnerPortalConfigBtn.disabled = true;
    savePartnerPortalConfigBtn.textContent = 'Configuring...';
    partnerPortalStatusText.textContent = 'Detecting settings...';
    
    // Save to database and auto-detect settings
    const response = await fetch('http://localhost:3000/api/portal-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portal_type: 'partner',
        email: email
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save settings');
    }

    const data = await response.json();
    
    // Update UI with detected settings
    if (data.success && data.settings) {
      // Save to Chrome storage
      await chrome.storage.local.set({
        partnerPortalEmail: email,
        partnerPortalURL: data.settings.portal,
        partnerPortalSettings: data.settings
      });
      
      partnerPortalStatusText.textContent = 'Settings configured successfully';
      partnerPortalStatusDot.className = 'status-dot connected';
      
      // Check portal status after save
      await checkPartnerPortalStatus();
    }
  } catch (error) {
    console.error('Error saving partner portal configuration:', error);
    partnerPortalStatusText.textContent = 'Error saving settings';
    partnerPortalStatusDot.className = 'status-dot disconnected';
  } finally {
    // Re-enable button
    savePartnerPortalConfigBtn.disabled = false;
    savePartnerPortalConfigBtn.textContent = 'Save';
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
    
    // Check if email is configured
    chrome.storage.local.get(['portalURL', 'portalEmail'], result => {
      if (!result.portalURL || result.portalURL.trim() === '') {
        portalStatusText.textContent = 'Portal URL not configured';
      } else if (!result.portalEmail || result.portalEmail.trim() === '') {
        portalStatusText.textContent = 'Email not configured';
      } else {
        portalStatusText.textContent = 'Not connected to portal';
      }
    });
  }
}

// Partner Portal-related functions

// Open partner portal in new tab
async function openPartnerPortal() {
  try {
    // Disable button temporarily
    partnerPortalLoginBtn.disabled = true;
    partnerPortalLoginBtn.textContent = 'Opening...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'openPartnerPortal'
      }, resolve);
    });
    
    if (!response || !response.success) {
      // Handle error
      partnerPortalStatusText.textContent = response ? response.message : 'Failed to open partner portal';
      console.error('Failed to open partner portal:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error opening partner portal:', error);
    partnerPortalStatusText.textContent = 'Error opening partner portal';
  } finally {
    // Re-enable button
    partnerPortalLoginBtn.disabled = false;
    partnerPortalLoginBtn.textContent = 'Open Partner Portal';
  }
}

// Check partner portal login status
async function checkPartnerPortalStatus() {
  try {
    // Update UI to show checking
    partnerPortalStatusDot.className = 'status-dot';
    partnerPortalStatusText.textContent = 'Checking partner portal status...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'checkPartnerPortalLogin'
      }, resolve);
    });
    
    if (response && response.success) {
      // Update UI based on login status
      updatePartnerPortalStatusUI(response.loggedIn);
    } else {
      // Handle error
      partnerPortalStatusDot.className = 'status-dot';
      partnerPortalStatusText.textContent = response ? response.message : 'Failed to check partner portal status';
      console.error('Failed to check partner portal status:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error checking partner portal status:', error);
    partnerPortalStatusDot.className = 'status-dot';
    partnerPortalStatusText.textContent = 'Error checking partner portal status';
  }
}

// Update partner portal status UI
function updatePartnerPortalStatusUI(isLoggedIn) {
  if (isLoggedIn) {
    partnerPortalStatusDot.className = 'status-dot connected';
    partnerPortalStatusText.textContent = 'Connected to partner portal';
  } else {
    partnerPortalStatusDot.className = 'status-dot disconnected';
    
    // Check if email is configured
    chrome.storage.local.get(['partnerPortalURL', 'partnerPortalEmail'], result => {
      if (!result.partnerPortalURL || result.partnerPortalURL.trim() === '') {
        partnerPortalStatusText.textContent = 'Partner portal URL not configured';
      } else if (!result.partnerPortalEmail || result.partnerPortalEmail.trim() === '') {
        partnerPortalStatusText.textContent = 'Email not configured';
      } else {
        partnerPortalStatusText.textContent = 'Not connected to partner portal';
      }
    });
  }
}

