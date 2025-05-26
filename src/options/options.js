// Default settings
const DEFAULT_SETTINGS = {
  companyEmail: '',
  partnerEmail: '',
  enableProtection: true,
  enableNotifications: true,
  checkInterval: 300000 // 5 minutes
};

// DOM Elements
const elements = {
  companyEmail: document.getElementById('companyEmail'),
  partnerEmail: document.getElementById('partnerEmail'),
  enableProtection: document.getElementById('enableProtection'),
  enableNotifications: document.getElementById('enableNotifications'),
  checkInterval: document.getElementById('checkInterval'),
  saveButton: document.getElementById('save'),
  resetButton: document.getElementById('reset')
};

// Load settings from storage
async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  
  elements.companyEmail.value = settings.companyEmail;
  elements.partnerEmail.value = settings.partnerEmail;
  elements.enableProtection.checked = settings.enableProtection;
  elements.enableNotifications.checked = settings.enableNotifications;
  elements.checkInterval.value = settings.checkInterval;
}

// Save settings to storage
async function saveSettings() {
  const settings = {
    companyEmail: elements.companyEmail.value,
    partnerEmail: elements.partnerEmail.value,
    enableProtection: elements.enableProtection.checked,
    enableNotifications: elements.enableNotifications.checked,
    checkInterval: parseInt(elements.checkInterval.value)
  };

  await chrome.storage.local.set(settings);
  
  // Notify background script about settings change
  chrome.runtime.sendMessage({
    action: 'settingsUpdated',
    settings
  });
}

// Reset settings to defaults
async function resetSettings() {
  await chrome.storage.local.set(DEFAULT_SETTINGS);
  loadSettings();
  
  // Notify background script about settings reset
  chrome.runtime.sendMessage({
    action: 'settingsUpdated',
    settings: DEFAULT_SETTINGS
  });
}

// Event Listeners
elements.saveButton.addEventListener('click', saveSettings);
elements.resetButton.addEventListener('click', resetSettings);

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);

