import { ChromeDriver } from '@/lib/chrome/driver';
import { storageService } from '@/lib/services/storage.service';
import type { ProtectionStatus, NetworkStatus } from './types';

export class ProtectionService {
  private static readonly CHECK_INTERVAL = 60 * 1000; // 1 minute
  private interval: NodeJS.Timeout | null = null;

  constructor(private driver: ChromeDriver) {
    this.initialize();
  }

  private async initialize() {
    await this.initializeState();
    this.setupPeriodicChecks();
  }

  private async initializeState() {
    const settings = await storageService.getAllSettings();
    await this.updateProtectionState({
      enabled: settings.protectionEnabled ?? true,
      type: settings.statusType ?? 'protected',
      message: this.getStatusMessage(settings.protectionEnabled ?? true, settings.statusType ?? 'protected')
    });
  }

  private setupPeriodicChecks() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(
      () => this.checkStatus(),
      ProtectionService.CHECK_INTERVAL
    );
    this.checkStatus();
  }

  async getStatus(): Promise<ProtectionStatus> {
    const settings = await storageService.getAllSettings();
    const networkStatus = await this.checkNetwork();
    
    return {
      enabled: settings.protectionEnabled ?? true,
      type: networkStatus.type,
      message: this.getStatusMessage(
        settings.protectionEnabled ?? true,
        networkStatus.type
      )
    };
  }

  async checkStatus(): Promise<ProtectionStatus> {
    try {
      const settings = await storageService.getAllSettings();
      const enabled = settings.protectionEnabled ?? true;
      const networkStatus = await this.checkNetwork();

      const status: ProtectionStatus = {
        enabled,
        type: networkStatus.type,
        message: this.getStatusMessage(enabled, networkStatus.type)
      };

      await this.updateProtectionState(status);
      return status;
    } catch (error) {
      console.error('Error checking protection status:', error);
      const errorStatus: ProtectionStatus = {
        enabled: false,
        type: 'error',
        message: 'Protection status check failed'
      };
      await this.updateProtectionState(errorStatus);
      return errorStatus;
    }
  }

  async toggleProtection(enabled: boolean): Promise<ProtectionStatus> {
    const networkStatus = await this.checkNetwork();
    const status: ProtectionStatus = {
      enabled,
      type: enabled ? networkStatus.type : 'error',
      message: this.getStatusMessage(enabled, networkStatus.type)
    };

    await this.updateProtectionState(status);
    return status;
  }

  private async checkNetwork(): Promise<NetworkStatus> {
    if (!this.driver) throw new Error('Chrome driver not initialized');

    try {
      // TODO: Implement actual network check logic
      return { type: 'protected' };
    } catch (error) {
      console.error('Network check failed:', error);
      return { type: 'error', details: error };
    }
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
      case 'error': return 'Protection error detected';
      case 'alert': return 'Protection active with warnings';
      default: return 'Protection active';
    }
  }

  async cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
