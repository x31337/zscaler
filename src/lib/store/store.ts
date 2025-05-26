import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface ProtectionState {
  enabled: boolean;
  type: 'protected' | 'error' | 'alert';
  description: string;
  setEnabled: (enabled: boolean) => void;
  setType: (type: 'protected' | 'error' | 'alert') => void;
  setStatus: (status: { type: 'protected' | 'error' | 'alert'; description: string }) => void;
}

export const useProtectionStore = create<ProtectionState>()(
  devtools(
    persist(
      (set) => ({
        enabled: true,
        type: 'protected',
        description: 'Your internet traffic is protected',
        setEnabled: (enabled) => set({ enabled }),
        setType: (type) => set({ type }),
        setStatus: (status) => set({ type: status.type, description: status.description })
      }),
      { name: 'protection-store' }
    )
  )
);

// Initialize store with Chrome storage data
chrome.storage.local.get(['protectionStatus'], (result) => {
  if (result.protectionStatus) {
    useProtectionStore.setState({
      enabled: result.protectionStatus.enabled,
      type: result.protectionStatus.type,
      description: result.protectionStatus.message
    });
  }
});

// Listen for changes in Chrome storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes.protectionStatus) {
    const status = changes.protectionStatus.newValue;
    useProtectionStore.setState({
      enabled: status.enabled,
      type: status.type,
      description: status.message
    });
  }
});

