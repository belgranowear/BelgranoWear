#!/bin/bash

set -euo pipefail

export ANDROID_HOME=${ANDROID_HOME:-/tmp/android/sdk}
export ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

export ARTIFACTS_PATH=${ARTIFACTS_PATH:-$(pwd)/artifacts}
export WEAROS_TEMP_PATH=${WEAROS_TEMP_PATH:-$(pwd)/wearos}

ACTION=${ACTION:-build}
# Publishing must be requested explicitly (CI passes MODE=publish).
MODE=${MODE:-test}
PLATFORM=${PLATFORM:-${BUILD_PLATFORM:-android}}
BUILD_FINGERPRINT=${BUILD_FINGERPRINT:-}
ANDROID_BASE_VERSION_CODE=${ANDROID_BASE_VERSION_CODE:-}
ANDROID_WEAR_VERSION_CODE=${ANDROID_WEAR_VERSION_CODE:-}
ENABLE_RELEASE_BUILDS=false
RELEASE_STORE_FILE=''

# Keep signing/publishing secrets in unexported shell variables only, so npm
# lifecycle scripts, Expo config plugins and Gradle never inherit them through
# the environment. They are written to disk right before they are needed.
SECRET_RELEASE_KEYSTORE=${RELEASE_KEYSTORE:-}
SECRET_RELEASE_KEYSTORE_PASSPHRASE=${RELEASE_KEYSTORE_PASSPHRASE:-}
SECRET_GRADLE_PROPERTIES=${GRADLE_PROPERTIES:-}
SECRET_GITHUB_TOKEN=${GITHUB_TOKEN:-}
unset RELEASE_KEYSTORE RELEASE_KEYSTORE_PASSPHRASE GRADLE_PROPERTIES GITHUB_TOKEN

# Files holding secrets that must not outlive this script.
CLEANUP_PATHS=()

cleanup_secret_files() {
    local path
    for path in "${CLEANUP_PATHS[@]}"; do
        rm -f -- "$path"
    done
}

trap cleanup_secret_files EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

case "$ACTION" in
    build|run) ;;
    *)
        echo "Unsupported ACTION '$ACTION'. Expected build or run."
        exit 1
        ;;
esac

case "$MODE" in
    test|publish) ;;
    *)
        echo "Unsupported MODE '$MODE'. Expected test or publish."
        exit 1
        ;;
esac

case "$PLATFORM" in
    android|ios|both) ;;
    *)
        echo "Unsupported PLATFORM '$PLATFORM'. Expected android, ios, or both."
        exit 1
        ;;
esac

if [[ "$ACTION" == 'build' && "$MODE" == 'publish' ]]; then
    if [[ -z "$SECRET_GITHUB_TOKEN" || -z "${GITHUB_REPOSITORY:-}" ]]; then
        echo 'Cannot publish releases without GITHUB_TOKEN and GITHUB_REPOSITORY. Provide them or set MODE=test.'
        exit 1
    fi
fi

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

# Prints the value of a key from Java .properties text read on stdin. The last
# occurrence wins, like java.util.Properties. Backslash escapes and line
# continuations are not interpreted.
read_gradle_property() {
    local key="$1"
    sed -n "s/^[[:space:]]*${key}[[:space:]]*[=:][[:space:]]*//p" | tr -d '\r' | tail -n 1
}

check_release_signing_inputs() {
    group 'Check Android release signing inputs'

    if [[ -z "$SECRET_RELEASE_KEYSTORE" ]]; then
        echo 'WARNING: Missing RELEASE_KEYSTORE; release builds will be skipped.'
    fi

    if [[ -z "$SECRET_RELEASE_KEYSTORE_PASSPHRASE" ]]; then
        echo 'WARNING: Missing RELEASE_KEYSTORE_PASSPHRASE; release builds will be skipped.'
    fi

    if [[ -z "$SECRET_GRADLE_PROPERTIES" ]]; then
        echo 'WARNING: Missing GRADLE_PROPERTIES; release builds will be skipped.'
    fi

    if [[ -n "$SECRET_RELEASE_KEYSTORE" && -n "$SECRET_RELEASE_KEYSTORE_PASSPHRASE" && -n "$SECRET_GRADLE_PROPERTIES" ]]; then
        RELEASE_STORE_FILE=$(printf '%s\n' "$SECRET_GRADLE_PROPERTIES" | read_gradle_property 'MYAPP_UPLOAD_STORE_FILE')

        if [[ -z "$RELEASE_STORE_FILE" ]]; then
            echo 'GRADLE_PROPERTIES must define MYAPP_UPLOAD_STORE_FILE.'
            exit 1
        fi

        if [[ "$RELEASE_STORE_FILE" == *\\* ]]; then
            echo 'MYAPP_UPLOAD_STORE_FILE must not contain backslash escapes.'
            exit 1
        fi

        # Gradle's file() resolves relative paths against android/app, which is
        # regenerated by prebuild and differs for the temporary WearOS copy, so
        # only an absolute path points at the same keystore for every build.
        if [[ "$RELEASE_STORE_FILE" != /* ]]; then
            echo "MYAPP_UPLOAD_STORE_FILE must be an absolute path (got '$RELEASE_STORE_FILE')."
            exit 1
        fi

        ENABLE_RELEASE_BUILDS=true
    fi

    if [[ "$MODE" == 'publish' && "$ENABLE_RELEASE_BUILDS" != 'true' ]]; then
        echo 'Cannot publish Android artifacts without release signing secrets.'
        exit 1
    fi

    endgroup
}

write_gradle_secrets() {
    if [[ "$ENABLE_RELEASE_BUILDS" != 'true' ]]; then
        return
    fi

    group 'Configure Android release signing inputs'
    local previous_umask
    previous_umask=$(umask)
    umask 077

    echo 'Storing temporary Gradle properties...'
    mkdir -p "$HOME/.gradle"
    CLEANUP_PATHS+=("$HOME/.gradle/gradle.properties")
    rm -f "$HOME/.gradle/gradle.properties"
    printf -- '%s' "$SECRET_GRADLE_PROPERTIES" > "$HOME/.gradle/gradle.properties"

    if ! grep -q '^org.gradle.jvmargs=' "$HOME/.gradle/gradle.properties"; then
        printf '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\n' >> "$HOME/.gradle/gradle.properties"
    fi

    echo "Storing encrypted keystore at $RELEASE_STORE_FILE.asc..."
    CLEANUP_PATHS+=("$RELEASE_STORE_FILE" "$RELEASE_STORE_FILE.asc")
    mkdir -p "$(dirname "$RELEASE_STORE_FILE")"
    rm -f "$RELEASE_STORE_FILE" "$RELEASE_STORE_FILE.asc"
    printf -- '%s' "$SECRET_RELEASE_KEYSTORE" > "$RELEASE_STORE_FILE.asc"

    echo 'Decrypting keystore...'
    printf -- '%s' "$SECRET_RELEASE_KEYSTORE_PASSPHRASE" \
        | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt "$RELEASE_STORE_FILE.asc" > "$RELEASE_STORE_FILE"

    umask "$previous_umask"
    SECRET_GRADLE_PROPERTIES=''
    SECRET_RELEASE_KEYSTORE=''
    SECRET_RELEASE_KEYSTORE_PASSPHRASE=''
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
    done < <(find "$source_dir" -type f \( -name '*.apk' -o -name '*.aab' -o -name 'mapping.txt' \) -print0)
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

# The replacements above depend on Expo's manifest layout; never produce a
# "wear" APK that is missing the watch feature or standalone flag.
if 'android.hardware.type.watch' not in text:
    raise SystemExit('Could not add android.hardware.type.watch to the WearOS manifest.')
if 'com.google.android.wearable.standalone' not in text:
    raise SystemExit('Could not add com.google.android.wearable.standalone to the WearOS manifest.')

manifest_path.write_text(text)
print('WearOS manifest configured.')
PY
}

# Fallback only: patches a copy of the phone project instead of running the
# BELGRANO_WEAR=1 prebuild. The result has the watch feature and standalone flag
# but none of the native Wear surfaces (Tile, complication, Ongoing Activity).
use_legacy_wearos_project() {
    echo 'WARNING: Using the legacy WearOS fallback (phone project + manifest patch, no Tile/complication).'
    rm -rf ./android
    rsync -a \
        --exclude /.gradle \
        --exclude /build \
        --exclude /app/build \
        --exclude 'build/' \
        --exclude '.cxx/' \
        "$1/android/" ./android/
    configure_wearos_manifest
}

# Checks that the WearOS prebuild produced a real watch project before building.
verify_wearos_project() {
    local manifest='android/app/src/main/AndroidManifest.xml'
    local required
    for required in 'android.hardware.type.watch' 'com.google.android.wearable.standalone' 'BelgranoNextTrainTile' 'BelgranoNextTrainComplication'; do
        if ! grep -q "$required" "$manifest"; then
            echo "WearOS prebuild is missing '$required' in $manifest."
            return 1
        fi
    done
}

# Runs before write_gradle_secrets so that, like the phone prebuild, the WearOS
# prebuild (and its config plugins) never sees signing files or secrets.
prepare_wearos_project() {
    group 'Prepare temporary WearOS project'
    local workspace
    workspace=$(pwd -P)
    rm -rf "$WEAROS_TEMP_PATH"
    mkdir -p "$WEAROS_TEMP_PATH"

    # Never copy the decrypted keystore into the WearOS tree when it lives in
    # the workspace; Gradle reads it from its absolute path anyway.
    local secret_excludes=()
    if [[ -n "$RELEASE_STORE_FILE" ]]; then
        local store_file
        store_file=$(realpath -m "$RELEASE_STORE_FILE")
        if [[ "$store_file" == "$workspace/"* ]]; then
            secret_excludes+=(--exclude "/${store_file#"$workspace/"}" --exclude "/${store_file#"$workspace/"}.asc")
        fi
    fi

    # Project sources (not only android/) so `expo prebuild` can regenerate the
    # native project with BELGRANO_WEAR=1. Root-anchored excludes keep nested
    # node_modules/*/ios and */dist folders (see 7fe7f4a). Unanchored
    # android/build/ and .cxx/ only drop Gradle/CMake outputs, which embed
    # absolute paths of the original tree.
    rsync -a \
        --exclude /wearos \
        --exclude /artifacts \
        --exclude /.git \
        --exclude /ios \
        --exclude /android \
        --exclude /.expo \
        --exclude /dist \
        --exclude 'android/build/' \
        --exclude '.cxx/' \
        "${secret_excludes[@]}" \
        ./ "$WEAROS_TEMP_PATH/"
    endgroup

    pushd "$WEAROS_TEMP_PATH" >/dev/null
    group 'Expo prebuild for WearOS (BELGRANO_WEAR=1)'
    if BELGRANO_WEAR=1 npx expo prebuild --platform android --no-install && verify_wearos_project; then
        echo 'WearOS native project generated by withBelgranoWear.'
        summary '- WearOS project: generated by `expo prebuild` with `BELGRANO_WEAR=1`.'
    elif [[ "${WEAROS_PREBUILD_FALLBACK:-}" == 'legacy' ]]; then
        use_legacy_wearos_project "$workspace"
        summary '- WARNING: WearOS prebuild failed; used the legacy manifest patch (no Tile/complication).'
    else
        echo 'WearOS prebuild failed. Fix the error above, or set WEAROS_PREBUILD_FALLBACK=legacy to build a watch APK without the native Wear surfaces.'
        exit 1
    fi
    chmod +x android/gradlew
    endgroup
    popd >/dev/null
}

build_wearos_artifacts() {
    pushd "$WEAROS_TEMP_PATH" >/dev/null

    group 'Apply WearOS versionCode'
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

    check_release_signing_inputs
    install_android_sdk
    prebuild_android
    prepare_wearos_project
    # Written after both prebuilds so Expo config plugins never see signing files.
    write_gradle_secrets
    set_android_version_code "$ANDROID_BASE_VERSION_CODE"

    build_android_variant 'base debug' 'Debug'

    if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
        build_android_variant 'base release' 'Release'
    fi

    copy_android_artifacts './android/app/build/outputs'
    build_wearos_artifacts

    summary '- Android/WearOS artifacts generated.'
}

# Calls the GitHub API. The token goes through a curl config read from stdin so
# it never shows up in the process list. Extra curl arguments are passed as-is.
github_api() {
    printf 'header = "Authorization: Bearer %s"\n' "$SECRET_GITHUB_TOKEN" \
        | curl --config - \
            --silent \
            --show-error \
            --location \
            -H 'Accept: application/vnd.github+json' \
            -H 'X-GitHub-Api-Version: 2022-11-28' \
            "$@"
}

discard_draft_release() {
    local release_id="$1"
    echo "Deleting draft release #$release_id..."
    if ! github_api --fail-with-body -o /dev/null -X DELETE "https://api.github.com/repos/$GITHUB_REPOSITORY/releases/$release_id"; then
        echo "WARNING: Could not delete draft release #$release_id; delete it manually."
    fi
}

publish_release() {
    if [[ "$MODE" != 'publish' ]]; then
        summary '- Release publishing skipped because MODE is not publish.'
        return
    fi

    if ! platform_includes_android; then
        echo 'No Android release artifacts were requested; skipping release publishing.'
        summary '- Release publishing skipped because there were no Android artifacts.'
        return
    fi

    # Only signed release APKs are published; debug builds and AABs stay in
    # the workflow artifacts.
    local release_assets=("$ARTIFACTS_PATH/app-release.apk" "$ARTIFACTS_PATH/app-release-wear.apk")
    local asset
    for asset in "${release_assets[@]}"; do
        if [[ ! -s "$asset" ]]; then
            echo "Missing release artifact $asset; refusing to publish."
            exit 1
        fi
    done

    group 'Publish GitHub release'
    local api_base commit_sha tag_name commit_message response_file status stale_ids stale_id payload release_id upload_url asset_name
    api_base="https://api.github.com/repos/$GITHUB_REPOSITORY"
    commit_sha=$(git rev-parse HEAD)
    tag_name=$(git log -1 --pretty=%h)
    commit_message=$(git log -1 --pretty=%s)

    if [[ -n "${GITHUB_SHA:-}" && "$GITHUB_SHA" != "$commit_sha" ]]; then
        echo "Checked out HEAD ($commit_sha) does not match GITHUB_SHA ($GITHUB_SHA); refusing to publish."
        exit 1
    fi

    response_file=$(mktemp)
    CLEANUP_PATHS+=("$response_file")

    status=$(github_api --retry 3 -o "$response_file" -w '%{http_code}' "$api_base/releases/tags/$tag_name")
    case "$status" in
        200)
            echo "Release $tag_name is already published; skipping. Existing assets:"
            jq -r '.assets[].name' "$response_file"
            summary "- Release \`$tag_name\` already published; nothing uploaded."
            endgroup
            return
            ;;
        404) ;;
        *)
            echo "Unexpected HTTP $status while looking up release $tag_name:"
            cat "$response_file"
            exit 1
            ;;
    esac

    # Drafts left behind by an interrupted run for this same commit.
    github_api --fail-with-body --retry 3 -o "$response_file" "$api_base/releases?per_page=100"
    stale_ids=$(jq -r --arg tag "$tag_name" '.[] | select(.draft and (.name == $tag or .tag_name == $tag)) | .id' "$response_file")
    for stale_id in $stale_ids; do
        discard_draft_release "$stale_id"
    done

    payload=$(jq -n \
        --arg tag_name "$tag_name" \
        --arg target_commitish "$commit_sha" \
        --arg name "$tag_name" \
        --arg body "$commit_message" \
        '{tag_name: $tag_name, target_commitish: $target_commitish, name: $name, body: $body, draft: true, prerelease: false, generate_release_notes: false}')

    if ! github_api --fail-with-body -o "$response_file" -X POST "$api_base/releases" -d "$payload"; then
        echo 'Could not create the draft release:'
        cat "$response_file"
        exit 1
    fi

    release_id=$(jq -er '.id' "$response_file")
    upload_url=$(jq -er '.upload_url' "$response_file" | cut -d'{' -f1)

    for asset in "${release_assets[@]}"; do
        asset_name=$(basename "$asset")
        echo "Uploading $asset_name to draft release #$release_id..."
        if ! github_api --fail-with-body --retry 3 -o "$response_file" \
            -X POST \
            -H 'Content-Type: application/vnd.android.package-archive' \
            -T "$asset" \
            "$upload_url?name=$asset_name"; then
            echo "Upload of $asset_name failed:"
            cat "$response_file"
            discard_draft_release "$release_id"
            exit 1
        fi
    done

    echo "Publishing release #$release_id..."
    if ! github_api --fail-with-body --retry 3 -o "$response_file" -X PATCH "$api_base/releases/$release_id" -d '{"draft":false}' \
        || ! jq -e '.draft == false' "$response_file" >/dev/null; then
        echo 'Could not publish the draft release:'
        cat "$response_file"
        discard_draft_release "$release_id"
        exit 1
    fi

    echo "Published $(jq -r '.html_url' "$response_file")"
    summary "- Published GitHub release \`$tag_name\` (#$release_id) for \`$commit_sha\`."
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
