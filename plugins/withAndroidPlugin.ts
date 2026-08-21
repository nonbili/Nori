import { ConfigPlugin } from '@expo/config-plugins'
import { withAndroidManifest } from '@expo/config-plugins'
import { withAppBuildGradle } from '@expo/config-plugins/build/plugins/android-plugins.js'

const googlePlayBuild = !!process.env.GOOGLE_PLAY_BUILD

const withAndroidSigningConfig: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0]
    if (!application) {
      return config
    }

    const activities = application.activity || []
    const mainActivity = activities.find((activity) => {
      const name = activity.$['android:name']
      return name === '.MainActivity' || name.endsWith('.MainActivity')
    })
    if (mainActivity?.['intent-filter']) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((filter) => (
        !filter.action?.some((action) => (
          action.$['android:name'] === 'android.intent.action.SEND'
          || action.$['android:name'] === 'android.intent.action.SEND_MULTIPLE'
        ))
      ))
    }

    const receiverName = 'jp.nonbili.nori.quickshare.QuickShareReceiverActivity'
    let receiver = activities.find((activity) => activity.$['android:name'] === receiverName)
    if (!receiver) {
      receiver = {
        $: {
          'android:name': receiverName,
          'android:theme': '@style/AppTheme',
          'android:exported': 'true',
          'android:noHistory': 'true',
          'android:excludeFromRecents': 'true',
        },
      }
      activities.unshift(receiver)
      application.activity = activities
    }

    receiver['intent-filter'] = [
      {
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        data: [
          { $: { 'android:mimeType': 'text/*' } },
          { $: { 'android:mimeType': '*/*' } },
        ],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      },
      {
        $: {
          'android:autoVerify': 'false',
          'nori-quick-share-intent-filters': 'true',
        },
        action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
        data: [
          { $: { 'android:mimeType': 'text/*' } },
          { $: { 'android:mimeType': '*/*' } },
        ],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      },
    ] as any

    return config
  })

  return withAppBuildGradle(config, (config) => {
    // https://www.reddit.com/r/expo/comments/1j4v323/comment/mit9b2a/
    let contents = config.modResults.contents

    if (googlePlayBuild) {
      contents = contents.replace(
        /versionCode (\d+)/,
        (_, versionCode) => `versionCode ${(Number(versionCode) * 100) + 4}`,
      )
    } else {
      contents = contents.replace(
        'android {',
        `ext.abiCodes = [x86_64:2, 'armeabi-v7a':3, 'arm64-v8a': 4]

android {`,
      )
    }

    contents = contents
      .replace('zh-Hans', 'b+zh+Hans')
      .replace('zh-Hant', 'b+zh+Hant')
      .replace(
        /androidResources \{([\s\S]*?)}/,
        googlePlayBuild
          ? `androidResources {$1}
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }`
          : `androidResources {$1}
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include project.ext.abiCodes.keySet() as String[]
        }
    }
    android.applicationVariants.configureEach { variant ->
        variant.outputs.each { output ->
            def baseAbiVersionCode = project.ext.abiCodes.get(output.getFilter(com.android.build.OutputFile.ABI))
            if (baseAbiVersionCode != null) {
                output.versionCodeOverride = (100 * project.android.defaultConfig.versionCode) + baseAbiVersionCode
            }
        }
    }`,
      )

    if (googlePlayBuild) {
      contents = contents
        .replace(
          /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s*}\s*)/,
          `$1
        release {
            storeFile file(NB_UPLOAD_STORE_FILE)
            storePassword NB_UPLOAD_STORE_PASSWORD
            keyAlias NB_UPLOAD_KEY_ALIAS
            keyPassword NB_UPLOAD_KEY_PASSWORD
        }
`,
        )
        .replace(
          /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
          '$1signingConfig signingConfigs.release',
        )
    } else {
      contents = contents.replace(
        /buildTypes \{([\s\S]*?)release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
        `buildTypes {$1release {`,
      )
    }

    config.modResults.contents = contents

    return config
  })
}

export default withAndroidSigningConfig
