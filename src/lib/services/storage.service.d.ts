declare module '@/lib/services/storage.service' {
  import type { PortalConfig } from '../chrome/types';
  import type { ProtectionStatus } from '../../background/types';

  export interface StorageService {
    getAllSettings(): Promise<any>;
    getPortalConfig(type: string): Promise<PortalConfig | null>;
    updateLastChecked(type: string): Promise<void>;
    savePortalConfig(config: PortalConfig): Promise<void>;
    saveProtectionStatus(status: ProtectionStatus): Promise<void>;
  }

  export const storageService: StorageService;
}

