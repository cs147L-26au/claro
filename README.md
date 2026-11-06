# CS 147L final project starter

A minimal Expo SDK 58 + TypeScript app with Expo Router.

## Start with Expo Go

Use **Node.js 22.23.3** and npm. In this directory, run:

```sh
npm install
npm start
```

Make sure you have an **SDK 58-compatible Expo Go** app installed on your phone.
Scan the QR code with your phone and edit `src/app/index.tsx`. Keep the computer
and phone on the same network. If the network blocks local connections, try
`npm start -- --tunnel` and follow any CLI setup prompts.

## The two application files

```text
src/app/_layout.tsx    Router outlet; replace it with your own navigation layout
src/app/index.tsx      Initial screen; replace it with your own UI
```

Route files go in `src/app/`. Put reusable components, helpers, and API/database
code outside that directory.

## Move to your group's development build

**Before shared or EAS builds, the teaching team must configure your group.**
The `com.example.cs147lfinalstarter` identifiers in `app.json` are placeholders
for local native builds. The teaching team will push a commit that replaces both `ios.bundleIdentifier` and
`android.package` with your group's unique identifiers and sets the Expo owner,
EAS project ID (`extra.eas.projectId`), slug, and URL scheme. Do not register the
placeholder identifiers for your group's app.

After that configuration, one build leader installs the development client:

```sh
npx expo install expo-dev-client
```

Commit both `package.json` and `package-lock.json`. Teammates pull those changes
and run `npm ci`. Build and install the matching development app as described
below, then start its server:

```sh
npm run start:dev
```

Scan the QR code to open your installed development app. 

## For build leaders: generate builds

After the teaching team configures your EAS project and you have installed
`expo-dev-client`, sign in with **your own invited Expo account**:

```sh
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Confirm that the owner and project are your assigned group. Run only the command
for the platform and kind of build you need:

```sh
# Development app for a physical device; loads code from a development server.
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android

# Standalone preview; bundles the current code for independent testing.
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile preview --platform android
```

Share the resulting installation link. Physical iOS devices must be registered
in the class Apple Developer account's provisioning profile, which the teaching team will contact you about.

**One app identity:** The profiles use the same app identifiers. Installing a
preview replaces the development app on that device. Reinstall the development
app before returning to `npm run start:dev`.

### Development builds for simulators

An iPhone build cannot run in an iOS Simulator. For a simulator development app,
use the separate profile, then install the completed simulator build:

```sh
npx eas-cli@latest build --profile development-simulator --platform ios
npx eas-cli@latest build:run --platform ios
```

Select the simulator build when prompted, then use `npm run start:dev` and press
`i`. For Android, install the development APK on your emulator and press `a`.

Alternatively, with the native development tools installed and your group's
configuration ready, build and install locally:

```sh
npx expo run:ios
npx expo run:android
```

These commands compile native apps. They differ from `npm run ios` and
`npm run android`, which open Expo Go. Rebuild your development app after adding
native libraries or changing native configuration.

## Replace the placeholder branding

Change `expo.name` in `app.json`. Replace `assets/icon.png`,
`assets/adaptive-icon.png`, and `assets/splash-icon.png` with your own PNGs. The
included images are all 1024 x 1024; the app icon is opaque and the adaptive/splash
images have transparent backgrounds. Adjust the splash plugin's background color
and image width in `app.json` as needed.

Verify the installed icon and splash screen in a **preview build**. Rebuild after
changing these native assets.

## Checks and credentials

```sh
npm run typecheck
npx expo install --check
npx expo-doctor@latest
```

Keep passwords, signing files, and server-side keys out of the repository.

## Reference

- [Expo CLI launch targets](https://docs.expo.dev/more/expo-cli/)
- [Start developing and Expo Go sign-in](https://docs.expo.dev/get-started/start-developing/)
- [SDK 58 release notes and tunnels](https://expo.dev/changelog/sdk-58)
- [Expo Router setup](https://docs.expo.dev/router/installation/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Build profiles](https://docs.expo.dev/build/eas-json/)
- [iOS Simulator builds](https://docs.expo.dev/build-reference/simulators/)
- [Internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Environment variables](https://docs.expo.dev/guides/environment-variables/)
