const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  WarningAggregator,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

// F1 live trip tracking (Android): injects the `BelgranoLiveTrip` native module (old
// architecture), the ongoing / Live Update notification, the shared trip snapshot writer and the
// 2×2 / 4×2 home-screen widgets. Sources live in plugins/liveTrip/:
//   kotlin/*.kt.template → android/app/src/main/java/<package>/*.kt (__PACKAGE__ replaced)
//   res/**               → android/app/src/main/res/** (layouts, drawables, widget infos, colors)
// Idempotent: files are overwritten and manifest/MainApplication entries are only added once.
//
// Props: { widgets?: boolean } — widget receivers are registered unless `widgets: false` or the
// Wear OS build (`BELGRANO_WEAR=1`), which has no launcher widgets. The Kotlin classes and
// resources are always written so the module compiles in both builds.
const PLUGIN_NAME = 'withBelgranoLiveTrip';
const PACKAGE_CLASS = 'BelgranoLiveTripPackage';
const TEMPLATE_DIR = path.join(__dirname, 'liveTrip');

const ACTION_RECEIVER = '.BelgranoLiveTripActionReceiver';
const WIDGET_RECEIVERS = [
  { name: '.BelgranoTripWidgetSmall', label: '@string/belgrano_widget_small_label', info: '@xml/belgrano_trip_widget_small_info' },
  { name: '.BelgranoTripWidgetWide', label: '@string/belgrano_widget_wide_label', info: '@xml/belgrano_trip_widget_wide_info' },
];
const PERMISSIONS = [
  'android.permission.POST_NOTIFICATIONS',
  // Android 16 Live Updates (promoted ongoing notifications); normal permission, ignored before API 36.
  'android.permission.POST_PROMOTED_NOTIFICATIONS',
];

const copyTree = (from, to, transform) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);

    if (entry.isDirectory()) {
      copyTree(source, path.join(to, entry.name), transform);
      continue;
    }

    const { name, contents } = transform(entry.name, fs.readFileSync(source, 'utf8'));

    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, name), contents);
  }
};

const withLiveTripSources = config => withDangerousMod(config, ['android', config => {
  const packageName = config.android?.package;

  if (!packageName) {
    throw new Error(`${PLUGIN_NAME}: expo.android.package is required`);
  }

  const mainDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main');

  copyTree(
    path.join(TEMPLATE_DIR, 'kotlin'),
    path.join(mainDir, 'java', ...packageName.split('.')),
    (name, contents) => ({
      name: name.replace(/\.template$/, ''),
      contents: contents.replace(/__PACKAGE__/g, packageName),
    })
  );
  copyTree(path.join(TEMPLATE_DIR, 'res'), path.join(mainDir, 'res'), (name, contents) => ({ name, contents }));

  return config;
}]);

const withLiveTripRegistration = config => withMainApplication(config, config => {
  if (config.modResults.language !== 'kt') {
    WarningAggregator.addWarningAndroid(PLUGIN_NAME, 'MainApplication is not Kotlin; BelgranoLiveTrip was not registered.');
    return config;
  }

  let contents = config.modResults.contents;

  if (!contents.includes(`add(${PACKAGE_CLASS}())`)) {
    const anchor = /(PackageList\(this\)\.packages\.apply \{\n)/;

    if (anchor.test(contents)) {
      contents = contents.replace(anchor, `$1              add(${PACKAGE_CLASS}())\n`);
    } else {
      WarningAggregator.addWarningAndroid(PLUGIN_NAME, 'Could not find PackageList(this).packages.apply { in MainApplication; BelgranoLiveTrip was not registered.');
    }
  }

  config.modResults.contents = contents;
  return config;
});

const widgetReceiver = ({ name, label, info }) => ({
  $: { 'android:name': name, 'android:exported': 'true', 'android:label': label },
  'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
  'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': info } }],
});

const withLiveTripManifest = (config, { widgets }) => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

  manifest['uses-permission'] = manifest['uses-permission'] || [];
  for (const permission of PERMISSIONS) {
    if (!manifest['uses-permission'].some(item => item.$?.['android:name'] === permission)) {
      manifest['uses-permission'].push({ $: { 'android:name': permission } });
    }
  }

  const ownNames = [ACTION_RECEIVER, ...WIDGET_RECEIVERS.map(receiver => receiver.name)];
  const receivers = (application.receiver || []).filter(item => !ownNames.includes(item.$?.['android:name']));

  // Shared (phone + Wear): handles "Dejar de seguir" and the widget refresh tick.
  receivers.push({ $: { 'android:name': ACTION_RECEIVER, 'android:exported': 'false' } });

  // Phone only: home-screen widgets.
  if (widgets) {
    receivers.push(...WIDGET_RECEIVERS.map(widgetReceiver));
  }

  application.receiver = receivers;
  return config;
});

module.exports = function withBelgranoLiveTrip(config, props = {}) {
  const widgets = props.widgets !== false && process.env.BELGRANO_WEAR !== '1';

  config = withLiveTripSources(config);
  config = withLiveTripRegistration(config);
  config = withLiveTripManifest(config, { widgets });

  return config;
};
