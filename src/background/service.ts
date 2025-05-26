import { ChromeDriver } from '@/lib/chrome/driver';
import { portalService } from '../lib/services/portal.service';
import { storageService } from '../lib/services/storage.service';
import { ProtectionService } from './protection.service';
import type { PortalConfig, PortalLoginStatus } from '../lib/chrome/types';
import type { MessageHandler, MessageResponse, ProtectionStatus } from './types';


export class BackgroundService {
  private static readonly CHECK_INTERVALS = {
    PORTAL: 5 * 60 * 1000,    // 5 minutes
    PROTECTION: 60 * 1000,    // 1 minute
    NETWORK: 30 * 1000        // 30 seconds
  };

  private portalCheckInterval: NodeJS.Timeout | null = null;
  private protectionCheckInterval: NodeJS.Timeout | null = null;
  private networkCheckInterval: NodeJS.Timeout | null = null;
  private driver: ChromeDriver;
  private protectionService: ProtectionService;
  private lastProtectionStatus: ProtectionStatus | null = null;

  constructor() {
    this.driver = new ChromeDriver();
    this.protectionService = new ProtectionService(this.driver);
    this.setupMessageListeners();
    this.setupPeriodicChecks();
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then((response: MessageResponse) => {
            sendResponse(response);
            // Handle status updates
            if (message.action.includes('Protection') && response.data?.status) {
              this.handleProtectionStatusChange(response.data.status);
            }
          })
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers: { [key: string]: MessageHandler } = {
    // Portal related actions
    checkPortalStatus: async (msg: { type: 'company' | 'partner' }) => {
      const status = await this.handlePortalStatusCheck(msg.type);
      return { success: true, data: { status } };
    },
    configurePortal: async (msg: { config: PortalConfig }) => {
      const status = await this.handlePortalConfiguration(msg.config);
      return { success: status.success, data: { status } };
    },
    savePortalSettings: async (msg: { settings: PortalConfig }) => {
      await this.handlePortalSettings(msg.settings);
      return { success: true };
    },

    // Protection related actions
    toggleProtection: async (msg: { enabled: boolean }) => {
      const status = await this.protectionService.toggleProtection(msg.enabled);
      return { success: true, data: { status } };
    },
    getProtectionStatus: async () => {
      const status = await this.protectionService.getStatus();
      return { success: true, data: { status } };
    },
    checkProtectionStatus: async () => {
      const status = await this.protectionService.checkStatus();
      return { success: true, data: { status } };
    },
    checkNetworkStatus: async () => {
      const status = await this.protectionService.checkNetworkStatus();
      return { success: true, data: { status } };
    },
    getNetworkStatus: async () => {
      const status = await this.protectionService.getNetworkStatus();
      return { success: true, data: { status } };
    }
  };

  private setupPeriodicChecks() {
    // Clear existing intervals
    [
      this.portalCheckInterval,
      this.protectionCheckInterval,
      this.networkCheckInterval
    ].forEach(interval => {
      if (interval) clearInterval(interval);
    });

    // Set up checks
    this.portalCheckInterval = setInterval(
      () => this.checkAllPortals(),
      BackgroundService.CHECK_INTERVALS.PORTAL
    );

    this.protectionCheckInterval = setInterval(
      () => this.checkProtectionStatus(),
      BackgroundService.CHECK_INTERVALS.PROTECTION
    );

    this.networkCheckInterval = setInterval(
      () => this.checkNetworkStatus(),
      BackgroundService.CHECK_INTERVALS.NETWORK
    );

    // Initial checks
    this.checkAllPortals();
    this.checkProtectionStatus();
    this.checkNetworkStatus();
  }

  private async checkProtectionStatus() {
    try {
      const status = await this.protectionService.checkStatus();
      this.handleProtectionStatusChange(status);
    } catch (error) {
      console.error('Error checking protection status:', error);
    }
  }

  private async checkNetworkStatus() {
    try {
      const status = await this.protectionService.checkNetworkStatus();
      if (status.type !== 'protected') {
        this.handleProtectionStatusChange({
          enabled: this.lastProtectionStatus?.enabled ?? true,
          type: status.type,
          message: 'Network connectivity issue detected',
          networkConnected: false,
          lastCheck: new Date(),
          error: status.error,
          details: status.details
        });
      }
    } catch (error) {
      console.error('Error checking network status:', error);
    }
  }

  private handleProtectionStatusChange(newStatus: ProtectionStatus) {
    // Only handle actual changes
    if (!this.lastProtectionStatus || 
        JSON.stringify(newStatus) !== JSON.stringify(this.lastProtectionStatus)) {
      this.lastProtectionStatus = newStatus;

      // Update badge and icon
      this.updateExtensionBadge(newStatus);

      // Show notification for important changes
      if (newStatus.type === 'error' || newStatus.type === 'alert') {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-48.png',
          title: 'Protection Status Update',
          message: newStatus.message
        });
      }
    }
  }

  private updateExtensionBadge(status: ProtectionStatus) {
    const badgeColors = {
      protected: '#4CAF50',
      error: '#F44336',
      alert: '#FF9800'
    };

    chrome.action.setBadgeBackgroundColor({ 
      color: badgeColors[status.type] 
    });
    chrome.action.setBadgeText({ 
      text: status.enabled ? '' : '!' 
    });
    chrome.action.setIcon({ 
      path: `/icons/icon-${status.type}-48.png` 
    });
  }

  private async checkAllPortals() {
    try {
      const [companyConfig, partnerConfig] = await Promise.all([
        storageService.getPortalConfig('company'),
        storageService.getPortalConfig('partner')
      ]);

      const results: { [key: string]: PortalLoginStatus } = {};

      if (companyConfig) {
        results.company = await portalService.checkPortalStatus(companyConfig);
        await storageService.updateLastChecked('company');
      }

      if (partnerConfig) {
        results.partner = await portalService.checkPortalStatus(partnerConfig);
        await storageService.updateLastChecked('partner');
      }

      this.handlePortalStatusNotifications(results);
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  private async handlePortalStatusCheck(type: 'company' | 'partner'): Promise<PortalLoginStatus> {
    const config = await storageService.getPortalConfig(type);
    if (!config) {
      return {
        success: false,
        loggedIn: false,
        message: 'Portal not configured'
      };
    }

    const status = await portalService.checkPortalStatus(config);
    await storageService.updateLastChecked(type);
    return status;
  }

  private async handlePortalConfiguration(config: PortalConfig): Promise<PortalLoginStatus> {
    const status = await portalService.configurePortal(config);
    if (status.success) {
      await storageService.savePortalConfig(config);
    }
    return status;
  }

  private async handlePortalSettings(settings: PortalConfig): Promise<void> {
    await storageService.savePortalConfig(settings);
  }

  private handlePortalStatusNotifications(results: { [key: string]: PortalLoginStatus }) {
    const issues = Object.entries(results)
      .filter(([_, status]) => !status.success || !status.loggedIn)
      .map(([type, status]) => `${type}: ${status.message}`);

    if (issues.length > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: 'Portal Status Update',
        message: issues.join('\n')
      });
    }
  }

  async cleanup() {
    [
      this.portalCheckInterval,
      this.protectionCheckInterval,
      this.networkCheckInterval
    ].forEach(interval => {
      if (interval) {
        clearInterval(interval);
      }
    });

    this.portalCheckInterval = null;
    this.protectionCheckInterval = null;
    this.networkCheckInterval = null;
    
    await Promise.all([
      portalService.cleanup(),
      this.protectionService.cleanup()
    ]);
  }
}

// Create and export singleton instance
export const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

