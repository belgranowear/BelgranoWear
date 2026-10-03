const fs = require('fs');
const path = require('path');
const {
  WarningAggregator,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

// Tiny bridge module (old architecture) exposing watch form-factor facts to JS as
// NativeModules.BelgranoDevice.{isScreenRound, hasWatchFeature}.
const MODULE_NAME = 'BelgranoDevice';
const PACKAGE_CLASS = 'BelgranoDevicePackage';

const moduleSource = packageName => `package ${packageName}

import android.content.pm.PackageManager

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class BelgranoDeviceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun getConstants(): Map<String, Any> {
    val context = reactApplicationContext

    return mapOf(
        "isScreenRound" to context.resources.configuration.isScreenRound,
        "hasWatchFeature" to context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH),
    )
  }

  companion object {
    const val NAME = "${MODULE_NAME}"
  }
}
`;

const packageSource = packageName => `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ${PACKAGE_CLASS} : ReactPackage {
  @Suppress("OVERRIDE_DEPRECATION")
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(BelgranoDeviceModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
`;

const withDeviceModuleSources = config => withDangerousMod(config, ['android', config => {
  const packageName = config.android?.package;

  if (!packageName) {
    throw new Error('withBelgranoDeviceModule: expo.android.package is required');
  }

  const packageDir = path.join(
    config.modRequest.platformProjectRoot,
    'app', 'src', 'main', 'java',
    ...packageName.split('.')
  );

  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'BelgranoDeviceModule.kt'), moduleSource(packageName));
  fs.writeFileSync(path.join(packageDir, `${PACKAGE_CLASS}.kt`), packageSource(packageName));

  return config;
}]);

const withDeviceModuleRegistration = config => withMainApplication(config, config => {
  if (config.modResults.language !== 'kt') {
    WarningAggregator.addWarningAndroid('withBelgranoDeviceModule', 'MainApplication is not Kotlin; BelgranoDevice was not registered.');
    return config;
  }

  let contents = config.modResults.contents;

  if (!contents.includes(`add(${PACKAGE_CLASS}())`)) {
    const anchor = /(PackageList\(this\)\.packages\.apply \{\n)/;

    if (anchor.test(contents)) {
      contents = contents.replace(anchor, `$1              add(${PACKAGE_CLASS}())\n`);
    } else {
      WarningAggregator.addWarningAndroid('withBelgranoDeviceModule', 'Could not find PackageList(this).packages.apply { in MainApplication; BelgranoDevice was not registered.');
    }
  }

  config.modResults.contents = contents;
  return config;
});

module.exports = function withBelgranoDeviceModule(config) {
  config = withDeviceModuleSources(config);
  config = withDeviceModuleRegistration(config);

  return config;
};
