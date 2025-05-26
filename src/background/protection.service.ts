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

  async checkNetworkStatus(): Promise<NetworkStatus> {
    return this.checkNetwork();
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.checkNetwork();
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

  private async updateIcon(enabled: boolean, type: string) {
    try {
      const iconPaths = await this.getIconPaths(enabled, type);
      await chrome.action.setIcon({ path: iconPaths });
    } catch (error) {
      console.error('Error setting icon:', error);
      // Try to set fallback icon
      await this.setFallbackIcon(enabled, type);
    }
  }

  private async getIconPaths(enabled: boolean, type: string): Promise<Record<string, string>> {
    const sizes = ['16', '48', '128'] as const;
    const base = enabled ? 'icon-enabled' : 'icon-disabled';
    const suffix = type === 'error' ? '-error' : 
                  type === 'alert' ? '-alert' : 
                  '';

    const paths: Partial<Record<string, string>> = {};
    let hasValidIcon = false;

    // Try to get each icon size
    for (const size of sizes) {
      try {
        const path = `icons/${base}${suffix}-${size}.png`;
        const url = chrome.runtime.getURL(path);
        
        // Verify icon exists by trying to fetch it
        const response = await fetch(url);
        if (response.ok) {
          paths[size] = url;
          hasValidIcon = true;
        } else {
          console.warn(`Icon not found: ${path}`);
        }
      } catch (error) {
        console.warn(`Error loading icon for size ${size}:`, error);
      }
    }

    // If no icons were loaded successfully, throw error to trigger fallback
    if (!hasValidIcon) {
      throw new Error('No valid icons found');
    }

    // Ensure we have all sizes by falling back to nearest size if needed
    const fallbackSizes = ['48', '128', '16'];
    for (const size of sizes) {
      if (!paths[size]) {
        // Find first available fallback icon
        for (const fallbackSize of fallbackSizes) {
          if (paths[fallbackSize]) {
            paths[size] = paths[fallbackSize];
            console.warn(`Using ${fallbackSize}px icon as fallback for ${size}px`);
            break;
          }
        }
      }
    }

    return paths as Record<string, string>;
  }

  private async setFallbackIcon(enabled: boolean, type: string) {
    try {
      // Create a simple colored square as fallback
      const canvas = new OffscreenCanvas(48, 48);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Set color based on state
      let color = enabled ? '#4CAF50' : '#9E9E9E'; // green for enabled, grey for disabled
      if (type === 'error') color = '#F44336'; // red for error
      if (type === 'alert') color = '#FFC107'; // yellow for alert

      // Draw colored square
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 48, 48);

      // Add status indicator
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(enabled ? '✓' : '×', 24, 24);

      // Convert to ImageData
      const imageData = ctx.getImageData(0, 0, 48, 48);

      // Set the fallback icon
      await chrome.action.setIcon({ imageData });

    } catch (error) {
      console.error('Error setting fallback icon:', error);
      // If all else fails, try to set a basic emoji as icon text
      await chrome.action.setBadgeText({
        text: enabled ? '✓' : '×'
      });
      await chrome.action.setBadgeBackgroundColor({
        color: enabled ? '#4CAF50' : '#F44336'
      });
    }
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
