import 'ts-node/register'

import { ExpoConfig } from 'expo/config'
import { version, versionCode, buildNumber } from './package.json'

module.exports = ({ config }: { config: ExpoConfig }) => {
  return {
    name: 'Nori',
    slug: 'nori',
    version,
    icon: './assets/images/icon.png',
    scheme: 'nori',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'jp.nonbili.nori',
      buildNumber,
    },
    android: {
      versionCode,
      launchMode: 'standard',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        monochromeImage: './assets/images/monochrome-icon.png',
        backgroundColor: '#ffffff',
      },
      predictiveBackGestureEnabled: false,
      package: 'jp.nonbili.nori',
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: false,
          },
          ios: {
            deploymentTarget: '17.0',
          },
        },
      ],
      './plugins/withAndroidPlugin.ts',
      'expo-router',
      'expo-image',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#0c0a09',
        },
      ],
      [
        'expo-localization',
        {
          supportedLocales: ['en'],
        },
      ],
      ['expo-share-intent', { iosAppGroupIdentifier: 'group.jp.nonbili.nori' }],
      'expo-web-browser',
      'expo-font',
    ],
    experiments: {
      typedRoutes: true,
    },
  }
}
