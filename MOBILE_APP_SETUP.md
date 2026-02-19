# Mobile App Wrapper (iOS + Android)

This project can be packaged as native apps using Capacitor while loading the live web app from:

- `https://www.smartsauna.no`

## 1. Install dependencies

```bash
npm install
```

## 2. Add native platforms (one-time)

```bash
npm run mobile:add:ios
npm run mobile:add:android
```

## 3. Sync config to native projects

```bash
npm run mobile:sync
```

## 4. Open projects in native IDEs

```bash
npm run mobile:open:ios
npm run mobile:open:android
```

## 5. Build and publish

- iOS: build/sign in Xcode, upload via Organizer to App Store Connect.
- Android: build signed AAB in Android Studio, upload to Google Play Console.

## Notes

- App shell is native, content is loaded from `https://www.smartsauna.no`.
- If your domain/SSL changes, update `capacitor.config.ts` and run `npm run mobile:sync`.
- For store branding, set icon/splash in native projects (Xcode/Android Studio).
- For store approval quality, consider adding at least one native feature later (push notifications, biometric lock, or native share/deep links).

