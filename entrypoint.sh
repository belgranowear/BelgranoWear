#!/bin/bash

set -euo pipefail

export ANDROID_HOME=${ANDROID_HOME:-/tmp/android/sdk}
export ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

export ARTIFACTS_PATH=${ARTIFACTS_PATH:-$(pwd)/artifacts}
export WEAROS_TEMP_PATH=${WEAROS_TEMP_PATH:-$(pwd)/wearos}

ACTION=${ACTION:-build}
MODE=${MODE:-publish}
PLATFORM=${PLATFORM:-${BUILD_PLATFORM:-android}}
BUILD_FINGERPRINT=${BUILD_FINGERPRINT:-}
ANDROID_BASE_VERSION_CODE=${ANDROID_BASE_VERSION_CODE:-}
ANDROID_WEAR_VERSION_CODE=${ANDROID_WEAR_VERSION_CODE:-}
ENABLE_RELEASE_BUILDS=false

case "$PLATFORM" in
    android|ios|both) ;;
    *)
        echo "Unsupported PLATFORM '$PLATFORM'. Expected android, ios, or both."
        exit 1
        ;;
esac

platform_includes_android() {
    [[ "$PLATFORM" == 'android' || "$PLATFORM" == 'both' ]]
}

platform_includes_ios() {
    [[ "$PLATFORM" == 'ios' || "$PLATFORM" == 'both' ]]
}

group() {
    if [[ "${GITHUB_ACTIONS:-}" == 'true' ]]; then
        echo "::group::$1"
    else
        echo ""
        echo "=> $1"
    fi
}

endgroup() {
    if [[ "${GITHUB_ACTIONS:-}" == 'true' ]]; then
        echo '::endgroup::'
    fi
}

summary() {
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
        printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
    fi
}

run_npm_install() {
    group 'Install JavaScript dependencies'
    if [[ "${SKIP_NPM_INSTALL:-false}" == 'true' ]]; then
        echo 'Skipping npm install because SKIP_NPM_INSTALL=true.'
        endgroup
        return
    fi

    if [[ -f package-lock.json ]]; then
        npm ci
    else
        npm install
    fi
    endgroup
}

prepare_workspace() {
    group 'Prepare Git and artifacts directory'
    git config --global --add safe.directory "$(pwd)" || true
    rm -rf "$ARTIFACTS_PATH"
    mkdir -p "$ARTIFACTS_PATH"
    endgroup
}

compute_build_fingerprint() {
    if [[ -n "$BUILD_FINGERPRINT" ]]; then
        printf '%s' "$BUILD_FINGERPRINT"
        return
    fi

    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git ls-files -z -- \
            .env App.js app.json babel.config.js package.json package-lock.json \
            assets components includes plugins Dockerfile docker-compose.yml entrypoint.sh \
            2>/dev/null \
            | xargs -0 sha256sum \
            | sha256sum \
            | awk '{print $1}'
    else
        find . \
            -path './node_modules' -prune -o \
            -path './android' -prune -o \
            -path './ios' -prune -o \
            -path './artifacts' -prune -o \
            -path './wearos' -prune -o \
            -type f -print0 \
            | sort -z \
            | xargs -0 sha256sum \
            | sha256sum \
            | awk '{print $1}'
    fi
}

configured_android_version_code() {
    node - <<'NODE'
const app = require('./app.json');
const versionCode = app?.expo?.android?.versionCode ?? 1;
console.log(versionCode);
NODE
}

resolve_android_version_codes() {
    if [[ -z "$ANDROID_BASE_VERSION_CODE" ]]; then
        if [[ -n "${GITHUB_RUN_NUMBER:-}" ]]; then
            local offset="${ANDROID_VERSION_CODE_OFFSET:-43}"
            ANDROID_BASE_VERSION_CODE=$((offset + (GITHUB_RUN_NUMBER * 2)))
        else
            ANDROID_BASE_VERSION_CODE=$(configured_android_version_code)
        fi
    fi

    if [[ -z "$ANDROID_WEAR_VERSION_CODE" ]]; then
        ANDROID_WEAR_VERSION_CODE=$((ANDROID_BASE_VERSION_CODE + 1))
    fi

    if ! [[ "$ANDROID_BASE_VERSION_CODE" =~ ^[0-9]+$ && "$ANDROID_WEAR_VERSION_CODE" =~ ^[0-9]+$ ]]; then
        echo "Android version codes must be positive integers. Got base='$ANDROID_BASE_VERSION_CODE' wear='$ANDROID_WEAR_VERSION_CODE'."
        exit 1
    fi

    if (( ANDROID_WEAR_VERSION_CODE != ANDROID_BASE_VERSION_CODE + 1 )); then
        echo "WearOS versionCode must be exactly Android base versionCode + 1. Got base=$ANDROID_BASE_VERSION_CODE wear=$ANDROID_WEAR_VERSION_CODE."
        exit 1
    fi

    export ANDROID_BASE_VERSION_CODE
    export ANDROID_WEAR_VERSION_CODE
}

set_android_version_code() {
    local version_code="$1"
    TARGET_ANDROID_VERSION_CODE="$version_code" python3 - <<'PY'
from pathlib import Path
import os
import re

build_gradle = Path('android/app/build.gradle')
version_code = os.environ['TARGET_ANDROID_VERSION_CODE']
text = build_gradle.read_text()
if not re.search(r'versionCode\s+\d+', text):
    raise SystemExit('versionCode not found in android/app/build.gradle')
text = re.sub(r'versionCode\s+\d+', f'versionCode {version_code}', text, count=1)
build_gradle.write_text(text)
print(f'Android versionCode set to {version_code}')
PY
}

write_gradle_secrets() {
    group 'Configure Android release signing inputs'

    if [[ -z "${RELEASE_KEYSTORE:-}" ]]; then
        echo 'WARNING: Missing RELEASE_KEYSTORE; release builds will be skipped.'
    fi

    if [[ -z "${RELEASE_KEYSTORE_PASSPHRASE:-}" ]]; then
        echo 'WARNING: Missing RELEASE_KEYSTORE_PASSPHRASE; release builds will be skipped.'
    fi

    if [[ -z "${GRADLE_PROPERTIES:-}" ]]; then
        echo 'WARNING: Missing GRADLE_PROPERTIES; release builds will be skipped.'
    fi

    if [[ -n "${RELEASE_KEYSTORE:-}" && -n "${RELEASE_KEYSTORE_PASSPHRASE:-}" && -n "${GRADLE_PROPERTIES:-}" ]]; then
        ENABLE_RELEASE_BUILDS=true

        echo 'Storing temporary Gradle properties...'
        mkdir -p "$HOME/.gradle"
        printf -- '%s' "$GRADLE_PROPERTIES" > "$HOME/.gradle/gradle.properties"

        # shellcheck disable=SC1091
        . "$HOME/.gradle/gradle.properties"

        if ! grep -q '^org.gradle.jvmargs=' "$HOME/.gradle/gradle.properties"; then
            printf '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\n' >> "$HOME/.gradle/gradle.properties"
        fi

        echo "Storing encrypted keystore at $MYAPP_UPLOAD_STORE_FILE.asc..."
        printf -- '%s' "$RELEASE_KEYSTORE" > "$MYAPP_UPLOAD_STORE_FILE.asc"

        echo 'Decrypting keystore...'
        gpg -d --passphrase "$RELEASE_KEYSTORE_PASSPHRASE" --batch "$MYAPP_UPLOAD_STORE_FILE.asc" > "$MYAPP_UPLOAD_STORE_FILE"
    fi

    if [[ "$MODE" == 'publish' && "$ENABLE_RELEASE_BUILDS" != 'true' ]]; then
        echo 'Cannot publish Android artifacts without release signing secrets.'
        exit 1
    fi

    endgroup
}

install_android_sdk() {
    group 'Install Android SDK platform and accept licenses'
    set +o pipefail
    yes | sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006'
    yes | sdkmanager --licenses
    set -o pipefail
    endgroup
}

prebuild_android() {
    group 'Expo prebuild for Android'
    rm -rf android
    npx expo prebuild --clean --platform android --no-install
    chmod +x android/gradlew
    endgroup
}

prebuild_ios_mock() {
    group 'Expo prebuild for iOS (IPA mock disabled)'
    rm -rf ios
    npx expo prebuild --clean --platform ios --no-install
    echo 'IPA compilation is intentionally mocked and disabled for now; no iOS archive will be produced.'
    summary '- iOS selected: Expo prebuild completed, IPA compilation mocked/skipped.'
    endgroup
}

build_android_variant() {
    local label="$1"
    local suffix="$2"

    group "Compile $label Android APK/AAB"
    pushd android >/dev/null
    ./gradlew \
        -PbelgranoBuildFingerprint="$BUILD_FINGERPRINT" \
        "bundle${suffix}" \
        "assemble${suffix}"
    popd >/dev/null
    endgroup
}

copy_android_artifacts() {
    local source_dir="$1"
    local name_suffix="${2:-}"

    group "Copy Android artifacts${name_suffix:+ ($name_suffix)}"
    while IFS= read -r -d '' file; do
        local file_name
        file_name=$(basename "$file")

        if [[ -n "$name_suffix" ]]; then
            file_name=$(printf '%s' "$file_name" | sed "s/\./-${name_suffix}./")
        fi

        cp -v "$file" "$ARTIFACTS_PATH/$file_name"
    done < <(find "$source_dir" -type f \( -name '*.apk' -o -name '*.aab' \) -print0)
    endgroup
}

configure_wearos_manifest() {
    python3 - <<'PY'
from pathlib import Path

manifest_path = Path('android/app/src/main/AndroidManifest.xml')
text = manifest_path.read_text()

feature = '  <uses-feature android:name="android.hardware.type.watch" />\n'
if 'android.hardware.type.watch' not in text:
    if '  <queries>' in text:
        text = text.replace('  <queries>', feature + '\n  <queries>', 1)
    else:
        text = text.replace('  <application', feature + '\n  <application', 1)

metadata = '    <meta-data android:name="com.google.android.wearable.standalone" android:value="true"/>\n'
if 'com.google.android.wearable.standalone' not in text:
    text = text.replace('    <activity ', metadata + '\n    <activity ', 1)

manifest_path.write_text(text)
PY
}

build_wearos_artifacts() {
    group 'Prepare temporary WearOS project'
    rm -rf "$WEAROS_TEMP_PATH"
    mkdir -p "$WEAROS_TEMP_PATH"
    rsync -a \
        --exclude /wearos \
        --exclude /artifacts \
        --exclude /.git \
        --exclude /ios \
        --exclude /android/.gradle \
        --exclude /android/build \
        --exclude /android/app/build \
        ./ "$WEAROS_TEMP_PATH/"
    endgroup

    pushd "$WEAROS_TEMP_PATH" >/dev/null

    group 'Apply WearOS manifest and versionCode changes'
    configure_wearos_manifest
    set_android_version_code "$ANDROID_WEAR_VERSION_CODE"
    endgroup

    build_android_variant 'WearOS debug' 'Debug'

    if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
        build_android_variant 'WearOS release' 'Release'
    fi

    copy_android_artifacts './android/app/build/outputs' 'wear'
    popd >/dev/null
}

build_android() {
    resolve_android_version_codes

    summary "## Rebuild summary"
    summary "- Requested platform: $PLATFORM"
    summary "- Build fingerprint: \`$BUILD_FINGERPRINT\`"
    summary "- Android base versionCode: \`$ANDROID_BASE_VERSION_CODE\`"
    summary "- WearOS versionCode: \`$ANDROID_WEAR_VERSION_CODE\`"

    write_gradle_secrets
    install_android_sdk
    prebuild_android
    set_android_version_code "$ANDROID_BASE_VERSION_CODE"

    build_android_variant 'base debug' 'Debug'

    if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
        build_android_variant 'base release' 'Release'
    fi

    copy_android_artifacts './android/app/build/outputs'
    build_wearos_artifacts

    summary '- Android/WearOS artifacts generated.'
}

publish_release() {
    if [[ "$MODE" != 'publish' ]]; then
        summary '- Release publishing skipped because MODE is not publish.'
        return
    fi

    if [[ -z "${GITHUB_TOKEN:-}" ]]; then
        echo 'Cannot publish releases without GITHUB_TOKEN. Provide a token or set MODE=test.'
        exit 1
    fi

    if ! find "$ARTIFACTS_PATH" -type f \( -name '*.apk' -o -name '*.aab' -o -name '*.ipa' \) | grep -q .; then
        echo 'No native artifacts were generated; skipping release publishing.'
        summary '- Release publishing skipped because there were no artifacts.'
        return
    fi

    group 'Publish GitHub release'
    local last_commit_message last_commit_sha payload response release_id upload_url
    last_commit_message=$(git log -1 --pretty=%s)
    last_commit_sha=$(git log -1 --pretty=%h)

    payload=$(jq -n \
        --arg tag_name "$last_commit_sha" \
        --arg target_commitish 'master' \
        --arg name "$last_commit_sha" \
        --arg body "$last_commit_message" \
        '{tag_name: $tag_name, target_commitish: $target_commitish, name: $name, body: $body, draft: false, prerelease: false, generate_release_notes: false}')

    response=$(curl -L \
        --fail \
        -X POST \
        -H 'Accept: application/vnd.github+json' \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "https://api.github.com/repos/$GITHUB_REPOSITORY/releases" \
        -d "$payload")

    release_id=$(echo "$response" | jq -cr '.id')
    upload_url=$(echo "$response" | jq -cr '.upload_url' | cut -d'{' -f1)

    while IFS= read -r -d '' file; do
        local file_name mime_type content_length
        file_name=$(basename "$file")
        mime_type=$(file -b --mime-type "$file")
        content_length=$(wc -c < "$file" | xargs)

        echo "Uploading $file_name to release #$release_id..."
        curl -s -L \
            -X POST \
            -H "Authorization: Bearer $GITHUB_TOKEN" \
            -H 'Accept: application/vnd.github.v3+json' \
            -H "Content-Type: $mime_type" \
            -H "Content-Length: $content_length" \
            -T "$file" \
            "$upload_url?name=$file_name"
    done < <(find "$ARTIFACTS_PATH" -type f -print0)

    summary "- Published GitHub release #$release_id."
    endgroup
}

if [[ "$ACTION" == 'run' ]]; then
    run_npm_install
    EXPO_HOST=${EXPO_HOST:-lan}

    echo "=> Starting Expo Go dev server with host mode: $EXPO_HOST..."
    if [[ "$EXPO_HOST" == 'lan' && -z "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
        echo '=> Tip: when using Docker on LAN, set REACT_NATIVE_PACKAGER_HOSTNAME to your host machine LAN IP if Expo prints an unreachable container IP.'
    fi

    npx expo start --go --host "$EXPO_HOST" --clear
    exit $?
fi

export CI=${CI:-1}

run_npm_install
BUILD_FINGERPRINT=$(compute_build_fingerprint)
export BUILD_FINGERPRINT
export ORG_GRADLE_PROJECT_belgranoBuildFingerprint="$BUILD_FINGERPRINT"

echo "Starting operation with ACTION=$ACTION MODE=$MODE PLATFORM=$PLATFORM BUILD_FINGERPRINT=$BUILD_FINGERPRINT"

prepare_workspace

if platform_includes_android; then
    build_android
else
    summary "## Rebuild summary"
    summary "- Requested platform: $PLATFORM"
    summary "- Build fingerprint: \`$BUILD_FINGERPRINT\`"
    summary '- Android skipped by platform selection.'
fi

if platform_includes_ios; then
    prebuild_ios_mock
fi

publish_release

exit 0
