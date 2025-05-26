import type { PortalSettings } from '@/lib/api/portal';

// Message handling types
export type MessageResponse = {
  success: boolean;
  error?: string;
  data?: any;
};

export type MessageHandler = (message: any) => Promise<MessageResponse>;

export interface MessageHandlers {
  // Portal related actions
  checkPortalStatus: MessageHandler;
  configurePortal: MessageHandler;
  savePortalSettings: MessageHandler;

  // Protection related actions
  toggleProtection: MessageHandler;
  getProtectionStatus: MessageHandler;
  checkProtectionStatus: MessageHandler;
}

// Portal related types
export type PortalType = 'company' | 'partner';

export type PortalStatus = {
  type: PortalType;
  connected: boolean;
  lastCheck: Date;
  settings?: PortalSettings;
};

// Protection related types
export type ProtectionStatusType = 'protected' | 'error' | 'alert';

export interface ProtectionStatus {
  enabled: boolean;
  type: ProtectionStatusType;
  message: string;
  error?: string;
  networkConnected?: boolean;
  lastCheck?: Date;
  details?: unknown;
}

export interface NetworkStatus {
  type: ProtectionStatusType;
  error?: string;
  details?: unknown;
}

// Constants
export const ZSCALER_SETTINGS = {
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

