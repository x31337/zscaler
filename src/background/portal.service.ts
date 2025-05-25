import { ChromeDriver } from '@/lib/chrome/driver';
import { storageService } from '@/lib/services/storage.service';
import type { PortalSettings } from '@/lib/api/portal';
import { ZSCALER_SETTINGS, PortalType } from './types';

export class PortalService {
  private static readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private interval: NodeJS.Timeout | null = null;

  constructor(private driver: ChromeDriver) {
    this.initialize();
  }

  private async initialize() {
    this.setupPeriodicChecks();
    await this.checkAllPortals();
  }

  private setupPeriodicChecks() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(
      () => this.checkAllPortals(),
      PortalService.CHECK_INTERVAL
    );
  }

  async checkAllPortals() {
    try {
      const configs = await Promise.all([
        storageService.getPortalConfig('company'),
        storageService.getPortalConfig('partner')
      ]);

      const results = await Promise.all(
        configs.map(async (config, index) => {
          if (!config) return null;
          const type = index === 0 ? 'company' : 'partner';
          const status = await this.checkStatus(type);
          await storageService.updateLastChecked(type);
          return { type, status };
        })
      );

      this.handleStatusNotifications(
        results.filter(Boolean).reduce((acc, curr) => ({
          ...acc,
          [curr!.type]: curr!.status
        }), {})
      );
    } catch (error) {
      console.error('Error checking portal statuses:', error);
    }
  }

  async checkStatus(type: PortalType) {
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

  async configure(config: PortalSettings) {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    const result = await this.driver.fillLoginForm(config.url, config.email);
    if (!result) throw new Error('Failed to configure portal');

    await storageService.savePortalConfig(config);
    return { success: true };
  }

  async saveSettings(settings: PortalSettings) {
    const domain = settings.email.split('@')[1];
    const portalSettings = settings.type === 'company' 
      ? ZSCALER_SETTINGS.company 
      : ZSCALER_SETTINGS.partner;

    const customSettings = {
      ...portalSettings,
      portal: `${domain}.${portalSettings.base}`
    };

    await storageService.savePortalConfig({
      ...settings,
      url: customSettings.portal
    });

    return { success: true, settings: customSettings };
  }

  private handleStatusNotifications(results: Record<string, any>) {
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
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
