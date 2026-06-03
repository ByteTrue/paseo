# App Package

`packages/app` is the Expo web / React Native Web client used directly in the browser and bundled into the Electron desktop app as the shared renderer.

## Common commands

```bash
npm --prefix packages/app run web
npm --prefix packages/app run build
npm --prefix packages/app run typecheck
npm --prefix packages/app run lint -- src app.config.js
```

## Notes

- This fork targets browser web and Electron desktop.
- iOS / Android native client build and release flows have been removed.
- `build:web` exports the renderer bundle consumed by `packages/desktop`.
