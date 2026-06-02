import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tukifac.tenant',
  appName: 'Tukifac',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f3f4f6',
    minWebViewVersion: 60,
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f3f4f6',
      showSpinner: false,
    },
    ScreenOrientation: {
      orientation: 'portrait',
    },
  },
}

export default config
