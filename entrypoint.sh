#!/bin/bash

# Add Android SDK binaries to the global PATH
export PATH="$PATH":/tmp/android/sdk/cmdline-tools/latest/bin;

# Define the path to the Android SDK
export ANDROID_HOME=/tmp/android/sdk;

set -e; # quit on error

echo '=> Setting the current directory ('"$(pwd)"') as a safe directory for Git...';
git config --global --add safe.directory $(pwd);

echo '=> Installing Yarn dependencies...';
yarn;

echo '=> Installing packages with NPM...';
npm i;

echo '=> Looking for keystore...';
if [[ -z $RELEASE_KEYSTORE ]]; then
    echo 'Missing keystore!';

    exit 1;
fi;

echo '=> Storing temporary '"$HOME"'/.gradle/gradle.properties file...';
mkdir -p "$HOME"/.gradle && printf -- "$GRADLE_PROPERTIES" > "$HOME"/.gradle/gradle.properties;

echo '=> Loading properties from '"$HOME"'/.gradle/gradle.properties...';
. "$HOME"/.gradle/gradle.properties;

echo '=> Storing temporary encrypted keystore to '"$MYAPP_UPLOAD_STORE_FILE"'.asc...';
printf -- "$RELEASE_KEYSTORE" > $MYAPP_UPLOAD_STORE_FILE.asc;

echo '=> Decrypting keystore...';
gpg -d --passphrase "$RELEASE_KEYSTORE_PASSPHRASE" --batch $MYAPP_UPLOAD_STORE_FILE.asc > $MYAPP_UPLOAD_STORE_FILE

echo '=> Installing the Android SDK platform and build tools...';
yes | sdkmanager 'build-tools;34.0.0';
yes | sdkmanager 'platform-tools';

echo '=> Accepting all SDK licenses...';
yes | sdkmanager --licenses;

echo '=> Compilling debug AAB bundle and APK...';
npx react-native build-android --mode=debug;
cd android; ./gradlew assembleDebug; cd ..;

echo '=> Compilling release AAB bundle and APK...';
npx react-native build-android --mode=release;
cd android; ./gradlew assembleRelease; cd ..;

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
for file in $(find ./android/app/build/outputs -type f -regex  '.*\(apk\|aab\)$'); do
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

echo '=> Setting WearOS releases...';
sed -i'' 's/<!-- WEAROS_USES_FEATURE_PLACEHOLDER -->/<uses-feature android:name="android.hardware.type.watch" \/>/' android/app/src/main/AndroidManifest.xml;
sed -i'' 's/<!-- WEAROS_META_PLACEHOLDER -->/<meta-data android:name="com.google.android.wearable.standalone" android:value="true"\/>/' android/app/src/main/AndroidManifest.xml;

echo '=> Compilling debug AAB bundle and APK...';
npx react-native build-android --mode=debug;
cd android; ./gradlew assembleDebug; cd ..;

echo '=> Compilling release AAB bundle and APK...';
npx react-native build-android --mode=release;
cd android; ./gradlew assembleRelease; cd ..;

echo '=> Uploading artifacts to release #'"$RELEASE_ID"' using the endpoint "'"$UPLOAD_URL"'"...';
for file in $(find ./android/app/build/outputs -type f -regex  '.*\(apk\|aab\)$'); do
    FILE_NAME=$(basename "$file" | sed 's/\./-wear./');

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