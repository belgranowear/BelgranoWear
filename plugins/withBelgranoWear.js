const fs = require('fs');
const path = require('path');
const {
    WarningAggregator,
    withAndroidManifest,
    withAppBuildGradle,
    withDangerousMod,
    withGradleProperties,
} = require('expo/config-plugins');

// Wear OS native surfaces: next-train Tile, complication data source, Ongoing Activity for the
// live trip, plus the watch-only manifest/Gradle changes (watch feature, standalone flag,
// minSdk ≥ 26, Wear dependencies). Only active when BELGRANO_WEAR=1 (the WearOS prebuild that
// entrypoint.sh runs inside $WEAROS_TEMP_PATH); the phone build is left untouched.
//
// List this plugin FIRST in app.json "plugins": mods registered earlier run later, so the
// manifest mod sees (and can drop) the phone-only widget receivers added by withBelgranoLiveTrip.

const PLUGIN = 'withBelgranoWear';
const WEAR_MIN_SDK = 26;

// Versions: see docs/ui/notes/K.md. Tiles 1.4.x + ProtoLayout 1.2.x are the stable pair whose
// ListenableFuture/ProtoLayout APIs are used by the generated Kotlin; all build against
// compileSdk 36 / AGP 8.11 / Kotlin 2.1.20 (React Native 0.81).
const WEAR_DEPENDENCIES = [
    'androidx.wear.tiles:tiles:1.4.1',
    'androidx.wear.protolayout:protolayout:1.2.1',
    'androidx.wear.protolayout:protolayout-expression:1.2.1',
    'androidx.wear.protolayout:protolayout-material:1.2.1',
    'androidx.wear.watchface:watchface-complications-data-source:1.2.1',
    'androidx.wear:wear-ongoing:1.0.0',
    'androidx.concurrent:concurrent-futures:1.2.0',
];

const DEPENDENCIES_MARKER = '// belgrano-wear dependencies';

const KOTLIN_SOURCES = [
    'BelgranoWearSnapshot.kt',
    'BelgranoNextTrainTile.kt',
    'BelgranoNextTrainComplication.kt',
    'BelgranoWearOngoing.kt',
    'BelgranoWearSnapshotReceiver.kt',
];

// Phone-only components from withBelgranoLiveTrip (home-screen widgets) dropped from the watch.
const PHONE_ONLY_RECEIVERS = [
    'BelgranoTripWidgetSmall',
    'BelgranoTripWidgetWide',
];

const TILE_SERVICE = '.BelgranoNextTrainTile';
const COMPLICATION_SERVICE = '.BelgranoNextTrainComplication';
const SNAPSHOT_RECEIVER = '.BelgranoWearSnapshotReceiver';

const STRINGS = {
    en: {
        wear_native_tile_label:                 'Next train',
        wear_native_complication_label:         'Next train',
        wear_native_empty:                      'Open the app to pick a trip',
        wear_native_empty_short:                'Pick a trip',
        wear_native_no_trains:                  'No more trains',
        wear_native_open:                       'Open',
        wear_native_now:                        'now',
        wear_native_in_minutes:                 'in %1$d min',
        wear_native_then:                       'Then %1$s',
        wear_native_source_live:                'Live',
        wear_native_source_scheduled:           'Scheduled',
        wear_native_source_offline:             'Offline',
        wear_native_updated_now:                '%1$s · just now',
        wear_native_updated_ago:                '%1$s · %2$d min ago',
        wear_native_complication_description:   'Next train to %1$s at %2$s',
        wear_native_tracking_title:             'Following · %1$s',
        wear_native_next_station:               'Next: %1$s',
        wear_native_arrive_at:                  'Arrive %1$s',
        wear_native_channel_name:               'Live trip',
    },
    es: {
        wear_native_tile_label:                 'Próximo tren',
        wear_native_complication_label:         'Próximo tren',
        wear_native_empty:                      'Abrí la app para elegir un viaje',
        wear_native_empty_short:                'Elegí un viaje',
        wear_native_no_trains:                  'No hay más trenes',
        wear_native_open:                       'Abrir',
        wear_native_now:                        'ahora',
        wear_native_in_minutes:                 'en %1$d min',
        wear_native_then:                       'Después %1$s',
        wear_native_source_live:                'En vivo',
        wear_native_source_scheduled:           'Programado',
        wear_native_source_offline:             'Sin conexión',
        wear_native_updated_now:                '%1$s · recién',
        wear_native_updated_ago:                '%1$s · hace %2$d min',
        wear_native_complication_description:   'Próximo tren a %1$s a las %2$s',
        wear_native_tracking_title:             'Siguiendo · %1$s',
        wear_native_next_station:               'Próxima: %1$s',
        wear_native_arrive_at:                  'Llegás %1$s',
        wear_native_channel_name:               'Viaje en vivo',
    },
};

const TRAIN_PATH = 'M12,2c-4,0 -8,0.5 -8,4v9.5C4,17.43 5.57,19 7.5,19L6,20.5v0.5h2.23l2,-2H14l2,2h2v-0.5L16.5,19c1.93,0 3.5,-1.57 3.5,-3.5V6c0,-3.5 -3.58,-4 -8,-4zM7.5,17c-0.83,0 -1.5,-0.67 -1.5,-1.5S6.67,14 7.5,14s1.5,0.67 1.5,1.5S8.33,17 7.5,17zM11,10H6V6h5v4zM13,10V6h5v4h-5zM16.5,17c-0.83,0 -1.5,-0.67 -1.5,-1.5s0.67,-1.5 1.5,-1.5 1.5,0.67 1.5,1.5 -0.67,1.5 -1.5,1.5z';

const ONGOING_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="${TRAIN_PATH}"/>
</vector>
`;

// Static preview shown in the tile picker (round 192 dp layout: icon, big time, chip).
const TILE_PREVIEW_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="192dp" android:height="192dp"
    android:viewportWidth="192" android:viewportHeight="192">
  <path android:fillColor="#FF080403" android:pathData="M96,0a96,96 0,1 1,0 192a96,96 0,1 1,0 -192z"/>
  <path android:fillColor="#FFBE4936" android:pathData="M96,22a14,14 0,1 1,0 28a14,14 0,1 1,0 -28z"/>
  <group android:translateX="86" android:translateY="26" android:scaleX="0.85" android:scaleY="0.85">
    <path android:fillColor="#FFFFFFFF" android:pathData="${TRAIN_PATH}"/>
  </group>
  <path android:fillColor="#FFD8C2BD" android:pathData="M58,58h76a3,3 0,0 1,0 6h-76a3,3 0,0 1,0 -6z"/>
  <path android:fillColor="#FFFFF7F4" android:pathData="M50,74h92a8,8 0,0 1,8 8v14a8,8 0,0 1,-8 8h-92a8,8 0,0 1,-8 -8v-14a8,8 0,0 1,8 -8z"/>
  <path android:fillColor="#FFD8C2BD" android:pathData="M68,112h56a4,4 0,0 1,0 8h-56a4,4 0,0 1,0 -8z"/>
  <path android:fillColor="#FF7BD88F" android:pathData="M74,128h44a3,3 0,0 1,0 6h-44a3,3 0,0 1,0 -6z"/>
  <path android:fillColor="#FFBE4936" android:pathData="M62,146h68a14,14 0,0 1,0 28h-68a14,14 0,0 1,0 -28z"/>
</vector>
`;

const isWearBuild = () => process.env.BELGRANO_WEAR === '1';

function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

const renderStringsXml = strings => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by plugins/withBelgranoWear.js (BELGRANO_WEAR=1 builds only). -->
<resources>
${Object.entries(strings).map(([name, value]) => `    <string name="${name}"${value.includes('%') ? ' formatted="true"' : ''}>${escapeXml(value)}</string>`).join('\n')}
</resources>
`;

function writeFile(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

const withWearSources = config => withDangerousMod(config, ['android', config => {
    const packageName = config.android?.package;

    if (!packageName) {
        throw new Error(`${PLUGIN}: expo.android.package is required`);
    }

    const mainDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main');
    const packageDir = path.join(mainDir, 'java', ...packageName.split('.'));

    for (const file of KOTLIN_SOURCES) {
        const template = fs.readFileSync(path.join(__dirname, 'wear', file), 'utf8');
        writeFile(path.join(packageDir, file), template.replace(/__PACKAGE__/g, packageName));
    }

    const resDir = path.join(mainDir, 'res');
    writeFile(path.join(resDir, 'values', 'belgrano_wear_strings.xml'), renderStringsXml(STRINGS.en));
    writeFile(path.join(resDir, 'values-es', 'belgrano_wear_strings.xml'), renderStringsXml(STRINGS.es));
    writeFile(path.join(resDir, 'drawable', 'belgrano_wear_ongoing_icon.xml'), ONGOING_ICON_XML);
    writeFile(path.join(resDir, 'drawable', 'belgrano_tile_preview.xml'), TILE_PREVIEW_XML);

    return config;
}]);

const withWearGradleProperties = config => withGradleProperties(config, config => {
    const key = 'android.minSdkVersion';
    const existing = config.modResults.find(item => item.type === 'property' && item.key === key);
    const current = existing ? parseInt(existing.value, 10) : NaN;

    if (!existing) {
        config.modResults.push({ type: 'property', key, value: String(WEAR_MIN_SDK) });
    } else if (!(current >= WEAR_MIN_SDK)) {
        existing.value = String(WEAR_MIN_SDK);
    }

    return config;
});

const withWearAppBuildGradle = config => withAppBuildGradle(config, config => {
    let contents = config.modResults.contents;

    if (!contents.includes(DEPENDENCIES_MARKER)) {
        const lines = WEAR_DEPENDENCIES.map(dependency => `    implementation("${dependency}")`).join('\n');

        if (/dependencies\s*\{/.test(contents)) {
            contents = contents.replace(/dependencies\s*\{/, `dependencies {\n    ${DEPENDENCIES_MARKER}\n${lines}\n`);
        } else {
            throw new Error(`${PLUGIN}: could not find the dependencies block in app/build.gradle`);
        }
    }

    // Belt and braces for templates that hardcode minSdkVersion instead of reading expoLibs.
    contents = contents.replace(/minSdkVersion\s+(\d+)\b/, (match, value) =>
        parseInt(value, 10) < WEAR_MIN_SDK ? `minSdkVersion ${WEAR_MIN_SDK}` : match
    );

    config.modResults.contents = contents;
    return config;
});

const byName = name => item => item.$?.['android:name'] === name;

function upsert(list, name, element) {
    const index = list.findIndex(byName(name));

    if (index >= 0) {
        list[index] = element;
    } else {
        list.push(element);
    }
}

const metaData = (name, attrs) => ({ $: { 'android:name': name, ...attrs } });

const withWearManifest = config => withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
        throw new Error(`${PLUGIN}: AndroidManifest.xml has no <application>`);
    }

    manifest['uses-feature'] = manifest['uses-feature'] || [];
    upsert(manifest['uses-feature'], 'android.hardware.type.watch', { $: { 'android:name': 'android.hardware.type.watch' } });

    application['meta-data'] = application['meta-data'] || [];
    upsert(application['meta-data'], 'com.google.android.wearable.standalone', metaData('com.google.android.wearable.standalone', { 'android:value': 'true' }));

    application.service = application.service || [];
    upsert(application.service, TILE_SERVICE, {
        $: {
            'android:name': TILE_SERVICE,
            'android:exported': 'true',
            'android:label': '@string/wear_native_tile_label',
            'android:icon': '@mipmap/ic_launcher',
            'android:permission': 'com.google.android.wearable.permission.BIND_TILE_PROVIDER',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'androidx.wear.tiles.action.BIND_TILE_PROVIDER' } }] }],
        'meta-data': [metaData('androidx.wear.tiles.PREVIEW', { 'android:resource': '@drawable/belgrano_tile_preview' })],
    });
    upsert(application.service, COMPLICATION_SERVICE, {
        $: {
            'android:name': COMPLICATION_SERVICE,
            'android:exported': 'true',
            'android:label': '@string/wear_native_complication_label',
            'android:icon': '@drawable/belgrano_wear_ongoing_icon',
            'android:permission': 'com.google.android.wearable.permission.BIND_COMPLICATION_PROVIDER',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.support.wearable.complications.ACTION_COMPLICATION_UPDATE_REQUEST' } }] }],
        'meta-data': [
            metaData('android.support.wearable.complications.SUPPORTED_TYPES', { 'android:value': 'SHORT_TEXT,LONG_TEXT,RANGED_VALUE' }),
            metaData('android.support.wearable.complications.UPDATE_PERIOD_SECONDS', { 'android:value': '300' }),
        ],
    });

    application.receiver = application.receiver || [];
    upsert(application.receiver, SNAPSHOT_RECEIVER, {
        $: {
            'android:name': SNAPSHOT_RECEIVER,
            'android:exported': 'false',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': `${config.android?.package}.TRIP_SNAPSHOT_UPDATED` } }] }],
    });

    const isPhoneOnly = receiver => {
        const name = receiver.$?.['android:name'] || '';
        return PHONE_ONLY_RECEIVERS.some(simple => name === `.${simple}` || name.endsWith(`.${simple}`) || name === simple);
    };
    const before = application.receiver.length;
    application.receiver = application.receiver.filter(receiver => !isPhoneOnly(receiver));

    if (before === application.receiver.length) {
        WarningAggregator.addWarningAndroid(PLUGIN, `No phone widget receivers (${PHONE_ONLY_RECEIVERS.join(', ')}) found to remove; list ${PLUGIN} before withBelgranoLiveTrip in app.json if they show up in the watch manifest.`);
    }

    return config;
});

module.exports = function withBelgranoWear(config) {
    if (!isWearBuild()) {
        return config;
    }

    config = withWearSources(config);
    config = withWearGradleProperties(config);
    config = withWearAppBuildGradle(config);
    config = withWearManifest(config);

    return config;
};

module.exports.WEAR_DEPENDENCIES = WEAR_DEPENDENCIES;
module.exports.WEAR_MIN_SDK = WEAR_MIN_SDK;
