# Claro

An Expo SDK 58 app for small-business decisions, built from the Claro mid-fi prototype's cream, teal, and muted factor palette.

## Run the app

Use **Node 22.23.3** (`nvm use`), then:

```sh
npm ci
npm start
```

Scan the QR code using an SDK 58-compatible Expo Go app. For a browser preview, run `npm run web`. No account or API key is needed for manual priorities, tasks, comparisons, or storing decisions.

## What works

- **Home:** upcoming decision reviews, due-item count, task shortcuts, and decision-set navigation. Starts with an honest empty state; no seeded records.
- **Tasks:** create, edit, complete/reopen, filter, and set optional due dates.
- **Priorities:** five initial factors; sliders automatically rebalance to exactly 100%; add, rename, describe, or remove factors (2–8); save or discard draft changes.
- **AI priorities:** describe your business, request suggested weights and explanations, review, apply to the draft, then explicitly save. Closing the assistant discards its pending response. Failures never silently replace your choices with invented AI output.
- **Decisions:** create, search, filter, view, edit, archive/restore, and set review dates. Each decision preserves its original priority snapshot.
- **Comparison:** score two options against saved priorities, see weighted scores, then carry your chosen option and reasoning into the decision form. This is a manual scoring tool, not an LLM recommendation.

Data is saved locally using AsyncStorage and survives app restarts. There is no account, cross-device sync, encryption layer, or cloud database. Removing the app/browser data removes local records. Review dates appear in Home; push notifications are not scheduled.

## Connect the free LLM API

**Provider: Groq, model: `openai/gpt-oss-20b`.** Groq currently offers a rate-limited free plan. Stay on that plan for this prototype; availability and quotas are controlled by Groq. GitHub Models was retired on July 30, 2026, so this app does not use the old GitHub inference endpoint.

1. Create your own key at [Groq Console](https://console.groq.com/keys). Do not paste it into chat or commit it.
2. Copy `.env.example` to `.env` and fill in `GROQ_API_KEY`.
3. Run the server in one terminal:

   ```sh
   npm run api
   ```

4. In another terminal, run `npm start` (phone) or `npm run web` (browser).
5. Open **Priorities → Help me set priorities**, describe the business, and request a suggestion. Review **Use this suggestion**, then **Update priorities**.

The key exists only in the Node server. Never name it `EXPO_PUBLIC_GROQ_API_KEY` or place it in app source. `EXPO_PUBLIC_API_URL` is just the public server address. Only the text entered into the assistant and current factors are sent to Groq; stored decisions and tasks are not sent. Provider responses are checked for matching factor IDs, valid weights, reasons, and a total of exactly 100 before the app displays them.

### On a physical phone

`localhost` on a phone means the phone, not your laptop. On trusted Wi-Fi:

```dotenv
API_HOST=0.0.0.0
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8787
```

Restart both the API and Expo after changing `.env`. Keep the phone and laptop on the same Wi-Fi. For Android Emulator use `http://10.0.2.2:8787`; for iOS Simulator use `http://localhost:8787`. An Expo tunnel only tunnels Metro, not this separate API service.

The API defaults to loopback, accepts only configured browser origins, limits request sizes and per-IP requests, and times out provider calls. **It is a local development server, not a publicly deployable authenticated service.** Before sharing a hosted build, put the API behind real authentication and HTTPS, set a production API URL, and configure exact allowed browser origins. The app will not guess a localhost API in a production build.

### API troubleshooting

- `GET /health` reports server availability and whether a key is configured, without returning the key.
- A missing key produces a setup message; manual functionality still works.
- 401/403 from Groq: check the key and model permissions.
- 429: free quota/rate limit; wait and retry or edit manually.
- A connection error on a phone: check its API URL, Wi-Fi, and your local firewall.
- 30-second provider timeout and 35-second app timeout prevent a stuck spinner.

## Checks

```sh
npm run typecheck
npm test
npx expo install --check
npm run build
```

`npm test` covers exact priority allocation, zero-weight edge cases, date validation, saved-data validation/round trips, priority snapshots, request/response validation, provider failures, and the HTTP endpoint. Provider calls in tests are mocked; an actual Groq request requires your key. `npm run build` exports iOS, Android, and web JavaScript bundles; it is not a native device build.

Manual walkthrough: save a decision with a review date → reopen it → edit it → archive and restore it → change and save priorities → restart the app → check that the decision's original priorities remain unchanged. Then create/complete a task, edit factors, and try the AI assistant with and without a configured key.

## Code map

```text
src/app/(tabs)/       Home, Tasks, Priorities, Decisions
src/app/decision/     Save, edit, detail, and compare flows
src/app/task/         Add/edit task flow
src/components/      Shared interface and priority ring
src/lib/model.ts     Types, exact allocation, validation
src/lib/store.tsx    Serialized local persistence
src/lib/ai.ts        Client for the local AI proxy
server/              Groq proxy (no third-party server dependencies)
tests/               Domain and API tests
```

## Sources

- [Figma prototype](https://www.figma.com/proto/f59g6mQpxCmEcYrHtvwsiw/Claro-Mid-fi?node-id=151-537&starting-point-node-id=151%3A537)
- [GitHub Models retirement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/)
- [Groq free-plan rate limits](https://console.groq.com/docs/rate-limits)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)

---

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
