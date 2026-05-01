const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withInfoPlist,
  withMainActivity,
  withSettingsGradle,
} = require('expo/config-plugins');

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

const SPLASH_COLORS = {
  day: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="splashscreen_background">#fff8f6</color>
  <color name="splashscreen_text">#251815</color>
  <color name="splashscreen_progress">#be4936</color>
  <color name="iconBackground">#000000</color>
  <color name="colorPrimary">#be4936</color>
  <color name="colorPrimaryDark">#be4936</color>
  <color name="ic_launcher_background">#000000</color>
</resources>
`,
  night: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="splashscreen_background">#080403</color>
  <color name="splashscreen_text">#fff7f4</color>
  <color name="splashscreen_progress">#ffb4a8</color>
</resources>
`,
};

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

function patchStylesXml(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  let contents = fs.readFileSync(filePath, 'utf8');
  contents = contents.replace(
    /<style name="AppTheme" parent="Theme\.AppCompat\.DayNight\.NoActionBar">[\s\S]*?<\/style>/,
    `<style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:textColor">@android:color/black</item>
    <item name="android:editTextStyle">@style/ResetEditText</item>
    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
    <item name="colorPrimary">@color/colorPrimary</item>
    <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
    <item name="android:windowBackground">@drawable/splashscreen</item>
    <item name="android:windowSwipeToDismiss">false</item>
  </style>`
  );

  if (!contents.includes('<style name="ResetEditText"')) {
    contents = contents.replace(
      /(<style name="Theme\.App\.SplashScreen")/,
      `<style name="ResetEditText" parent="@android:style/Widget.EditText">
    <item name="android:padding">0dp</item>
    <item name="android:textColorHint">#c8c8c8</item>
    <item name="android:textColor">@android:color/black</item>
  </style>
  $1`
    );
  }

  contents = contents.replace(
    /<style name="Theme\.App\.SplashScreen" parent="AppTheme">[\s\S]*?<\/style>/,
    `<style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowBackground">@drawable/splashscreen</item>
  </style>`
  );

  fs.writeFileSync(filePath, contents);
}


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
  ensurePermission('com.google.android.gms.permission.AD_ID');

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

  writeFile(path.join(mainRes, 'values', 'colors.xml'), SPLASH_COLORS.day);
  writeFile(path.join(mainRes, 'values-night', 'colors.xml'), SPLASH_COLORS.night);
  writeFile(path.join(mainRes, 'values-v31', 'colors.xml'), SPLASH_COLORS.day);
  writeFile(path.join(mainRes, 'values-night-v31', 'colors.xml'), SPLASH_COLORS.night);
  writeFile(path.join(mainRes, 'values-watch', 'colors.xml'), SPLASH_COLORS.night);
  writeFile(path.join(mainRes, 'values-watch-v31', 'colors.xml'), SPLASH_COLORS.night);
  writeFile(path.join(mainRes, 'layout', 'launch_screen.xml'), LAUNCH_SCREEN_XML);

  const stringsPath = path.join(mainRes, 'values', 'strings.xml');
  if (fs.existsSync(stringsPath)) {
    let strings = fs.readFileSync(stringsPath, 'utf8');
    if (!strings.includes('name="loading_assets"')) {
      strings = strings.replace('</resources>', '  <string name="loading_assets">Loading assets...</string>\n</resources>');
      fs.writeFileSync(stringsPath, strings);
    }
  }

  patchStylesXml(path.join(mainRes, 'values', 'styles.xml'));
  return config;
}]);

module.exports = function withBelgranoNativeConfig(config) {
  config = withBelgranoAndroidManifest(config);
  config = withBelgranoGradleProperties(config);
  config = withBelgranoSettingsGradle(config);
  config = withBelgranoAppBuildGradle(config);
  config = withBelgranoMainActivity(config);
  config = withBelgranoAndroidResources(config);
  config = withBelgranoInfoPlist(config);

  return config;
};
