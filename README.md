<h1 style="text-align: center;"> BelgranoWear (app) </h1>

This repository is the frontend of the static information provisioning backend located at [belgranowear/belgranowear.github.io](https://github.com/belgranowear/belgranowear.github.io).

**BelgranoWear** is an application that lets you travel through the **Belgrano Norte** network (maintained by **Ferrovias**).

## System requirements
- Android 5.1 or greater
- 32 MB of free storage space
- An internet connection

## Development

- Download **Expo Go** for [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) or for [iOS](https://apps.apple.com/us/app/expo-go/id982107779).

- Enable the real-time bundler by running the following command:

    `ACTION=run docker compose up --build`

- In a different terminal, copy and paste the following command to get your IP address:

    `ip addr show | grep -e ': w' -e ': e' -A4 | grep inet | sed 's/.*inet //' | cut -d ' ' -f 1`

- Open **Expo Go** and pass a URL as the following example:

    `exp://192.168.0.4:8081`

    The port will always be **8081**.

- Wait for the app to get bundled and accept all permission requests.

- That's it, you're good to go! Any changes done in the source code will update in real time.

## Building

#### Release mode
- Create a keystore

    `keytool -genkey -v -keystore release.keystore -alias belgranowear -keyalg RSA -keysize 2048 -validity 10000`

- Use GPG to convert the keystore to a variable-safe string

    `gpg -c --armor release.keystore`

- Copy the output of this command and paste it into an exported variable, i.e.:

    ```
    export RELEASE_KEYSTORE="-----BEGIN PGP MESSAGE-----

    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    ...
    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX==
    =XXXX
    -----END PGP MESSAGE-----
    "
    ```

- Export the passphrase for your keystore as a different variable

    `export RELEASE_KEYSTORE_PASSPHRASE=HereGoesYourKeystorePassphrase`

- Set up a variable to store the contents of your **gradle.properties** file. Keep `MYAPP_UPLOAD_STORE_FILE` and `MYAPP_UPLOAD_KEY_ALIAS` untouched, just like in this example.

    ```
    export GRADLE_PROPERTIES="
    MYAPP_UPLOAD_STORE_FILE=/tmp/keystore
    MYAPP_UPLOAD_KEY_ALIAS=belgranowear
    MYAPP_UPLOAD_STORE_PASSWORD=HereGoesYourKeystorePassphrase
    MYAPP_UPLOAD_KEY_PASSWORD=HereGoesYourKeystorePassphrase

    ENABLE_PROGUARD_IN_RELEASE_BUILDS=true
    "
    ```

- Follow the steps described in the **Debug mode** section.

#### Debug mode
- [Install docker](https://docs.docker.com/desktop/install/linux-install/) as explained in the linked guide.
- Clone this repository wherever you want, just make sure you'd have write permission with the user you're currently logged in.

    `git clone https://github.com/belgranowear/BelgranoWear`
- Change to the created directory by running `cd BelgranoWear`.
- Run the following command:

    `MODE=test docker compose up --build`
- That's it, wait for a few minutes and you'll find the output in the `artifacts` directory.

## License

**BelgranoWear** is open-sourced software licensed under the [GNU General Public License v3.0](LICENSE).
