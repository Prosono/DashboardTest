# App Icons (iOS + Android)

Use Capacitor Assets to generate all icon sizes from one source image.

## 1) Add source files

Create folder:

```bash
mkdir -p resources
```

Add your app icon as:

- `resources/icon.png` (recommended 1024x1024, square, no transparency for App Store)

Optional splash image:

- `resources/splash.png` (recommended 2732x2732)

## 2) Generate assets

```bash
npm run mobile:assets
```

This updates:

- iOS app icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset`
- Android launcher icons in `android/app/src/main/res/mipmap-*`

## 3) Sync and open native projects

```bash
npm run mobile:sync
npm run mobile:open:ios
npm run mobile:open:android
```

## Notes

- Re-run `npm run mobile:assets` every time you update logo/splash.
- Keep logo centered with safe margin (do not place text too close to edges).

