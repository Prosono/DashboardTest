import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'no.smartsauna.app',
  appName: 'Smart Sauna Systems',
  webDir: 'dist',
  server: {
    url: 'https://www.smartsauna.no',
    cleartext: false,
    allowNavigation: [
      'smartsauna.no',
      '*.smartsauna.no',
    ],
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

