const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} = require('expo/config-plugins');

// The live ETA endpoint (HIGH_ACCURACY_ETA_URL) is only served over plain HTTP.
// Cleartext is allowed for this exact host only; everything else stays HTTPS-only.
const LIVE_ETA_CLEARTEXT_HOST = 'proximostrenes.ferrovias.com.ar';

const NETWORK_SECURITY_CONFIG_NAME = 'network_security_config';

const RELEASE_NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${LIVE_ETA_CLEARTEXT_HOST}</domain>
  </domain-config>
</network-security-config>
`;

// A network security config makes Android 7+ ignore android:usesCleartextTraffic, so debug
// variants get their own permissive copy (Metro is reached over plain HTTP on arbitrary LAN IPs,
// which domain-config cannot express). Variant resources override src/main at build time.
const DEBUG_NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

const DEBUG_SOURCE_SETS = ['debug', 'debugOptimized'];

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

const withNetworkSecurityConfigFiles = config => withDangerousMod(config, ['android', config => {
  const srcRoot = path.join(config.modRequest.platformProjectRoot, 'app', 'src');
  const xmlFile = path.join('res', 'xml', `${NETWORK_SECURITY_CONFIG_NAME}.xml`);

  writeFile(path.join(srcRoot, 'main', xmlFile), RELEASE_NETWORK_SECURITY_CONFIG);
  for (const sourceSet of DEBUG_SOURCE_SETS) {
    writeFile(path.join(srcRoot, sourceSet, xmlFile), DEBUG_NETWORK_SECURITY_CONFIG);
  }

  return config;
}]);

const withNetworkSecurityConfigManifest = config => withAndroidManifest(config, config => {
  const application = config.modResults.manifest.application?.[0];

  if (application) {
    application.$['android:networkSecurityConfig'] = `@xml/${NETWORK_SECURITY_CONFIG_NAME}`;
  }

  return config;
});

// app.json `ios.infoPlist` is merged shallowly and would replace the template's ATS dictionary,
// so the exception is merged here instead (keeps NSAllowsArbitraryLoads=false and local networking).
const withLiveEtaAppTransportSecurity = config => withInfoPlist(config, config => {
  const ats = config.modResults.NSAppTransportSecurity || {};

  config.modResults.NSAppTransportSecurity = {
    ...ats,
    NSExceptionDomains: {
      ...(ats.NSExceptionDomains || {}),
      [LIVE_ETA_CLEARTEXT_HOST]: {
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: false,
      },
    },
  };

  return config;
});

module.exports = function withBelgranoNetworkSecurity(config) {
  config = withNetworkSecurityConfigFiles(config);
  config = withNetworkSecurityConfigManifest(config);
  config = withLiveEtaAppTransportSecurity(config);

  return config;
};
