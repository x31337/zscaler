import React from 'react';
import { useProtectionStore } from '@/lib/store/store';

export const Header: React.FC = () => {
  const { enabled, description } = useProtectionStore();

  return (
    <header className="bg-blue-600 p-4 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <img src="/icons/logo.png" alt="Zscaler" className="w-8 h-8" />
        <div className="text-white">
          <div className="text-sm font-semibold">
            {enabled ? 'Protected' : 'Not Protected'}
          </div>
          <div className="text-xs opacity-80">{description}</div>
        </div>
      </div>
      <Toggle />
    </header>
  );
};

