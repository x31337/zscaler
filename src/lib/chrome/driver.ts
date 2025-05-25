import CDP from 'chrome-remote-interface';
import puppeteer from 'puppeteer-core';
import { z } from 'zod';
import type { PortalLoginStatus } from './types';

import { ChromeDriverError, ChromeErrors } from './errors';

import { delay } from '@/lib/utils';

export class ChromeDriver {
  private cdpClient: CDP.Client | null = null;
  private browser: puppeteer.Browser | null = null;
  private debuggerAttached = false;

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          await delay(delayMs);
          continue;
        }
      }
    }
    throw lastError!;
  }

  async init() {
    try {
      [this.cdpClient, this.browser] = await Promise.all([
        CDP({ port: 9222, local: true }).catch(() => {
          throw ChromeErrors.CONNECTION_FAILED;
        }),
        puppeteer.connect({
          browserURL: 'http://localhost:9222',
          defaultViewport: null
        }).catch(() => {
          throw ChromeErrors.CONNECTION_FAILED;
        })
      ]);

      const { Network, Page, Runtime } = this.cdpClient;
      await Promise.all([
        Network.enable(),
        Page.enable(),
        Runtime.enable()
      ]).catch(() => {
        throw ChromeErrors.INITIALIZATION_ERROR;
      });

      this.debuggerAttached = true;
      console.log('Chrome driver initialized successfully');
    } catch (error) {
      if (error instanceof ChromeDriverError) {
        throw error;
      }
      console.error('Failed to initialize Chrome driver:', error);
      throw ChromeErrors.INITIALIZATION_ERROR;
    }
  }

  async checkPortalStatus(url: string, retries = 3): Promise<PortalLoginStatus> {
    return this.retryOperation(async () => {
      if (!this.browser || !this.cdpClient) {
        throw ChromeErrors.NOT_INITIALIZED;
      }

      const page = await this.browser.newPage();
      
      try {
        // Setup network error handling
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (request.url() === url) {
            request.continue();
          } else {
            request.abort();
          }
        });

        // Setup error handling
        page.on('error', error => {
          console.error('Page error:', error);
          throw ChromeErrors.NAVIGATION_FAILED;
        });

        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        const loginStatus = await page.evaluate(() => {
          const selectors = {
            loginForm: '[data-test="login-form"], .login-form, #loginForm',
            dashboard: '[data-test="dashboard"], .dashboard, .admin-panel',
            userProfile: '.user-profile, .avatar, .user-menu',
            signOut: '[aria-label="Sign Out"], .logout-btn, #logout',
            errorMessage: '.error-message, .alert-error, [role="alert"]'
          };

          const error = document.querySelector(selectors.errorMessage)?.textContent;
          
          return {
            hasLoginForm: !!document.querySelector(selectors.loginForm),
            hasDashboard: !!document.querySelector(selectors.dashboard),
            hasUserProfile: !!document.querySelector(selectors.userProfile),
            hasSignOut: !!document.querySelector(selectors.signOut),
            error: error || null
          };
      });

        if (loginStatus.error) {
          return {
            success: false,
            loggedIn: false,
            message: loginStatus.error,
            error: ChromeDriverError.LOGIN_ERROR
          };
        }

        const loggedIn = !loginStatus.hasLoginForm && 
          (loginStatus.hasDashboard || loginStatus.hasUserProfile || loginStatus.hasSignOut);

      return {
        success: true,
        loggedIn,
        message: loggedIn ? 'Connected' : 'Not connected'
      };
    } catch (error) {
      if (error instanceof ChromeDriverError) {
        return {
          success: false,
          loggedIn: false,
          message: error.message,
          error: error.code
        };
      }
      console.error('Error checking portal status:', error);
      return {
        success: false,
        loggedIn: false,
        message: 'Error checking connection status',
        error: ChromeDriverError.CONNECTION_ERROR
      };
    }
  }

  async fillLoginForm(url: string, email: string): Promise<boolean> {
    return this.retryOperation(async () => {
      if (!this.browser) {
        throw ChromeErrors.NOT_INITIALIZED;
      }

      const page = await this.browser.newPage();
      
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        // Wait for login form elements
        await page.waitForSelector(
          'input[type="email"], input[name="email"]',
          { timeout: 5000 }
        );

        // Fill and submit login form
        const result = await page.evaluate((email) => {
          const emailInput = document.querySelector<HTMLInputElement>(
            'input[type="email"], input[name="email"]'
          );
          const submitButton = document.querySelector<HTMLElement>(
            'button[type="submit"], input[type="submit"]'
          );

          if (!emailInput || !submitButton) {
            return { success: false, error: 'Login form elements not found' };
          }

          try {
            emailInput.value = email;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            submitButton.click();
            return { success: true };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        }, email);

        if (!result.success) {
          throw new ChromeDriverError(
            result.error || 'Failed to fill login form',
            ChromeDriverError.LOGIN_ERROR
          );
        }

        // Wait for navigation after form submission
        await page.waitForNavigation({ 
          waitUntil: 'networkidle0',
          timeout: 5000 
        }).catch(() => {});

        return true;
      } finally {
        await page.close().catch(console.error);
      }
    }, 2);
  }

  async close() {
    await Promise.all([
      this.cdpClient?.close(),
      this.browser?.close()
    ]);
    this.cdpClient = null;
    this.browser = null;
    this.debuggerAttached = false;
  }
}

// Validation schemas
export const PortalURLSchema = z.object({
  company: z.string().url(),
  partner: z.string().url()
});

export type PortalURLs = z.infer<typeof PortalURLSchema>;

