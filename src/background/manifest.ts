import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Zscaler Security Extension',
  version: '2.0.0',
  description: 'Modern Zscaler Security Extension with auto-detection and portal management',
  permissions: [
    'storage',
    'notifications',
    'system.network',
    'debugger'
  ],
  host_permissions: [
    'http://localhost:3000/*',
    'https://*.zscaler.net/*',
    'https://*.zscalerpartner.net/*',
    'https://api.ipify.org/*'
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    }
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png'
  }
});

