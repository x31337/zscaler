import { z } from 'zod';
import type { PortalConfig } from '../chrome/types';

// Storage schemas
const StorageSchema = z.object({
  companyPortalSettings: z.object({
    url: z.string().url(),
    email: z.string().email(),
    lastChecked: z.number().optional()
  }).optional(),
  partnerPortalSettings: z.object({
    url: z.string().url(),
    email: z.string().email(),
    lastChecked: z.number().optional()
  }).optional(),
  protectionEnabled: z.boolean().optional(),
  statusType: z.enum(['protected', 'error', 'alert']).optional()
});

type StorageData = z.infer<typeof StorageSchema>;

export class StorageService {
  private static instance: StorageService;

  private constructor() {}

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async getPortalConfig(type: 'company' | 'partner'): Promise<PortalConfig | null> {
    try {
      const key = `${type}PortalSettings`;
      const result = await chrome.storage.local.get(key);
      
      if (!result[key]) return null;

      const config = result[key];
      return {
        type,
        url: config.url,
        email: config.email
      };
    } catch (error) {
      console.error(`Error getting ${type} portal config:`, error);
      return null;
    }
  }

  async savePortalConfig(config: PortalConfig): Promise<boolean> {
    try {
      const key = `${config.type}PortalSettings`;
      await chrome.storage.local.set({
        [key]: {
          url: config.url,
          email: config.email,
          lastChecked: Date.now()
        }
      });
      return true;
    } catch (error) {
      console.error('Error saving portal config:', error);
      return false;
    }
  }

  async updateLastChecked(type: 'company' | 'partner'): Promise<void> {
    const key = `${type}PortalSettings`;
    const result = await chrome.storage.local.get(key);
    
    if (result[key]) {
      await chrome.storage.local.set({
        [key]: {
          ...result[key],
          lastChecked: Date.now()
        }
      });
    }
  }

  async getAllSettings(): Promise<StorageData> {
    try {
      const data = await chrome.storage.local.get(null);
      const parsed = StorageSchema.safeParse(data);
      
      if (!parsed.success) {
        console.error('Invalid storage data:', parsed.error);
        return {};
      }
      
      return parsed.data;
    } catch (error) {
      console.error('Error getting storage data:', error);
      return {};
    }
  }

  async clearAll(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  onChanged(callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}

// Export singleton instance
export const storageService = StorageService.getInstance();

