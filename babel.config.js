// Expo CLI loads .env into process.env before bundling (`expo start` and `expo export:embed`),
// so only the variables the app reads are inlined; anything else in the build environment
// (CI secrets included) must never reach the bundle. EXPO_PUBLIC_* / EXPO_OS are handled by
// babel-preset-expo and intentionally left out of this list.
const INLINED_ENV_VARS = [
  'REMOTE_BASE_URL',
  'HIGH_ACCURACY_ETA_URL',
  'EXIT_SWIPE_X_MAX_OFFSET_THRESHOLD',
  'GPS_FIX_TIMEOUT',
  'CACHE_MAX_UNMATCHED_KEYS_FOR_CLEAR',
  'SCREEN_SMALL_WIDTH_PX',
];

module.exports = function(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [ 'transform-inline-environment-variables', { include: INLINED_ENV_VARS } ]
    ]
  };
};
