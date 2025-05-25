import { ChromeDriver } from '../chrome/driver';
import { ChromeDriverError, ChromeErrors } from '../chrome/errors';
import type { PortalConfig, PortalLoginStatus } from '../chrome/types';
import { delay } from '../utils';

export class PortalService {
  private driver: ChromeDriver | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (this.initialized) return;
    
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  private async initialize() {
    try {
      this.driver = new ChromeDriver();
      await this.driver.init();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize portal service:', error);
      this.driver = null;
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  async checkPortalStatus(config: PortalConfig): Promise<PortalLoginStatus> {
    try {
      await this.ensureInitialized();
      if (!this.driver) throw ChromeErrors.NOT_INITIALIZED;

      // Check portal status with retries
      return await this.driver.checkPortalStatus(config.url);
    } catch (error) {
      if (error instanceof ChromeDriverError) {
        return {
          success: false,
          loggedIn: false,
          message: error.message,
          error: error.code,
          details: error.details
        };
      }
      return {
        success: false,
        loggedIn: false,
        message: 'Unexpected error checking portal status',
        error: 'UNKNOWN_ERROR',
        details: error
      };
    }
  }

  async configurePortal(config: PortalConfig): Promise<PortalLoginStatus> {
    try {
      await this.ensureInitialized();
      if (!this.driver) throw ChromeErrors.NOT_INITIALIZED;

      // Try to fill login form
      const filled = await this.driver.fillLoginForm(config.url, config.email);
      if (!filled) {
        throw ChromeErrors.LOGIN_FAILED;
      }

      // Wait a bit for any redirects/processing
      await delay(2000);

      // Check login status
      return await this.driver.checkPortalStatus(config.url);
    } catch (error) {
      if (error instanceof ChromeDriverError) {
        return {
          success: false,
          loggedIn: false,
          message: error.message,
          error: error.code,
          details: error.details
        };
      }
      return {
        success: false,
        loggedIn: false,
        message: 'Unexpected error configuring portal',
        error: 'UNKNOWN_ERROR',
        details: error
      };
    }
  }

  async cleanup() {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.initialized = false;
    }
  }
}

// Create singleton instance
export const portalService = new PortalService();

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  portalService.cleanup();
});

