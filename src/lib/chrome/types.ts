import { z } from 'zod';

// Portal related types
export interface PortalLoginStatus {
  success: boolean;
  loggedIn: boolean;
  message: string;
  error?: string;
  details?: unknown;
}

export interface PortalConfig {
  url: string;
  email: string;
  type: 'company' | 'partner';
}

// Login form related types
export interface LoginFormElements {
  emailInput: boolean;
  submitButton: boolean;
  errorMessage?: string | null;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  details?: unknown;
}

// Page element selectors
export interface PageSelectors {
  loginForm: string;
  dashboard: string;
  userProfile: string;
  signOut: string;
  errorMessage: string;
  emailInput: string;
  submitButton: string;
}

export const DEFAULT_SELECTORS: PageSelectors = {
  loginForm: '[data-test="login-form"], .login-form, #loginForm',
  dashboard: '[data-test="dashboard"], .dashboard, .admin-panel',
  userProfile: '.user-profile, .avatar, .user-menu',
  signOut: '[aria-label="Sign Out"], .logout-btn, #logout',
  errorMessage: '.error-message, .alert-error, [role="alert"]',
  emailInput: 'input[type="email"], input[name="email"]',
  submitButton: 'button[type="submit"], input[type="submit"]'
};

// Zod schemas for runtime validation
export const PortalLoginStatusSchema = z.object({
  success: z.boolean(),
  loggedIn: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
  details: z.unknown().optional()
});

export const ChromeErrorSchema = z.object({
  success: z.boolean(),
  error: z.string()
});

