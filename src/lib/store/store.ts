import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface ProtectionState {
  enabled: boolean;
  type: 'protected' | 'error' | 'alert';
  description: string;
  setEnabled: (enabled: boolean) => void;
  setType: (type: 'protected' | 'error' | 'alert') => void;
}

export const useProtectionStore = create<ProtectionState>()(
  devtools(
    persist(
      (set) => ({
        enabled: true,
        type: 'protected',
        description: 'Your internet traffic is protected',
        setEnabled: (enabled) => set({ enabled }),
        setType: (type) => set({ type })
      }),
      { name: 'protection-store' }
    )
  )
);

