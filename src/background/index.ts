import { ChromeDriver } from '@/lib/chrome/driver';
import { storageService } from '@/lib/services/storage.service';
import type { PortalSettings } from '@/lib/api/portal';
import type { PortalType } from './types';

// Types and Interfaces
export interface ProtectionStatus {
  enabled: boolean;
  type: 'protected' | 'error' | 'alert';
  message: string;
}

interface NetworkStatus {
  type: 'protected' | 'error' | 'alert';
  details?: unknown;
}

interface MessageHandlers {
  checkPortalStatus: (msg: { type: PortalType }) => Promise<any>;
  configurePortal: (msg: { config: PortalSettings & { url: string } }) => Promise<any>;
  savePortalSettings: (msg: { settings: PortalSettings }) => Promise<any>;
  toggleProtection: (msg: { enabled: boolean }) => Promise<ProtectionStatus>;
  getProtectionStatus: () => Promise<ProtectionStatus>;
}

// Constants
const ZSCALER_SETTINGS = {
  company: {
    base: 'zscaler.net',
    portal: 'admin.zscaler.net',
    api: 'api.zscaler.net'
  },
  partner: {
    base: 'zscalerpartner.net', 
    portal: 'partner.zscaler.net',
    api: 'api.zscalerpartner.net'
  }
} as const;

class BackgroundService {
  private static readonly CHECK_INTERVALS = {
    PORTAL: 5 * 60 * 1000,     // 5 minutes
    PROTECTION: 60 * 1000,     // 1 minute
    NETWORK: 30 * 1000         // 30 seconds
  };

  private driver: ChromeDriver | null = null;
  private intervals: { [key: string]: NodeJS.Timeout | null } = {
    portal: null,
    protection: null,
    network: null
  };

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      await this.initializeDriver();
      await this.initializeProtectionState();
      this.setupMessageListeners();
      this.setupPeriodicChecks();
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private async initializeDriver() {
    this.driver = new ChromeDriver();
    await this.driver.init();
  }

  private async initializeProtectionState() {
    const settings = await storageService.getAllSettings();
    const enabled = settings.protectionEnabled ?? true;
    const type = settings.statusType ?? 'protected';

    await this.updateProtectionState({
      enabled,
      type,
      message: this.getStatusMessage(enabled, type)
    });
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers: MessageHandlers = {
    checkPortalStatus: async (msg) => this.handlePortalStatusCheck(msg.type),
    configurePortal: async (msg) => this.handlePortalConfiguration(msg.config),
    savePortalSettings: async (msg) => this.handleSavePortalSettings(msg.settings),
    toggleProtection: async (msg) => this.handleToggleProtection(msg.enabled),
    getProtectionStatus: async () => this.getProtectionStatus()
  };

  private setupPeriodicChecks() {
    // Clear existing intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    // Set up new intervals
    this.intervals.portal = setInterval(
      () => this.checkAllPortals(),
      BackgroundService.CHECK_INTERVALS.PORTAL
    );

    this.intervals.protection = setInterval(
      () => this.checkProtectionStatus(),
      BackgroundService.CHECK_INTERVALS.PROTECTION
    );

    this.intervals.network = setInterval(
      () => this.checkNetworkStatus(),
      BackgroundService.CHECK_INTERVALS.NETWORK
    );

    // Initial checks
    this.checkAllPortals();
    this.checkProtectionStatus();
    this.checkNetworkStatus();
  }

  private async checkAllPortals() {
    try {
      const [companyConfig, partnerConfig] = await Promise.all([
        storageService.getPortalConfig('company'),
        storageService.getPortalConfig('partner')
      ]);

      const results: Record<string, any> = {};

      if (companyConfig) {
        results.company = await this.handlePortalStatusCheck('company');
        await storageService.updateLastChecked('company');
      }

      if (partnerConfig) {
        results.partner = await this.handlePortalStatusCheck('partner');
        await storageService.updateLastChecked('partner');
      }

      this.handlePortalStatusNotifications(results);
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  private async checkProtectionStatus(): Promise<ProtectionStatus> {
    try {
      const settings = await storageService.getAllSettings();
      const enabled = settings.protectionEnabled ?? true;
      const networkStatus = await this.checkNetworkStatus();

      const status: ProtectionStatus = {
        enabled,
        type: networkStatus.type,
        message: this.getStatusMessage(enabled, networkStatus.type)
      };

      await this.updateProtectionState(status);
      return status;
    } catch (error) {
      console.error('Error checking protection status:', error);
      return {
        enabled: false,
        type: 'error',
        message: 'Error checking protection status'
      };
    }
  }

  private async checkNetworkStatus(): Promise<NetworkStatus> {
    try {
      // Simple connectivity check
      const response = await fetch('https://www.google.com/generate_204');
      return {
        type: response.status === 204 ? 'protected' : 'error',
        details: { status: response.status }
      };
    } catch (error) {
      console.error('Network check failed:', error);
      return { type: 'error', details: error };
    }
  }

  private async getProtectionStatus(): Promise<ProtectionStatus> {
    const settings = await storageService.getAllSettings();
    return {
      enabled: settings.protectionEnabled ?? true,
      type: settings.statusType ?? 'protected',
      message: this.getStatusMessage(
        settings.protectionEnabled ?? true,
        settings.statusType ?? 'protected'
      )
    };
  }

  private async handlePortalStatusCheck(type: PortalType) {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const settings = await storageService.getPortalConfig(type);
    if (!settings) {
      return {
        success: false,
        loggedIn: false,
        message: 'Portal not configured'
      };
    }

    return await this.driver.checkPortalStatus(settings.url);
  }

  private async handlePortalConfiguration(config: PortalSettings & { url: string }) {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const result = await this.driver.fillLoginForm(config.url, config.email);
    if (!result) throw new Error('Failed to configure portal');

    await storageService.savePortalConfig(config);
    return { success: true };
  }

  private async handleSavePortalSettings(settings: PortalSettings) {
    const domain = settings.email.split('@')[1];
    const portalSettings = settings.type === 'company' 
      ? ZSCALER_SETTINGS.company 
      : ZSCALER_SETTINGS.partner;

    const customSettings = {
      ...portalSettings,
      portal: `${domain}.${portalSettings.base}`
    };

    await storageService.savePortalConfig({
      type: settings.type,
      email: settings.email,
      url: customSettings.portal
    });

    return { success: true, settings: customSettings };
  }

  private async handleToggleProtection(enabled: boolean): Promise<ProtectionStatus> {
    const networkStatus = await this.checkNetworkStatus();
    const status: ProtectionStatus = {
      enabled,
      type: enabled ? networkStatus.type : 'error',
      message: this.getStatusMessage(enabled, networkStatus.type)
    };

    await this.updateProtectionState(status);
    return status;
  }

  private async updateProtectionState(status: ProtectionStatus) {
    await storageService.saveProtectionStatus(status);
    this.updateIcon(status.enabled, status.type);
  }

  private updateIcon(enabled: boolean, type: string) {
    const iconPath = this.getIconPath(enabled, type);
    chrome.action.setIcon({ path: iconPath });
  }

  private getIconPath(enabled: boolean, type: string) {
    const sizes = { '16': '', '48': '', '128': '' };
    const base = enabled ? 'icon-enabled' : 'icon-disabled';
    const suffix = type === 'error' ? '-error' : 
                  type === 'alert' ? '-alert' : 
                  '';

    Object.keys(sizes).forEach(size => {
      sizes[size as keyof typeof sizes] = `/icons/${base}${suffix}-${size}.png`;
    });

    return sizes;
  }

  private getStatusMessage(enabled: boolean, type: string): string {
    if (!enabled) return 'Protection is disabled';
    
    switch (type) {
      case 'error':
        return 'Protection error detected';
      case 'alert':
        return 'Protection active with warnings';
      default:
        return 'Protection active';
    }
  }

  private handlePortalStatusNotifications(results: Record<string, any>) {
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
    Object.entries(this.intervals).forEach(([key, interval]) => {
      if (interval) {
        clearInterval(interval);
        this.intervals[key] = null;
      }
    });

    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };

import { ChromeDriver } from '@/lib/chrome/driver';
import { PortalService } from './portal.service';
import { ProtectionService } from './protection.service';
import type { MessageHandlers } from './types';

class BackgroundService {
  private driver: ChromeDriver;
  private portalService: PortalService;
  private protectionService: ProtectionService;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize Chrome driver
      this.driver = new ChromeDriver();
      await this.driver.init();

      // Initialize services
      this.portalService = new PortalService(this.driver);
      this.protectionService = new ProtectionService(this.driver);

      // Setup message listeners
      this.setupMessageListeners();

      console.log('Background service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep message channel open
      }
      return false;
    });
  }

  private readonly messageHandlers: MessageHandlers = {
    // Portal related actions
    checkPortalStatus: (msg: any) => this.portalService.checkStatus(msg.type),
    configurePortal: (msg: any) => this.portalService.configure(msg.config),
    savePortalSettings: (msg: any) => this.portalService.saveSettings(msg.settings),

    // Protection related actions
    toggleProtection: (msg: any) => this.protectionService.toggleProtection(msg.enabled),
    getProtectionStatus: () => this.protectionService.getStatus(),
    checkProtectionStatus: () => this.protectionService.checkStatus()
  };

  // Helper method to handle errors in responses
  private handleError = (error: Error) => ({
    success: false,
    error: error.message
  });

  async cleanup() {
    await Promise.all([
      this.portalService.cleanup(),
      this.protectionService.cleanup(),
      this.driver.close()
    ]);
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };

import { ChromeDriver } from '@/lib/chrome/driver';
import { PortalService } from './portal.service';
import { ProtectionService } from './protection.service';
import type { MessageHandlers } from './types';

class BackgroundService {
  private static readonly CHECK_INTERVALS = {
    PORTAL: 5 * 60 * 1000,    // 5 minutes
    PROTECTION: 60 * 1000     // 1 minute
  };

  private driver: ChromeDriver;
  private portalService: PortalService;
  private protectionService: ProtectionService;
  private intervals: { [key: string]: NodeJS.Timeout | null } = {
    portal: null,
    protection: null
  };

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize Chrome driver
      this.driver = new ChromeDriver();
      await this.driver.init();

      // Initialize services
      this.portalService = new PortalService(this.driver);
      this.protectionService = new ProtectionService(this.driver);

      // Setup message handlers and periodic checks
      this.setupMessageListeners();
      this.setupPeriodicChecks();
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers: MessageHandlers = {
    // Portal related actions
    checkPortalStatus: (msg: any) => 
      this.portalService.checkStatus(msg.type),
    configurePortal: (msg: any) => 
      this.portalService.configure(msg.config),
    savePortalSettings: (msg: any) => 
      this.portalService.saveSettings(msg.settings),

    // Protection related actions
    toggleProtection: (msg: any) => 
      this.protectionService.toggleProtection(msg.enabled),
    getProtectionStatus: () => 
      this.protectionService.getStatus(),
    checkProtectionStatus: () => 
      this.protectionService.checkStatus()
  };

  private setupPeriodicChecks() {
    // Clear existing intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    // Set up new intervals
    this.intervals.portal = setInterval(
      () => this.portalService.checkStatus('company'),
      BackgroundService.CHECK_INTERVALS.PORTAL
    );

    this.intervals.protection = setInterval(
      () => this.protectionService.checkStatus(),
      BackgroundService.CHECK_INTERVALS.PROTECTION
    );

    // Initial checks
    this.portalService.checkStatus('company');
    this.protectionService.checkStatus();
  }

  async cleanup() {
    Object.entries(this.intervals).forEach(([key, interval]) => {
      if (interval) {
        clearInterval(interval);
        this.intervals[key] = null;
      }
    });

    if (this.driver) {
      await this.driver.close();
    }
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };

import { ChromeDriver } from '@/lib/chrome/driver';
import { PortalService } from './portal.service';
import { ProtectionService } from './protection.service';
import type { PortalType } from './types';

interface MessageHandlers {
  [key: string]: (msg: any) => Promise<any>;
}

class BackgroundService {
  private driver: ChromeDriver;
  private portalService: PortalService;
  private protectionService: ProtectionService;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize Chrome driver
      this.driver = new ChromeDriver();
      await this.driver.init();

      // Initialize services
      this.portalService = new PortalService(this.driver);
      this.protectionService = new ProtectionService(this.driver);

      // Setup message listeners
      this.setupMessageListeners();
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers: MessageHandlers = {
    // Portal related actions
    checkPortalStatus: async (msg: { type: PortalType }) => 
      this.portalService.checkStatus(msg.type),
    
    configurePortal: async (msg: { config: any }) => 
      this.portalService.configure(msg.config),
    
    savePortalSettings: async (msg: { settings: any }) => 
      this.portalService.saveSettings(msg.settings),

    // Protection related actions
    toggleProtection: async (msg: { enabled: boolean }) => 
      this.protectionService.toggleProtection(msg.enabled),
    
    getProtectionStatus: async () => 
      this.protectionService.getStatus(),
    
    checkProtectionStatus: async () => 
      this.protectionService.checkStatus()
  };

  async cleanup() {
    await Promise.all([
      this.portalService.cleanup(),
      this.protectionService.cleanup(),
      this.driver.close()
    ]);
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };
  message: string;
}

interface NetworkStatus {
  type: 'protected' | 'error' | 'alert';
  details?: unknown;
}

const ZSCALER_SETTINGS = {
  company: {
    base: 'zscaler.net',
    portal: 'admin.zscaler.net',
    api: 'api.zscaler.net'
  },
  partner: {
    base: 'zscalerpartner.net',
    portal: 'partner.zscaler.net',
    api: 'api.zscalerpartner.net'
  }
} as const;

class BackgroundService {
  private static readonly CHECK_INTERVALS = {
    PORTAL: 5 * 60 * 1000,    // 5 minutes
    PROTECTION: 60 * 1000,    // 1 minute
    NETWORK: 30 * 1000        // 30 seconds
  };

  private driver: ChromeDriver | null = null;
  private intervals: { [key: string]: NodeJS.Timeout | null } = {
    portal: null,
    protection: null,
    network: null
  };

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      await this.initializeDriver();
      await this.initializeState();
      this.setupMessageListeners();
      this.setupPeriodicChecks();
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private async initializeDriver() {
    this.driver = new ChromeDriver();
    await this.driver.init();
  }

  private async initializeState() {
    const settings = await storageService.getAllSettings();
    await this.updateProtectionState({
      enabled: settings.protectionEnabled ?? true,
      type: settings.statusType ?? 'protected',
      message: 'Initializing protection...'
    });
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers = {
    checkPortalStatus: (msg: any) => this.handlePortalStatusCheck(msg.type),
    configurePortal: (msg: any) => this.handlePortalConfiguration(msg.config),
    toggleProtection: (msg: any) => this.handleToggleProtection(msg.enabled),
    getProtectionStatus: () => this.getProtectionStatus()
  };

  private setupPeriodicChecks() {
    // Clear existing intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    // Set up new intervals
    this.intervals.portal = setInterval(
      () => this.checkAllPortals(),
      BackgroundService.CHECK_INTERVALS.PORTAL
    );

    this.intervals.protection = setInterval(
      () => this.checkProtectionStatus(),
      BackgroundService.CHECK_INTERVALS.PROTECTION
    );

    this.intervals.network = setInterval(
      () => this.checkNetworkStatus(),
      BackgroundService.CHECK_INTERVALS.NETWORK
    );

    // Initial checks
    this.checkAllPortals();
    this.checkProtectionStatus();
    this.checkNetworkStatus();
  }

  private async checkAllPortals() {
    try {
      const configs = await Promise.all([
        storageService.getPortalConfig('company'),
        storageService.getPortalConfig('partner')
      ]);

      const results = await Promise.all(
        configs.map(async (config, index) => {
          if (!config) return null;
          const type = index === 0 ? 'company' : 'partner';
          const status = await this.handlePortalStatusCheck(type);
          await storageService.updateLastChecked(type);
          return { type, status };
        })
      );

      this.handlePortalStatusNotifications(
        results.filter(Boolean).reduce((acc, curr) => ({
          ...acc,
          [curr!.type]: curr!.status
        }), {})
      );
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  private async checkProtectionStatus() {
    try {
      const settings = await storageService.getAllSettings();
      const enabled = settings.protectionEnabled ?? true;
      const networkStatus = await this.checkNetworkStatus();

      await this.updateProtectionState({
        enabled,
        type: networkStatus.type,
        message: this.getStatusMessage(enabled, networkStatus.type)
      });
    } catch (error) {
      console.error('Error checking protection status:', error);
    }
  }

  private async checkNetworkStatus(): Promise<NetworkStatus> {
    try {
      // TODO: Implement actual network check logic
      return { type: 'protected' };
    } catch (error) {
      console.error('Network check failed:', error);
      return { type: 'error', details: error };
    }
  }

  private async handlePortalStatusCheck(type: 'company' | 'partner') {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const settings = await storageService.getPortalConfig(type);
    if (!settings) {
      return {
        success: false,
        loggedIn: false,
        message: 'Portal not configured'
      };
    }

    return await this.driver.checkPortalStatus(settings.url);
  }

  private async handlePortalConfiguration(config: PortalSettings) {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const result = await this.driver.fillLoginForm(config.url, config.email);
    if (!result) throw new Error('Failed to configure portal');

    await storageService.savePortalConfig(config);
    return { success: true };
  }

  private async handleToggleProtection(enabled: boolean): Promise<ProtectionStatus> {
    const networkStatus = await this.checkNetworkStatus();
    const status: ProtectionStatus = {
      enabled,
      type: enabled ? networkStatus.type : 'error',
      message: this.getStatusMessage(enabled, networkStatus.type)
    };

    await this.updateProtectionState(status);
    return status;
  }

  private async updateProtectionState(status: ProtectionStatus) {
    await storageService.saveProtectionStatus(status);
    this.updateIcon(status.enabled, status.type);
  }

  private updateIcon(enabled: boolean, type: string) {
    const iconPath = this.getIconPath(enabled, type);
    chrome.action.setIcon({ path: iconPath });
  }

  private getIconPath(enabled: boolean, type: string) {
    const sizes = { 16: '', 48: '', 128: '' };
    const base = enabled ? 'icon-enabled' : 'icon-disabled';
    const suffix = type === 'error' ? '-error' : 
                  type === 'alert' ? '-alert' : 
                  '';

    Object.keys(sizes).forEach(size => {
      sizes[size as keyof typeof sizes] = `/icons/${base}${suffix}-${size}.png`;
    });

    return sizes;
  }

  private getStatusMessage(enabled: boolean, type: string): string {
    if (!enabled) return 'Protection is disabled';
    
    switch (type) {
      case 'error':
        return 'Protection error detected';
      case 'alert':
        return 'Protection active with warnings';
      default:
        return 'Protection active';
    }
  }

  private handlePortalStatusNotifications(results: Record<string, any>) {
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
    Object.entries(this.intervals).forEach(([key, interval]) => {
      if (interval) {
        clearInterval(interval);
        this.intervals[key] = null;
      }
    });

    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };

import { ChromeDriver } from '@/lib/chrome/driver';
import { storageService } from '@/lib/services/storage.service';
import type { PortalSettings } from '@/lib/api/portal';

interface ProtectionStatus {
  enabled: boolean;
  type: 'protected' | 'error' | 'alert';
  message: string;
}

const ZSCALER_SETTINGS = {
  company: {
    base: 'zscaler.net',
    portal: 'admin.zscaler.net',
    api: 'api.zscaler.net'
  },
  partner: {
    base: 'zscalerpartner.net',
    portal: 'partner.zscaler.net',
    api: 'api.zscalerpartner.net'
  }
} as const;

class BackgroundService {
  private static readonly PORTAL_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly PROTECTION_CHECK_INTERVAL = 60 * 1000; // 1 minute

  private driver: ChromeDriver | null = null;
  private portalCheckInterval: NodeJS.Timeout | null = null;
  private protectionCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      await this.initializeDriver();
      await this.initializeProtectionState();
      this.setupMessageListeners();
      this.setupPeriodicChecks();
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private async initializeDriver() {
    this.driver = new ChromeDriver();
    await this.driver.init();
  }

  private async initializeProtectionState() {
    const settings = await storageService.getAllSettings();
    const enabled = settings.protectionEnabled ?? true;
    const type = settings.statusType ?? 'protected';

    await this.updateProtectionState({
      enabled,
      type,
      message: this.getStatusMessage(enabled, type)
    });
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      const handler = this.messageHandlers[message.action];
      if (handler) {
        handler.call(this, message)
          .then(sendResponse)
          .catch(error => {
            console.error(`Error handling ${message.action}:`, error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
      return false;
    });
  }

  private readonly messageHandlers = {
    checkPortalStatus: (message: any) => this.handlePortalStatusCheck(message.type),
    configurePortal: (message: any) => this.handlePortalConfiguration(message.config),
    toggleProtection: (message: any) => this.handleToggleProtection(message.enabled),
    getProtectionStatus: () => this.getProtectionStatus()
  };

  private handleError = (error: Error): { success: false; error: string } => {
    console.error('Operation failed:', error);
    return { success: false, error: error.message };
  };

  private setupPeriodicChecks() {
    // Clear existing intervals
    if (this.portalCheckInterval) clearInterval(this.portalCheckInterval);
    if (this.protectionCheckInterval) clearInterval(this.protectionCheckInterval);

    // Set up new intervals
    this.portalCheckInterval = setInterval(
      () => this.checkAllPortals(),
      BackgroundService.PORTAL_CHECK_INTERVAL
    );

    this.protectionCheckInterval = setInterval(
      () => this.checkProtectionStatus(),
      BackgroundService.PROTECTION_CHECK_INTERVAL
    );

    // Initial checks
    this.checkAllPortals();
    this.checkProtectionStatus();
  }

  private async checkAllPortals() {
    try {
      const [companyConfig, partnerConfig] = await Promise.all([
        storageService.getPortalConfig('company'),
        storageService.getPortalConfig('partner')
      ]);

      const results: Record<string, any> = {};

      if (companyConfig) {
        results.company = await this.handlePortalStatusCheck('company');
        await storageService.updateLastChecked('company');
      }

      if (partnerConfig) {
        results.partner = await this.handlePortalStatusCheck('partner');
        await storageService.updateLastChecked('partner');
      }

      this.handlePortalStatusNotifications(results);
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  private async checkProtectionStatus() {
    try {
      const settings = await storageService.getAllSettings();
      const enabled = settings.protectionEnabled ?? true;

      // Get actual network status
      const statusCheck = await this.performNetworkCheck();
      const type = statusCheck.type;

      await this.updateProtectionState({
        enabled,
        type,
        message: this.getStatusMessage(enabled, type)
      });
    } catch (error) {
      console.error('Error checking protection status:', error);
    }
  }

  private async performNetworkCheck(): Promise<{ type: 'protected' | 'error' | 'alert' }> {
    // TODO: Implement actual network check logic
    return { type: 'protected' };
  }

  private async handlePortalStatusCheck(type: 'company' | 'partner') {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const settings = await storageService.getPortalConfig(type);
    if (!settings) {
      return {
        success: false,
        loggedIn: false,
        message: 'Portal not configured'
      };
    }

    const status = await this.driver.checkPortalStatus(settings.url);
    await storageService.updateLastChecked(type);
    return status;
  }

  private async handlePortalConfiguration(config: PortalSettings) {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const status = await this.driver.fillLoginForm(config.url, config.email);
    if (!status) throw new Error('Failed to configure portal');

    await storageService.savePortalConfig(config);
    return { success: true };
  }

  private async handleToggleProtection(enabled: boolean) {
    const type = enabled ? 'protected' : 'error';
    const status: ProtectionStatus = {
      enabled,
      type,
      message: this.getStatusMessage(enabled, type)
    };

    await this.updateProtectionState(status);
    return status;
  }

  private async updateProtectionState(status: ProtectionStatus) {
    await storageService.savePortalConfig({
      type: 'company',
      url: ZSCALER_SETTINGS.company.portal,
      email: ''
    });

    this.updateIcon(status.enabled, status.type);
  }

  private updateIcon(enabled: boolean, type: string) {
    const iconPath = this.getIconPath(enabled, type);
    chrome.action.setIcon({ path: iconPath });
  }

  private getIconPath(enabled: boolean, type: string) {
    const sizes = { 16: '', 48: '', 128: '' };
    const base = enabled ? 'icon-enabled' : 'icon-disabled';
    const suffix = type === 'error' ? '-error' : 
                  type === 'alert' ? '-alert' : 
                  '';

    Object.keys(sizes).forEach(size => {
      sizes[size as keyof typeof sizes] = `/icons/${base}${suffix}-${size}.png`;
    });

    return sizes;
  }

  private handlePortalStatusNotifications(results: Record<string, any>) {
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

  private getStatusMessage(enabled: boolean, type: string): string {
    if (!enabled) return 'Protection is disabled';
    
    switch (type) {
      case 'error':
        return 'Protection error detected';
      case 'alert':
        return 'Protection active with warnings';
      default:
        return 'Protection active';
    }
  }

  async cleanup() {
    if (this.portalCheckInterval) clearInterval(this.portalCheckInterval);
    if (this.protectionCheckInterval) clearInterval(this.protectionCheckInterval);
    if (this.driver) await this.driver.close();
    
    this.portalCheckInterval = null;
    this.protectionCheckInterval = null;
    this.driver = null;
  }
}

// Initialize service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

export { backgroundService };

import { backgroundService } from './service';
import { storageService } from '../lib/services/storage.service';

interface ProtectionStatus {
  enabled: boolean;
  type: 'protected' | 'error' | 'alert';
  message: string;
}

class ProtectionHandler {
  private static CHECK_INTERVAL = 60 * 1000; // 1 minute
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupMessageListeners();
    this.setupPeriodicChecks();
    this.initializeProtectionState();
  }

  private async initializeProtectionState() {
    const settings = await storageService.getAllSettings();
    const enabled = settings.protectionEnabled ?? true;
    const type = settings.statusType ?? 'protected';

    await this.updateProtectionState({
      enabled,
      type,
      message: this.getStatusMessage(enabled, type)
    });
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'toggleProtection') {
        this.handleToggleProtection(message.enabled)
          .then(sendResponse)
          .catch(error => {
            console.error('Error toggling protection:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      if (message.action === 'getProtectionStatus') {
        this.getProtectionStatus()
          .then(sendResponse)
          .catch(error => {
            console.error('Error getting protection status:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
    });
  }

  private setupPeriodicChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkProtectionStatus();
    }, ProtectionHandler.CHECK_INTERVAL);

    // Initial check
    this.checkProtectionStatus();
  }

  private async checkProtectionStatus() {
    try {
      const settings = await storageService.getAllSettings();
      const enabled = settings.protectionEnabled ?? true;

      // Simulate network check (replace with actual implementation)
      const type = Math.random() > 0.9 ? 'error' : 
                  Math.random() > 0.7 ? 'alert' : 
                  'protected';

      await this.updateProtectionState({
        enabled,
        type,
        message: this.getStatusMessage(enabled, type)
      });
    } catch (error) {
      console.error('Error checking protection status:', error);
    }
  }

  private async handleToggleProtection(enabled: boolean): Promise<ProtectionStatus> {
    try {
      const type = enabled ? 'protected' : 'error';
      const status: ProtectionStatus = {
        enabled,
        type,
        message: this.getStatusMessage(enabled, type)
      };

      await this.updateProtectionState(status);
      return status;
    } catch (error) {
      console.error('Error toggling protection:', error);
      throw error;
    }
  }

  private async updateProtectionState(status: ProtectionStatus) {
    await storageService.savePortalConfig({
      type: 'company',
      url: 'https://admin.zscaler.net',
      email: ''
    });

    // Update extension icon
    this.updateIcon(status.enabled, status.type);
  }

  private updateIcon(enabled: boolean, type: string) {
    const iconPath = this.getIconPath(enabled, type);
    chrome.action.setIcon({ path: iconPath });
  }

  private getIconPath(enabled: boolean, type: string) {
    const sizes = { 16: '', 48: '', 128: '' };
    const base = enabled ? 'icon-enabled' : 'icon-disabled';
    const suffix = type === 'error' ? '-error' : 
                  type === 'alert' ? '-alert' : 
                  '';

    Object.keys(sizes).forEach(size => {
      sizes[size as keyof typeof sizes] = `/icons/${base}${suffix}-${size}.png`;
    });

    return sizes;
  }

  private getStatusMessage(enabled: boolean, type: string): string {
    if (!enabled) return 'Protection is disabled';
    
    switch (type) {
      case 'error':
        return 'Protection error detected';
      case 'alert':
        return 'Protection active with warnings';
      default:
        return 'Protection active';
    }
  }

  async cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Initialize protection handler
const protectionHandler = new ProtectionHandler();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  protectionHandler.cleanup();
});

// Export for testing
export { backgroundService, protectionHandler };

import { ChromeDriver } from '@/lib/chrome/driver';
import type { PortalSettings } from '@/lib/api/portal';

interface ZscalerSettings {
  company: {
    base: string;
    portal: string;
    api: string;
  };
  partner: {
    base: string;
    portal: string;
    api: string;
  };
}

const ZSCALER_SETTINGS: ZscalerSettings = {
  company: {
    base: 'zscaler.net',
    portal: 'admin.zscaler.net',
    api: 'api.zscaler.net'
  },
  partner: {
    base: 'zscalerpartner.net',
    portal: 'partner.zscaler.net',
    api: 'api.zscalerpartner.net'
  }
};

class BackgroundService {
  private driver: ChromeDriver | null = null;
  private checkInterval: number | null = null;

  constructor() {
    this.initializeDriver();
    this.setupMessageListeners();
    this.setupStatusCheck();
  }

  private async initializeDriver() {
    try {
      this.driver = new ChromeDriver();
      await this.driver.init();
    } catch (error) {
      console.error('Failed to initialize Chrome driver:', error);
    }
  }

  private setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'checkPortalStatus') {
        this.handlePortalStatusCheck(message.type)
          .then(sendResponse)
          .catch(error => {
            console.error('Error checking portal status:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep channel open for async response
      }
      
      if (message.action === 'savePortalSettings') {
        this.handleSavePortalSettings(message.settings)
          .then(sendResponse)
          .catch(error => {
            console.error('Error saving portal settings:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
    });
  }

  private setupStatusCheck() {
    // Check portal status every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkAllPortalStatuses();
    }, 5 * 60 * 1000);
  }

  private async handlePortalStatusCheck(type: 'company' | 'partner') {
    if (!this.driver) {
      throw new Error('Chrome driver not initialized');
    }

    const settings = await this.getPortalSettings(type);
    if (!settings) {
      return { success: true, loggedIn: false, message: 'Portal not configured' };
    }

    const isLoggedIn = await this.driver.checkPortalStatus(
      type === 'company' ? ZSCALER_SETTINGS.company.portal : ZSCALER_SETTINGS.partner.portal
    );

    return {
      success: true,
      loggedIn: isLoggedIn,
      message: isLoggedIn ? 'Connected' : 'Not connected'
    };
  }

  private async handleSavePortalSettings(settings: PortalSettings) {
    const domain = settings.email.split('@')[1];
    const portalSettings = settings.type === 'company' 
      ? ZSCALER_SETTINGS.company 
      : ZSCALER_SETTINGS.partner;

    const customSettings = {
      ...portalSettings,
      portal: `${domain}.${portalSettings.base}`
    };

    await chrome.storage.local.set({
      [`${settings.type}PortalSettings`]: customSettings,
      [`${settings.type}PortalEmail`]: settings.email
    });

    return { success: true, settings: customSettings };
  }

  private async getPortalSettings(type: 'company' | 'partner') {
    const result = await chrome.storage.local.get([
      `${type}PortalSettings`,
      `${type}PortalEmail`
    ]);
    
    return result[`${type}PortalSettings`];
  }

  private async checkAllPortalStatuses() {
    try {
      const companyStatus = await this.handlePortalStatusCheck('company');
      const partnerStatus = await this.handlePortalStatusCheck('partner');

      if (!companyStatus.loggedIn || !partnerStatus.loggedIn) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/logo.png',
          title: 'Portal Status Update',
          message: `Company Portal: ${companyStatus.message}\nPartner Portal: ${partnerStatus.message}`
        });
      }
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  public async cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.driver) {
      await this.driver.close();
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  backgroundService.cleanup();
});

