# Android

## App variants

Controlled by `APP_VARIANT` in `packages/app/app.config.js` (vanilla Expo, no custom Gradle plugin):

| Variant       | App name    | Package ID       |
| ------------- | ----------- | ---------------- |
| `production`  | Paseo       | `sh.paseo`       |
| `development` | Paseo Debug | `sh.paseo.debug` |

Build profiles in `packages/app/eas.json`: `development`, `production`, and `production-apk`.

`development` uses Android `debug`.

## Local build + install

From repo root:

```bash
npm run android:development    # Debug build
npm run android:production     # Release build
npm run android:clear          # Remove generated Android project
```

Or from `packages/app`:

```bash
# Debug
npx cross-env APP_VARIANT=development expo prebuild --platform android --non-interactive
npx cross-env APP_VARIANT=development expo run:android --variant=debug

# Release
npx cross-env APP_VARIANT=production expo prebuild --platform android --non-interactive
npx cross-env APP_VARIANT=production expo run:android --variant=release

# Clear generated Android project
rm -rf android
```

### React version lockstep

Keep `react` and `react-dom` pinned to the React version embedded by the current `react-native` release. React Native `0.81.x` embeds `react-native-renderer` `19.1.0`, so `packages/app` must use React `19.1.0`. Bumping React to a newer patch can build successfully but crash at JS startup on Android with `Incompatible React versions`, leaving the app on the native splash screen.

## Screenshots

```bash
adb exec-out screencap -p > screenshot.png
```

## Local APK build

This fork does not use EAS for cloud builds. Android APKs are built locally.

From repo root:

```bash
npm run android:production     # Build and install release APK to connected device
```

To build an APK and upload it to a GitHub Release:

```bash
bash scripts/release-android-apk-local.sh [tag]
```

See [docs/release.md](release.md) for the full release flow.
