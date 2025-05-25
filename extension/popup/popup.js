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
  function refreshStatus() {
    // Disable refresh button temporarily
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'refreshStatus'
    }, function(response) {
      if (response && response.success) {
        updateUI(response.enabled, response.statusType);
        
        // Update toggle state
        protectionToggle.checked = response.enabled;
      } else {
        // Handle error
        console.error('Failed to refresh status');
      }
      
      // Re-enable refresh button
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Status';
    });
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

