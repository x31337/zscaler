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
    'debugger',
    'nativeMessaging',
    'alarms'
  ],
  host_permissions: [
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
      '16': 'src/assets/icons/icon-enabled-16.png',
      '48': 'src/assets/icons/icon-enabled-48.png',
      '128': 'src/assets/icons/icon-enabled-128.png'
    }
  },
  icons: {
    '16': 'src/assets/icons/icon-enabled-16.png',
    '48': 'src/assets/icons/icon-enabled-48.png',
    '128': 'src/assets/icons/icon-enabled-128.png'
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
    sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals"
  },
  web_accessible_resources: [{
    resources: [
      "src/assets/icons/*",
      "src/popup/*",
      "src/options/*"
    ],
    matches: ["<all_urls>"]
  }]
});

