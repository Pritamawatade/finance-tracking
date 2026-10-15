# Finance Tracker 👋

Private, offline, single-user expense/income tracker for Android (INR).
See `spec.md` for the full architecture spec. **Expo Go is NOT supported** —
this app needs a development build (custom native `sms-bridge` module).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Run tests / typecheck / lint

   ```bash
   npm test
   npx tsc --noEmit
   npx expo lint
   ```

3. Build & run on an Android device (dev build required)

   ```bash
   npx expo run:android
   ```

   Local build prerequisites (Gradle reads `android/` which is generated —
   `android/local.properties` is gitignored, so each machine needs this once):

   - Point the SDK at a user-writable copy with licenses accepted and the
     pinned NDK installed. The system-wide `/opt/android-sdk` has no
     `licenses/` and no NDK, which fails with
     `LicenceNotAcceptedException: ndk;27.1.12297006`:

     ```bash
     export ANDROID_HOME=$HOME/Android/Sdk
     export ANDROID_SDK_ROOT=$HOME/Android/Sdk
     ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --licenses
     printf 'sdk.dir=%s\n' "$HOME/Android/Sdk" > android/local.properties
     ```

   - Build with JDK 17. Newer JVMs (e.g. Java 26) break the Android Gradle
     Plugin (`JdkImageTransform` / `jlink` failure):

     ```bash
     export JAVA_HOME=$HOME/.local/share/mise/installs/java/17.0.2
     ```

     (`android/gradle.properties` also pins this via `org.gradle.java.home`.)

   Sideload release APK: EAS Build (`preview` profile, `buildType: apk`)
   or local `assembleRelease`. On Android 13+ (esp. 15/16) sideloaded apps
   need *Settings → Apps → (app) → ⋮ → Allow restricted settings* before
   the SMS permission can be granted — the in-app onboarding walks through it.

## Project layout

- `src/app/` — Expo Router screens (routes)
- `src/db/`, `src/repositories/` — expo-sqlite + Drizzle ledger
- `src/services/parser/` — SMS templates shared with native code
- `modules/sms-bridge/` — local Expo module (Kotlin): SMS receiver,
  parser, inbox DB, transaction notifications
- `fixtures/sms.json` — shared parser fixtures (Jest + JUnit)

This is an [Expo](https://expo.dev) project (SDK 57).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
