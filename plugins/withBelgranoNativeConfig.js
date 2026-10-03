const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidManifest,
  withAndroidStyles,
  withAppBuildGradle,
  withDangerousMod,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
  withMainActivity,
  withSettingsGradle,
  withStringsXml,
} = require('expo/config-plugins');
const withBelgranoDeviceModule = require('./withBelgranoDeviceModule');
const withBelgranoNetworkSecurity = require('./withBelgranoNetworkSecurity');

const RELEASE_SIGNING_LOADER = `/**
 * Custom properties loader based off this SO answer:
 * https://stackoverflow.com/a/75062140
 *
 * This loader is used by CI release signing. It enforces loading from
 * $HOME/.gradle/gradle.properties so local, Docker, and GitHub Actions builds
 * resolve secrets consistently after Expo prebuild regenerates android/.
 */
def props = new Properties()

File propsFile = file("\${System.properties['user.home']}\${File.separator}.gradle\${File.separator}gradle.properties")

if (!propsFile.isFile()) { // try to load from GitHub Action's custom home path
    propsFile = file("/github/home/.gradle/gradle.properties")
}

if (propsFile.isFile()) {
    propsFile.withInputStream { props.load(it) }
}
`;

const RELEASE_SIGNING_CONFIG = `        release {
            if (props.containsKey('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(props['MYAPP_UPLOAD_STORE_FILE'])
                storePassword props['MYAPP_UPLOAD_STORE_PASSWORD']
                keyAlias props['MYAPP_UPLOAD_KEY_ALIAS']
                keyPassword props['MYAPP_UPLOAD_KEY_PASSWORD']
            }
        }
`;

const BUILD_FINGERPRINT_GRADLE_INPUTS = `
// Keep native packaging/cache keys sensitive to JavaScript, config, and asset changes.
tasks.configureEach { task ->
    def lowerName = task.name.toLowerCase()
    if (lowerName.contains("bundle") || lowerName.contains("assets") || lowerName.contains("package")) {
        task.inputs.property("belgranoBuildFingerprint", providers.gradleProperty("belgranoBuildFingerprint").orElse("local"))
    }
}
`;

// Colors used by the launch screen (react-native-splash-screen) and the splash window background.
// colorPrimary comes from `primaryColor` in app.json; Expo owns iconBackground and colorPrimaryDark.
const SPLASH_COLORS = {
  day: {
    splashscreen_background: '#fff8f6',
    splashscreen_text:       '#251815',
    splashscreen_progress:   '#be4936',
  },
  night: {
    splashscreen_background: '#080403',
    splashscreen_text:       '#fff7f4',
    splashscreen_progress:   '#ffb4a8',
  },
};

// Resource qualifiers Expo's colors mods don't manage (watches always use the dark splash).
const EXTRA_SPLASH_COLOR_DIRS = {
  'values-v31':         SPLASH_COLORS.day,
  'values-night-v31':   SPLASH_COLORS.night,
  'values-watch':       SPLASH_COLORS.night,
  'values-watch-v31':   SPLASH_COLORS.night,
};

const LOADING_ASSETS_TEXT = 'Loading assets...';

const renderColorsXml = colors => `<?xml version="1.0" encoding="utf-8"?>
<resources>
${Object.entries(colors).map(([name, value]) => `  <color name="${name}">${value}</color>`).join('\n')}
</resources>
`;

const assignColors = (colorsXml, colors) => Object.entries(colors).reduce(
  (xml, [name, value]) => AndroidConfig.Colors.assignColorValue(xml, { name, value }),
  colorsXml
);

const LAUNCH_SCREEN_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout
    android:background="@color/splashscreen_background"
    android:layout_height="match_parent" android:layout_width="match_parent"
    xmlns:android="http://schemas.android.com/apk/res/android">

    <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="horizontal" android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_gravity="center">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:orientation="vertical"
            android:layout_gravity="center">

            <ProgressBar
                android:layout_width="32dp"
                android:layout_height="wrap_content"
                android:indeterminate="true"
                android:indeterminateTintMode="src_in"
                android:indeterminateTint="@color/splashscreen_progress"
                android:layout_gravity="center" />

            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_gravity="center"
                android:textAlignment="center"
                android:textColor="@color/splashscreen_text"
                android:gravity="center"
                android:textSize="14sp"
                android:text="@string/loading_assets" />

        </LinearLayout>

    </LinearLayout>
</LinearLayout>
`;

function ensureGradleProperty(properties, key, value) {
  const existing = properties.find(item => item.type === 'property' && item.key === key);

  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

function ensureLine(contents, line) {
  return contents.includes(line) ? contents : `${contents.trimEnd()}\n${line}\n`;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

// Colors, styles and strings go through Expo's resource mods (not withDangerousMod) so Expo's own
// splash/status bar/primary color steps can't overwrite them afterwards.
const withBelgranoAndroidColors = config => {
  config = withAndroidColors(config, config => {
    config.modResults = assignColors(config.modResults, SPLASH_COLORS.day);
    return config;
  });

  return withAndroidColorsNight(config, config => {
    config.modResults = assignColors(config.modResults, SPLASH_COLORS.night);
    return config;
  });
};

const withBelgranoAndroidStyles = config => withAndroidStyles(config, config => {
  const { Styles } = AndroidConfig;
  const appTheme = Styles.getAppThemeGroup();
  const resetEditText = { name: 'ResetEditText', parent: '@android:style/Widget.EditText' };
  let styles = config.modResults;

  // Text colors follow the DayNight theme; a forced black made dialogs unreadable in dark mode.
  styles = Styles.assignStylesValue(styles, { add: false, parent: appTheme, name: 'android:textColor' });
  styles = Styles.assignStylesValue(styles, { add: true, parent: appTheme, name: 'android:editTextStyle', value: '@style/ResetEditText' });
  styles = Styles.assignStylesValue(styles, { add: true, parent: appTheme, name: 'colorPrimaryDark', value: '@color/colorPrimaryDark' });
  // WearOS: keep the system swipe-to-dismiss gesture from closing the app.
  styles = Styles.assignStylesValue(styles, { add: true, parent: appTheme, name: 'android:windowSwipeToDismiss', value: 'false' });

  styles = Styles.assignStylesValue(styles, { add: true, parent: resetEditText, name: 'android:padding', value: '0dp' });
  styles = Styles.assignStylesValue(styles, { add: true, parent: resetEditText, name: 'android:textColorHint', value: '#c8c8c8' });

  config.modResults = styles;
  return config;
});

const withBelgranoAndroidStrings = config => withStringsXml(config, config => {
  config.modResults = AndroidConfig.Strings.setStringItem(
    [AndroidConfig.Resources.buildResourceItem({ name: 'loading_assets', value: LOADING_ASSETS_TEXT })],
    config.modResults
  );
  return config;
});

// Only local notifications are used, so drop the push entitlement expo-notifications adds.
// This plugin must be listed BEFORE expo-notifications in app.json: mods registered earlier run later.
const withoutPushEntitlement = config => withEntitlementsPlist(config, config => {
  delete config.modResults['aps-environment'];
  return config;
});


const withBelgranoInfoPlist = config => withInfoPlist(config, config => {
  const urlTypes = config.modResults.CFBundleURLTypes || [];
  for (const urlType of urlTypes) {
    if (Array.isArray(urlType.CFBundleURLSchemes)) {
      urlType.CFBundleURLSchemes = [...new Set(urlType.CFBundleURLSchemes)];
    }
  }
  config.modResults.CFBundleURLTypes = urlTypes;
  return config;
});

const withBelgranoAndroidManifest = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  manifest['uses-permission'] = manifest['uses-permission'] || [];

  const ensurePermission = name => {
    if (!manifest['uses-permission'].some(permission => permission.$?.['android:name'] === name)) {
      manifest['uses-permission'].push({ $: { 'android:name': name } });
    }
  };

  ensurePermission('android.permission.POST_NOTIFICATIONS');

  return config;
});

const withBelgranoGradleProperties = config => withGradleProperties(config, config => {
  ensureGradleProperty(config.modResults, 'org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m');
  ensureGradleProperty(config.modResults, 'android.enableJetifier', 'true');
  ensureGradleProperty(config.modResults, 'newArchEnabled', 'false');
  ensureGradleProperty(config.modResults, 'hermesEnabled', 'true');
  ensureGradleProperty(config.modResults, 'expo.gif.enabled', 'true');
  ensureGradleProperty(config.modResults, 'expo.webp.enabled', 'true');
  ensureGradleProperty(config.modResults, 'expo.webp.animated', 'false');
  ensureGradleProperty(config.modResults, 'expo.useLegacyPackaging', 'false');

  return config;
});

const withBelgranoSettingsGradle = config => withSettingsGradle(config, config => {
  config.modResults.contents = ensureLine(
    config.modResults.contents,
    "include ':react-native-splash-screen'"
  );
  config.modResults.contents = ensureLine(
    config.modResults.contents,
    "project(':react-native-splash-screen').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-splash-screen/android')"
  );

  return config;
});

const withBelgranoAppBuildGradle = config => withAppBuildGradle(config, config => {
  let contents = config.modResults.contents;

  if (!contents.includes('def props = new Properties()')) {
    contents = contents.replace(/def projectRoot = /, `${RELEASE_SIGNING_LOADER}\ndef projectRoot = `);
  }

  if (!contents.includes("props.containsKey('MYAPP_UPLOAD_STORE_FILE')")) {
    contents = contents.replace(/(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*}\n)(\s*})/, `$1${RELEASE_SIGNING_CONFIG}$2`);
  }

  const buildTypesMarker = '    buildTypes {';
  if (contents.includes(buildTypesMarker)) {
    const [beforeBuildTypes, ...afterBuildTypesParts] = contents.split(buildTypesMarker);
    let afterBuildTypes = afterBuildTypesParts.join(buildTypesMarker);
    afterBuildTypes = afterBuildTypes.replace(
      /debug\s*\{\s*signingConfig signingConfigs\.[^\n]+\s*\}/,
      `debug {
            signingConfig signingConfigs.debug
        }`
    );
    afterBuildTypes = afterBuildTypes.replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );
    contents = `${beforeBuildTypes}${buildTypesMarker}${afterBuildTypes}`;
  }

  if (!contents.includes("implementation project(':react-native-splash-screen')")) {
    contents = contents.replace(/dependencies\s*\{/, "dependencies {\n    implementation project(':react-native-splash-screen')");
  }

  contents = ensureLine(contents, 'apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")');

  if (!contents.includes('belgranoBuildFingerprint')) {
    contents = ensureLine(contents, BUILD_FINGERPRINT_GRADLE_INPUTS.trim());
  }

  config.modResults.contents = contents;
  return config;
});

const withBelgranoMainActivity = config => withMainActivity(config, config => {
  if (config.modResults.language !== 'kt') {
    return config;
  }

  let contents = config.modResults.contents;

  if (!contents.includes('org.devio.rn.splashscreen.SplashScreen')) {
    contents = contents.replace(
      'import android.os.Bundle\n',
      'import android.os.Bundle\n\nimport org.devio.rn.splashscreen.SplashScreen\n'
    );
  }

  if (!contents.includes('SplashScreen.show(this)')) {
    contents = contents.replace(
      /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/,
      'override fun onCreate(savedInstanceState: Bundle?) {\n    SplashScreen.show(this)\n\n'
    );
  }

  config.modResults.contents = contents;
  return config;
});

const withBelgranoAndroidResources = config => withDangerousMod(config, ['android', config => {
  const androidRoot = config.modRequest.platformProjectRoot;
  const mainRes = path.join(androidRoot, 'app', 'src', 'main', 'res');

  for (const [dir, colors] of Object.entries(EXTRA_SPLASH_COLOR_DIRS)) {
    writeFile(path.join(mainRes, dir, 'colors.xml'), renderColorsXml(colors));
  }
  writeFile(path.join(mainRes, 'layout', 'launch_screen.xml'), LAUNCH_SCREEN_XML);

  return config;
}]);

module.exports = function withBelgranoNativeConfig(config) {
  config = withBelgranoAndroidManifest(config);
  config = withBelgranoGradleProperties(config);
  config = withBelgranoSettingsGradle(config);
  config = withBelgranoAppBuildGradle(config);
  config = withBelgranoMainActivity(config);
  config = withBelgranoAndroidResources(config);
  config = withBelgranoAndroidColors(config);
  config = withBelgranoAndroidStyles(config);
  config = withBelgranoAndroidStrings(config);
  config = withBelgranoNetworkSecurity(config);
  config = withBelgranoDeviceModule(config);
  config = withBelgranoInfoPlist(config);
  config = withoutPushEntitlement(config);

  return config;
};
