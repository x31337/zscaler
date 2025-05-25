// Zscaler Chrome Extension - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  // Get UI elements
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const statusDescription = document.getElementById('statusDescription');
  const protectionToggle = document.getElementById('protectionToggle');
  const refreshBtn = document.getElementById('refreshBtn');
  const cloudName = document.getElementById('cloudName');
  const userName = document.getElementById('userName');
  
  // Initialize popup with current state
  initializePopup();
  
  // Add event listeners
  protectionToggle.addEventListener('change', toggleProtection);
  refreshBtn.addEventListener('click', refreshStatus);
  
  // Function to initialize popup with current state
  function initializePopup() {
    chrome.storage.local.get(['protectionEnabled', 'statusType', 'cloudName', 'userName'], function(result) {
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
      
      // Update IP addresses
      updateIPAddresses();
    });
  }
  
  // Function to toggle protection
  function toggleProtection() {
    const enabled = protectionToggle.checked;
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'toggleProtection',
      enabled: enabled
    }, function(response) {
      if (response && response.success) {
        updateUI(enabled, response.statusType);
      } else {
        // Handle error
        console.error('Failed to toggle protection');
        // Revert toggle if operation failed
        protectionToggle.checked = !enabled;
      }
    });
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

// Function to get public IP
async function getPublicIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
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
            resolve(ip);
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
  publicIPElement.textContent = publicIP;

  // Update private IP
  privateIPElement.textContent = 'Loading...';
  const privateIP = await getPrivateIP();
  privateIPElement.textContent = privateIP;
}

