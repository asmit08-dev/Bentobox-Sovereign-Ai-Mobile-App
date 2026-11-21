# Sovrns

The Sovrns mobile app (Expo, iOS and Android). People sign in with their phone number and
ask the Sovrns assistant questions by text, photo, PDF or voice. Everything goes through the
Sovrns API at `https://sovrns.com`.

## Run it

```bash
npm install
npx expo start
```

Open it in **Expo Go** on your phone (scan the QR code). The app needs only the modules that
come with Expo Go.

### Web preview

```bash
npm run web
```

Browsers can't call `sovrns.com` directly from `localhost` (the server refuses it: CORS). So in
the web preview the app calls `/api/sovrns/...` on the dev server, and `metro.config.js` passes
those calls on to the real API. This pass-through exists only while developing; phones always
call `sovrns.com` directly.

## Sign in

1. Type your phone number (`+91` is filled in) and tap **Continue**.
2. Type the 6-digit code from the SMS.

Only **person** accounts can chat. The SMS is sent only to numbers your organisation has
added in Sovrns. If no SMS comes, ask your administrator to check that your number is added.

The login token is kept in the phone's secure keychain (`expo-secure-store`). The web preview
keeps it in `localStorage` (development only).

## Settings

| Setting | Where | Default |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `.env` | `https://sovrns.com` (phones) |
| `SOVRNS_API_URL` | environment of `npm run web` | `https://sovrns.com` (where the web pass-through sends calls) |

The old `AI_*` and `STT_*` lines in `.env` belonged to the test AI, which is gone. You can
delete them.

## Tests

```bash
npm test                                   # unit tests, no network
SOVRNS_TEST_KEY=sk-app-... npm run test:live   # real API tests against sovrns.com
npm run typecheck
npm run lint
```

- `test:live` skips itself without `SOVRNS_TEST_KEY`. It uses the app key **only for tests**:
  never put that key in the app's code, in `.env`, or in a commit. Each run uses about 6 of
  the key's daily questions.
- Some things only a real phone can check: playing the spoken answer (Ogg) on an iPhone,
  drawing PDF pages in the hidden WebView, and the keychain.

## Where things are

| Folder | What it does |
|---|---|
| `src/api/` | One function per API endpoint, error texts, request helper |
| `src/auth/` | Phone number format, session helpers |
| `src/stores/` | Signed-in account (`auth`), chats (`chats`), composer, the answer on its way |
| `src/chat/` | Asking (`engine`), syncing with the server (`sync`), rename/delete (`manage`), pictures and PDFs |
| `src/lib/pdf/` | PDF pages → pictures with PDF.js (a hidden WebView on phones) |
| `src/lib/voiceReply.ts` | Plays the server's spoken answer, or reads it aloud if it can't |
| `src/app/` | Screens: `sign-in`, `verify`, the chat (`index`), the picture viewer |
| `docs/superpowers/` | The design and the plan for the API work |
