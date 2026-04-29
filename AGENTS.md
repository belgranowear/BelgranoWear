# Repository Guidelines

## Project Structure & Module Organization
BelgranoWear is an Expo/React Native app for Android, WearOS, iOS, and web. `App.js` defines the navigation stack and global UI setup. Screen and UI components live in `components/` (`DestinationPicker.js`, `NextSchedule.js`, offline-mode views). Shared helpers live in `includes/` (`Cache.js`, `Lang.js`). Static app assets are in `assets/`. Native project files are under `android/` and `ios/`; avoid editing generated native files unless the build or platform integration requires it. Build automation is in `Dockerfile`, `docker-compose.yml`, and `entrypoint.sh`.

## Build, Test, and Development Commands
- `npm install` — install JavaScript dependencies from `package-lock.json`.
- `npm start` — start the Expo development server locally.
- `npm run android` / `npm run ios` — run the native Expo app on an emulator or device.
- `npm run web` — start the web preview.
- Prefer the Docker environment for Expo/Android work so Node, JDK, and Android SDK versions stay aligned with SDK 54.
- `ACTION=run EXPO_HOST=tunnel docker compose up --build` — run the Expo Go dev server in Docker on port `8081`; tunnel mode is the most reliable from a phone because LAN mode can advertise the container IP.
- `REACT_NATIVE_PACKAGER_HOSTNAME=<host-lan-ip> ACTION=run EXPO_HOST=lan docker compose up --build` — faster LAN Expo Go server when the phone can reach the host machine directly.
- `MODE=test docker compose up --build` — create debug Android and WearOS artifacts in `artifacts/`.

## Coding Style & Naming Conventions
Use JavaScript with React function components and hooks. Keep component files in PascalCase (for example, `OfflineModeHint.js`) and helper modules in PascalCase when exporting singleton-like objects (for example, `Cache.js`). Follow the existing style: single quotes, semicolons, explicit `StyleSheet.create`, and aligned object properties where helpful. Prefer concise arrow functions for small callbacks, but keep async data-loading functions named and easy to trace in logs.

## Testing Guidelines
No automated test suite is currently configured. Before opening a PR, run the app through Expo and perform a Docker debug build. Manually verify location permission handling, offline cache fallback, Spanish/English text, small-screen WearOS layouts, and the destination-to-schedule flow.

For any UI work, you MUST validate the layout across the full supported device range before considering the task complete:
- Full mobile: both smartphone-sized and tablet-sized layouts.
- Smartwatch: both square displays and rounded WearOS displays.
- Include screenshots or device/emulator notes in the PR when the change affects visible UI, especially for rounded WearOS clipping/scrolling behavior.

If available, attempt to leverage `adb` logs and screenshot captures to verify the behavior on a physical device or emulator. For WearOS, the Android Emulator's WearOS profile can be used to test the watch-specific UI and interactions.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries with an optional scope, such as `NextSchedule: fix font scaling for alternative sizes on WearOS` or `Bump bundle version to 1.4.2 (39)`. Keep commits focused. PRs should describe user-visible changes, list manual verification steps, link related issues, and include screenshots or device notes for UI changes, especially WearOS changes.

## Security & Configuration Tips
Do not commit keystores, passphrases, `GRADLE_PROPERTIES`, generated `artifacts/`, or local `.env` files. Release builds require `RELEASE_KEYSTORE`, `RELEASE_KEYSTORE_PASSPHRASE`, and `GRADLE_PROPERTIES` as environment variables or CI secrets.

## Agent-Specific Instructions
When running shell commands in this repository, prefix commands with `rtk` to reduce output size; use raw commands only when debugging filtering issues.
