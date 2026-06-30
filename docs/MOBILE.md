# Mobile (Capacitor hybrid)

ISH Sales Hub ships as a **Capacitor hybrid app** for iOS and Android. The native shell loads the deployed Next.js app in a WebView (not an offline bundle).

## Architecture

- **Config:** `capacitor.config.ts` points `server.url` at your hosted app.
- **Routes:** Mobile-first screens include `/inbox` (swipe review), bottom tab bar, and safe-area chrome.
- **Native APIs:** Geolocation (scouting), camera (business card OCR), haptics (inbox gestures).

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Default remote URL for the WebView |
| `CAPACITOR_SERVER_URL` | Override URL (staging, local tunnel, etc.) |
| `CAPACITOR_ANDROID=1` | When syncing for Android emulator, rewrites `localhost` to `10.0.2.2` |

Copy from `.env.example` into `.env.local` before `npx cap sync`.

## Local development

1. Start the web app: `npm run dev` (note the port, e.g. `3002`).
2. Set `NEXT_PUBLIC_APP_URL=http://localhost:3002` and optionally `CAPACITOR_SERVER_URL` to the same.
3. For **Android emulator**, set `CAPACITOR_ANDROID=1` so the emulator can reach your machine.
4. Sync and open:

```bash
npx cap sync
npx cap open ios    # or android
```

iOS Simulator can use `localhost` directly. Android emulator needs `10.0.2.2` (handled automatically when `CAPACITOR_ANDROID=1`).

## Permissions

Native permission strings are declared for features used in the WebView:

| Feature | iOS (`Info.plist`) | Android (`AndroidManifest.xml`) |
|---------|-------------------|--------------------------------|
| Camera (business card scan) | `NSCameraUsageDescription` | `CAMERA` |
| Location (nearby scouting) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` |
| Microphone (voice edit) | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` |

## Mobile inbox

`/inbox` supports:

- Swipe right to **approve**, left to **reject**
- **Send** for Email 1 drafts (`sendOutreach`) and follow-ups in `pending_review` (`sendFollowUp`)
- **Quality gate parity** with desktop: low rubric/deliverability scores or `revisionTimeout` require confirmation before send

## Build for store

1. Deploy the Next.js app to production (Vercel).
2. Set `CAPACITOR_SERVER_URL` to the production URL (or rely on `NEXT_PUBLIC_APP_URL` at sync time).
3. `npx cap sync` then build in Xcode / Android Studio.

## Known gaps (post-M0)

- Native push (FCM/APNs) is stubbed; web push works in browser only.
- `@capacitor/camera` is installed but scouting still uses web APIs in the WebView.
- Voice input may be limited inside WebView on some devices.
