import React from 'react';
import { Switch } from '@/app/components/Switch';
import { useProtectionStore } from '@/lib/store/store';
import './Header.css';

export const Header: React.FC = () => {
  const { enabled, description } = useProtectionStore();

  return (
    <header>
      <div className="header-content">
        <img src="/icons/logo.png" alt="Zscaler" className="header-logo" />
        <div className="header-text">
          <div className="header-status">
            {enabled ? 'Protected' : 'Not Protected'}
          </div>
          <div className="header-description">{description}</div>
        </div>
      </div>
      <Switch />
    </header>
  );
};

