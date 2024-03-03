#!/bin/bash

# Add Android SDK binaries to the global PATH
export PATH="$PATH":/tmp/android/sdk/cmdline-tools/latest/bin;

# Define the path to the Android SDK
export ANDROID_HOME=/tmp/android/sdk;

# Define the path to the artifacts output
export ARTIFACTS_PATH=$(pwd)/artifacts;

# Define the path to the temporary WearOS root copy
export WEAROS_TEMP_PATH=$(pwd)/wearos;

set -e; # quit on error

if [[ "$ACTION" == 'run' ]]; then
    npx expo start;

    exit $?;
else
    ACTION='build';
fi;

if [[ -z $MODE ]] || [[ "$MODE" == '' ]]; then
    MODE='publish';
fi;

if [[ "$MODE" == 'publish' ]] && [[ "$GITHUB_TOKEN" == '' ]]; then
    echo 'Cannot publish releases without a GitHub token. Provide a token or set MODE=test instead. - GITHUB_TOKEN';

    exit 1;
fi;

echo 'Starting operation with ACTION = '"$ACTION"' and MODE = '"$MODE"'...';
echo '';

echo '=> Looking for keystore...';
if [[ "$RELEASE_KEYSTORE" == '' ]]; then
    echo '=================================================================================';
    echo 'WARNING: Missing keystore, release builds will NOT be created. - RELEASE_KEYSTORE';
    echo '=================================================================================';
fi;
if [[ "$RELEASE_KEYSTORE_PASSPHRASE" == '' ]]; then
    echo '=======================================================================================================';
    echo 'WARNING: Missing keystore passphrase, release builds will NOT be created. - RELEASE_KEYSTORE_PASSPHRASE';
    echo '=======================================================================================================';
fi;

echo '=> Looking for Gradle properties...';
if [[ "$GRADLE_PROPERTIES" == '' ]]; then
    echo '===========================================================================================';
    echo 'WARNING: Missing Gradle properties, release builds will NOT be created. - GRADLE_PROPERTIES';
    echo '===========================================================================================';

    exit 1;
fi;

if [[ "$RELEASE_KEYSTORE" != '' ]] && [[ "$RELEASE_KEYSTORE_PASSPHRASE" != '' ]] && [[ "$GRADLE_PROPERTIES" != '' ]]; then
    ENABLE_RELEASE_BUILDS=true;
fi;

echo '=> Setting the current directory ('"$(pwd)"') as a safe directory for Git...';
git config --global --add safe.directory $(pwd);

echo '=> Creating artifacts directory as '"$ARTIFACTS_PATH"'...';
mkdir -p "$ARTIFACTS_PATH";

echo '=> Creating WearOS temporary path directory as '"$WEAROS_TEMP_PATH"'...';
mkdir -p "$WEAROS_TEMP_PATH";

echo '=> Installing Yarn dependencies...';
yarn;

echo '=> Installing packages with NPM...';
npm i;

if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
    echo '=> Storing temporary '"$HOME"'/.gradle/gradle.properties file...';
    mkdir -p "$HOME"/.gradle && printf -- "$GRADLE_PROPERTIES" > "$HOME"/.gradle/gradle.properties;

    echo '=> Loading properties from '"$HOME"'/.gradle/gradle.properties...';
    . "$HOME"/.gradle/gradle.properties;

    echo '=> Storing temporary encrypted keystore to '"$MYAPP_UPLOAD_STORE_FILE"'.asc...';
    printf -- "$RELEASE_KEYSTORE" > $MYAPP_UPLOAD_STORE_FILE.asc;

    echo '=> Decrypting keystore...';
    gpg -d --passphrase "$RELEASE_KEYSTORE_PASSPHRASE" --batch $MYAPP_UPLOAD_STORE_FILE.asc > $MYAPP_UPLOAD_STORE_FILE
fi;

echo '=> Installing the Android SDK platform and build tools...';
yes | sdkmanager 'build-tools;34.0.0';
yes | sdkmanager 'platform-tools';

echo '=> Accepting all SDK licenses...';
yes | sdkmanager --licenses;

echo '=> Compilling base debug AAB bundle and APK...';
npx react-native build-android --mode=debug;
cd android; ./gradlew assembleDebug; cd ..;

if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
    echo '=> Compilling base release AAB bundle and APK...';
    npx react-native build-android --mode=release;
    cd android; ./gradlew assembleRelease; cd ..;
fi;

echo '=> Copying base artifacts to '"$ARTIFACTS_PATH"'...';
for file in $(find ./android/app/build/outputs -type f -regex  '.*\(apk\|aab\)$'); do
    FILE_NAME=$(basename "$file");

    cp -v "$file" "$ARTIFACTS_PATH"'/'"$FILE_NAME";
done;

echo '=> Copying temporary files for the WearOS release and changing directory to '"$WEAROS_TEMP_PATH"'...';
rsync -r --exclude wearos . $WEAROS_TEMP_PATH;
cd $WEAROS_TEMP_PATH;

echo '=> Setting up WearOS releases...';
sed -i'' 's/<!-- WEAROS_USES_FEATURE_PLACEHOLDER -->/<uses-feature android:name="android.hardware.type.watch" \/>/' android/app/src/main/AndroidManifest.xml;
sed -i'' 's/<!-- WEAROS_META_PLACEHOLDER -->/<meta-data android:name="com.google.android.wearable.standalone" android:value="true"\/>/' android/app/src/main/AndroidManifest.xml;
VERSION_CODE=$( cat android/app/build.gradle | grep versionCode | sed 's/[^0-9]//g' );
sed -i'' 's/versionCode .*/versionCode '$(( $VERSION_CODE + 1))'/' android/app/build.gradle;

echo '=> Compilling WearOS debug AAB bundle and APK...';
npx react-native build-android --mode=debug;
cd android; ./gradlew assembleDebug; cd ..;

if [[ "$ENABLE_RELEASE_BUILDS" == 'true' ]]; then
    echo '=> Compilling WearOS release AAB bundle and APK...';
    npx react-native build-android --mode=release;
    cd android; ./gradlew assembleRelease; cd ..;
fi;

echo '=> Copying WearOS artifacts to '"$ARTIFACTS_PATH"'...';
for file in $(find ./android/app/build/outputs -type f -regex  '.*\(apk\|aab\)$'); do
    FILE_NAME=$(basename "$file" | sed 's/\./-wear./');

    cp -v "$file" "$ARTIFACTS_PATH"'/'"$FILE_NAME";
done;

if [[ "$MODE" != 'publish' ]]; then
    exit 0;
fi;

# Collect information for the release
LAST_COMMIT_MESSAGE=$(git log -1 --pretty=%s);
LAST_COMMIT_SHA=$(git log -1 --pretty=%h);

echo '=> Creating release...';
RESPONSE=$(
    curl -L \
        --fail \
        -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        https://api.github.com/repos/$GITHUB_REPOSITORY/releases \
        -d '{
            "tag_name":"'"$LAST_COMMIT_SHA"'",
            "target_commitish":"master",
            "name":"'"$LAST_COMMIT_SHA"'",
            "body":"'"$LAST_COMMIT_MESSAGE"'",
            "draft":false,
            "prerelease":false,
            "generate_release_notes":false
        }'
);

echo '=> Parsing upload URL...';
RELEASE_ID=$(echo "$RESPONSE" | jq -cr '.id');
UPLOAD_URL=$(echo "$RESPONSE" | jq -cr '.upload_url' | cut -d'{' -f1);

echo '=> Uploading artifacts to release #'"$RELEASE_ID"' using the endpoint "'"$UPLOAD_URL"'"...';
for file in $(find "$ARTIFACTS_PATH"); do
    FILE_NAME=$(basename "$file");

    echo '  -> Uploading "'"$file"'" as "'"$FILE_NAME"'"...';

    curl -s -L \
        -X POST \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        -H 'Content-Type: '$(file -b --mime-type "$file") \
        -H 'Content-Length: '$(wc -c < "$file" | xargs) \
        -T "$file" \
        "$UPLOAD_URL"'?name='"$FILE_NAME";
done;

exit 0;