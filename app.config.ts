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
      appleTeamId: process.env.APP_STORE_DEVELOPMENT_TEAM || 'NXW8RMPV8L',
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
          supportedLocales: ['ar', 'el', 'en', 'es', 'fr', 'it', 'pl', 'pt-BR', 'sv', 'tr', 'zh-Hans', 'zh-Hant'],
        },
      ],
      './plugins/withAndroidPlugin.ts',
      'expo-web-browser',
      'expo-font',
      'expo-status-bar',
      [
        'expo-sharing',
        {
          ios: {
            enabled: true,
            extensionBundleIdentifier: 'jp.nonbili.nori.ShareExtension',
            appGroupId: 'group.jp.nonbili.nori',
            activationRule: {
              supportsText: true,
              // Browsers can share many tabs at once; accept them all instead of the first.
              supportsWebUrlWithMaxCount: 50,
              supportsWebPageWithMaxCount: 50,
              supportsFileWithMaxCount: 1,
            },
          },
          // Android shares are handled by ./plugins/withAndroidPlugin.ts, which routes them
          // to the native QuickShareReceiverActivity.
          android: {
            enabled: false,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  }
}
