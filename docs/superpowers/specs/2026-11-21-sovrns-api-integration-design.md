# Sovrns mobile app: connect the real API (design)

Date: 2026-11-21 · Branch: `feat/sovrns-api` · Status: **approved by the user (2026-11-21)**

User decisions: chat app only (no admin screens) · **phone-only sign-in** (no email option) · the user has a person phone for the final test.

## 1. Why

- The app works today, but it talks to a **test AI** (Claude), which runs inside the Expo dev server (`src/app/api/*`, `src/server/*`).
- The real backend is ready at `https://sovrns.com`, and its API doc arrived this morning.
- Goal: the app uses **only** the real API. People sign in, ask questions (text, photos, PDFs, voice), and see their chat history from the server.

## 2. Goals, non-goals, anti-goals

**Goals**
- Sign in with a code sent to the person's **phone** by SMS. *(Phone only, decided by the user. The `email` form of the OTP request is for organisation admins, who can't chat, so the mobile app doesn't offer it.)*
- Every API in the doc that a person needs is used: OTP request, OTP verify, `/me`, `/ask` (new chat, follow-up, photo, multi-page document, voice with spoken reply), chat list, messages, rename, delete, logout.
- Add the features the API has but the app lacks: page pictures from PDFs, spoken replies, questions left today, account info, sign out.
- Remove everything that only existed for the test AI.

**Non-goals**
- No admin screens. The admin API (#14) is not used in the mobile app. Admins use the web admin panel. *(Decided by the user.)*
- No sign-up screen. **The API has no sign-up endpoint.** People are added by their organisation admin.
- No word-by-word streaming. `/ask` returns the whole answer at once.

**Anti-goals (a failure even if it "works")**
- The app key (`sk-app-…`) ends up inside the app bundle. Anyone could pull it out, and every install would share one account with 50 questions a day.
- The login token is kept in plain storage.
- A wrong code signs the person out, or an expired session leaves them stuck on a broken chat screen.
- The UI looks templated or "AI slop". New screens must match the app's existing style (light surfaces, Sora font, small black fills only).

## 3. Facts from testing the live API (2026-11-21)

### 3.0 Endpoints used (from the API doc the user pasted into the chat)

| What | Method and path | Auth |
|---|---|---|
| Ask for a code | `POST /api/v1/auth/otp/request` `{email}` or `{phone}` | none |
| Check the code | `POST /api/v1/auth/otp/verify` `{challenge_id, code, device_name?}` → `{access_token:"sk-mobile-…", token_type:"Bearer", expires_at, account_type, user, organisation, assistant, features}` | none |
| Who is signed in | `GET /api/v1/me` | Bearer |
| Ask (new chat, follow-up, photo, pages, voice) | `POST /ask` + `Idempotency-Key` header | Bearer |
| Chat list | `GET /api/v1/chats?limit=&cursor=` | Bearer |
| Messages of one chat | `GET /api/v1/chats/{id}/messages?limit=&before=` | Bearer |
| Rename | `PATCH /api/v1/chats/{id}` `{title}` | Bearer |
| Remove from list | `DELETE /api/v1/chats/{id}` | Bearer |
| Sign out | `POST /api/v1/auth/logout` | Bearer |

- The doc has **no refresh endpoint**. When `expires_at` passes, the person signs in again.
- Audio types allowed by the doc: `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/m4a`, `audio/wav`, `audio/webm`, `audio/aac`. Only m4a was tested live; webm is tested in the web preview.
- Verify, a real `sk-mobile` token, `/me` with that token, and logout with that token can only be tested once the user signs in (section 8).

### 3.1 What the server really does

These were tested with curl against `https://sovrns.com`. Where they differ from the doc, the server wins.

| Topic | What the server does |
|---|---|
| OTP request | `{"phone":"+15555550100"}` → `account_type:"user"` (SMS). `{"email":…}` → `account_type:"admin"` (email). The response is `202 {challenge_id, account_type, expires_in:300, resend_after:60, code_length:6, message}`. The phone must be **E.164 with `+`**; without the `+` it is a 422. Fields other than `email`/`phone` are rejected. |
| OTP limits | Asking for codes too fast gives `429 otp_rate_limited`. |
| OTP verify | `{challenge_id, code, device_name?}`. A wrong or expired code gives `401 invalid_otp` (**a 401 that must NOT sign anyone out**). |
| `/api/v1/me` | `{account_type, user{id,name,first_name,phone,…}, organisation{name,…}, assistant{questions_per_day, questions_used_today, questions_left_today, questions_per_minute, enabled}, features{text, images, document_pages_max:50, image_bytes_max:4194304, image_types[], audio_questions, voice_replies}}` |
| `/ask` | Takes 3–10 s. Response: `{request_id, chat_id, message_id, status, answer, finish_reason:"completed", context, billing_units, quality_score, transcript, voice_reply}`. Unknown fields are rejected (422). The question can be up to about 32,000 characters (40,000 fails). |
| Photos | `image:{media_type, base64}` works. A 2-page document as `image` + `more_images[]` works. Only jpeg, png and webp (a gif gives 422). |
| Voice | `audio:{media_type:"audio/m4a", base64}` + `reply_as:"voice"` works. `transcript` = what was said. `voice_reply = {media_type:"audio/ogg", base64}` (Ogg/Opus). The user's message is stored as text (the transcript). |
| Idempotency | The same key with the same body returns the **same answer, billed once**. The same key while the first is still running gives `409 request_not_replayable`. The same key with a different body gives `409 idempotency_mismatch`. |
| Chat list | `GET /api/v1/chats?limit=1..100&cursor=` → `{items[{id,title,status,created_at,last_activity_at,can_continue,message_count,last_message_role,last_message_preview,…}], next_cursor}`. The title is the first question. |
| Messages | `GET …/messages?limit&before=` → `{chat{…}, items[{id, sequence_no, role, content_kind("text"/"image_with_text"), text, request_id, request_status, error_code, quality_score, attachment_count, unavailable}], next_before}`. Items come oldest → newest. **Photos are never returned**, only `attachment_count`. |
| Rename | `PATCH {title}`. The title is 1–120 characters (160 fails). Returns the chat. |
| Delete | `{"ok":true}`. After that, messages give `404 chat_not_found`, and `/ask` into it gives `409 chat_not_active`. |
| Logout | Called with an app key, it returns ok and changes nothing (that key keeps working). |
| Errors | Always `{"error":{"code","message","details?"}}`. |
| CORS | The preflight from `http://localhost:8081` returns **403**, so a browser cannot call the API directly. Phones are not affected. |
| List order | The paging cursor holds `last_activity_at`, so the list is newest activity first. Seen `status` values: only `active`. A deleted chat leaves the list. |

**From the deploy files in the admin-panel repo** (`Sovrun-AI-Admin-Pannel/nginx/default.conf.template`, `DESIGN.md`). These are the same backend, but not checked against sovrns.com directly:
- CloudFront waits **up to 60 s** for `/ask`. A longer answer (many pages, voice reply) reaches the phone as a **504**, while the server keeps working and still saves the answer.
- The backend accepts at most **6 MB** per request (`MAX_REQUEST_BYTES`).
- Admins (school admins and superadmins) need a **separate chatbot credential** to chat. So an admin's email sign-in token most likely **cannot** use `/ask` or the chat endpoints.
- An admin's code is sent to email **and** SMS.

**Environment limits**
- The project runs in **Expo Go** (no `ios/` or `android/` folders, no dev client). Only native modules that come with Expo Go can be used. `expo-secure-store` (~58.0.3) and `react-native-webview` (14.0.1) both come with it.
- This Mac has **no Xcode**, so there is no iPhone simulator. Testing happens in the web preview, plus API tests. The user checks phone-only behaviour in Expo Go.

## 4. Approaches considered

| Decision | Options | Pick and why |
|---|---|---|
| Where chats live | (a) phone only, as today; (b) server only; (c) server is the truth, phone keeps a copy | **(c)**. History follows the person to a new phone, and chats still open fast and show offline. (a) loses history. (b) shows a blank screen while loading. |
| PDF → page pictures | (a) drop PDFs; (b) camera "scan pages" only; (c) render with PDF.js (in a hidden WebView on phones, directly in the browser on web) | **(c)**. Item 7 of the doc is multi-page documents. (b) is clumsy for real files. Native PDF libraries need a dev build, which Expo Go can't use. |
| Token storage | (a) the JSON file store; (b) `expo-secure-store` (keychain) | **(b)**. The token is a password. The web preview falls back to `localStorage` (dev only). |
| Web preview vs CORS | (a) test only on a phone; (b) a tiny pass-through route in the Expo dev server, used only on web | **(b)**. It lets us test in the browser. Phones always call sovrns.com directly. |
| App key | (a) ship it as a guest mode; (b) never ship it, use it only for tests | **(b)**. See the anti-goals. |
| Admin API | in the app / not in the app | **Not in the app** (user's choice). |

## 5. Design

### 5.1 API layer (`src/api/`)

The low-level files have **no React Native imports**, so Node can test them.

- `http.ts`: `apiRequest({ path, method, body, token, idempotencyKey, signal, timeoutMs })`
  - It builds the URL from a base that is set once at startup:
    - phones: `EXPO_PUBLIC_API_URL`, default `https://sovrns.com`
    - web: `/api/sovrns` (the pass-through)
  - It throws `ApiError {status, code, message, details}` for an error response, `NetworkError` when the server can't be reached, and `TimeoutError` when it takes too long.
- `types.ts`: request and response types, written from the real JSON above.
- `sovrns.ts`: one function per endpoint.
  - `requestCode`, `verifyCode`, `getMe`, `logout`
  - `ask`, `listChats`, `listMessages`, `renameChat`, `deleteChat`
- `errors.ts`: `friendlyError(error)` turns an error into plain English (table below). `isSessionError(error)` is true **only** for `invalid_credential` / `authentication_required`, never for `invalid_otp`.
- The old `client.ts`, `contract.ts`, `endpoints.ts` and `sse.ts` are removed.

| Code | Shown to the person |
|---|---|
| `invalid_otp` | "That code is wrong or has expired." |
| `otp_rate_limited` | "Please wait a minute before asking for another code." |
| `validation_error` on `phone` | "Enter your number with the country code, like +91 98765 43210." |
| `invalid_credential`, `authentication_required` | Sign out, then show on the sign-in screen: "Your session ended. Please sign in again." |
| `service_not_allowed` | "This feature isn't turned on for your account." |
| `chat_not_found` | "This chat no longer exists." (It is removed from the list.) |
| `chat_busy` | "The last answer in this chat is still being written. Try again in a moment." |
| `chat_not_active` | "This chat is closed. Start a new chat." |
| `request_not_replayable` | (Not shown. The app waits and tries again; see 5.4.) |
| `request_too_large` | "That's too much to send at once. Remove some pages or photos." |
| `daily_limit_reached` | "You've used all of today's questions. Try again tomorrow." |
| `rate_limited` | "You're sending too fast. Wait a moment and try again." |
| Network error | "Can't reach Sovrns. Check your internet connection." |
| Anything else | The server's `message`, or "Something went wrong. Try again." |

### 5.2 Sign-in

**What real apps do.**
- WhatsApp and Telegram: one phone field with a country code, one button, then a 6-digit code that submits by itself, with a resend timer.
- Claude and ChatGPT: plain white page, logo, one field, a black pill "Continue", and a small text link for the other way to sign in.

We copy that calm pattern. We don't copy anyone's look.

**Screens** (new routes: `src/app/sign-in.tsx`, `src/app/verify.tsx`), on a light background:

```
 Sign in                            Enter the code

      [Sovrns wordmark]             ←
                                    Enter the code
  Sign in                           Sent to +91 98765 43210
  We'll text you a 6-digit code.
                                    [4][8][2][9][1][3]
  ┌──────┬─────────────────────┐
  │ +91  │ 98765 43210         │    Resend code in 0:42
  └──────┴─────────────────────┘    Wrong number? Change it
  ( Continue )   ← black pill
```

- Phone is the only way to sign in.
  - The country code starts as `+91` and can be edited.
  - Spaces and dashes are removed before sending, so the server gets `+919876543210`.
  - A small line under the button says: "No account? Ask your school or organisation to add your number."
- The code screen:
  - takes `code_length` digits (6) and submits by itself when full;
  - "Resend" is locked for `resend_after` seconds (60);
  - after `expires_in` (300 s) it says "This code expired. Send a new one.";
  - errors show in red under the field.
- Verify sends `device_name`: the phone model (from `expo-device`), or "Web browser".

**Auth store** (`src/stores/auth.ts`, zustand)
- State: `{ status: 'loading' | 'signedOut' | 'signedIn', token, expiresAt, accountType, user, organisation, assistant, features, notice }`.
- The token and its expiry go in **secure storage** (`src/lib/secureStorage.ts` → `expo-secure-store`; `.web.ts` → `localStorage`).
- The profile, features and quota (not secret) go in the normal file store, so the app can open offline.
- On start:
  1. Load the token. If `expires_at` has passed, sign out at once.
  2. If there is one, show the chat and call `/me` in the background to refresh features and quota.
  3. A session error signs the person out. A network error keeps them signed in, offline, with the cached chats.
- **Sign out** (the person taps it in Settings):
  1. `POST /api/v1/auth/logout` (best effort).
  2. Delete the token, the cached chats and their attachment files, and the composer draft. This is "remove my data from this phone".
  3. Go to sign-in.
- **Session ended** (expired or revoked token; any API call that gets a session error):
  - Delete only the token, and show the notice "Your session ended. Please sign in again."
  - **Keep** the cached chats and photo files. The server never sends photos back, so wiping them on every expiry would lose them for good.
  - If the same account signs in again, everything is still there. If a **different** account signs in, the old cache and files are deleted first.

**Routing** (`src/app/_layout.tsx`)
- The splash stays up until fonts, theme and auth are loaded.
- `<Stack.Protected guard={signedIn}>` wraps `index` and `viewer`.
- `<Stack.Protected guard={!signedIn}>` wraps `sign-in` and `verify`.

**Admin accounts.** The app doesn't offer email sign-in (the user's decision). A phone sign-in returns `account_type:"user"`.
- As a guard, if verify ever returns another `account_type`, the app signs out at once (best effort) and shows on the sign-in screen: "This account can't chat in the app. Use a person account."
- No admin screens.

### 5.3 Chats and history

**Data** (`src/chat/types.ts`; the persisted store goes to **version 2**)
- `Chat`:
  - `id`: a stable local key, so the open chat never remounts.
  - `serverId?`: set after the first answer.
  - `title`, `createdAt`, `updatedAt` (= `last_activity_at`).
  - `canContinue`, `preview?`, `olderBefore?` (= `next_before`), `messages`.
- `UserMessage` adds `requestId?`, `idempotencyKey?`, `attachmentCount?` and `voice?`.
- `AssistantMessage` loses `images` and `feedback`.
- **Migration from v1:** the old test-AI chats are dropped (they don't exist on the server), and their saved files are deleted.
- The saved chats belong to one account (they store the user id). Another account, or a sign-out, clears them.

**Sync** (`src/chat/sync.ts`)
- `refreshChats()` gets the first 30 chats and merges them by `serverId`: titles, times, previews and `canContinue` are updated.
  - **The drawer shows the server's pages, in the server's order, plus chats that exist only on this phone** (still waiting for their first answer) on top.
  - **Nothing is deleted from the phone on a guess.** A cached chat that isn't in the loaded pages is simply not shown. Its messages and photos are deleted only when the person deletes it, when opening it returns `404 chat_not_found`, or on Sign out or an account switch.
  - Every listed chat is shown, whatever its `status`; `can_continue` decides the composer.
- `loadMoreChats()` follows `next_cursor` when the drawer is scrolled to the end.
- `openChat(id)` shows the cached messages at once, then `syncChat(id)` gets the newest 50 and replaces them.
  - Photos saved on this phone are kept by matching `request_id`.
  - Unsent ("Not sent") messages are kept.
- `loadOlder(id)` is called at the top of the list, using `before=olderBefore`.
- **Still answering:** the last message may be from the user with a `request_status` that is not `succeeded` or `failed` (for example after Stop, or when the app was closed). Then the app shows the waiting dots and syncs again every 4 s, for up to 2 minutes.

**Drawer** (`HistoryDrawer`)
- The list is sorted by the latest activity and grouped as today. It refreshes when the drawer opens.
- Search filters the loaded chats by title and preview.
- Rename (`PATCH`, 1–120 characters) and delete (`DELETE`) update the list straight away and undo the change if the server fails.
- The delete text becomes: "This chat will be deleted."
- A chat with `can_continue:false` shows "This chat can't continue. Start a new chat." in place of the composer.

### 5.4 Asking (`src/chat/engine.ts`)

`sendMessage(text, attachments)` and `sendVoice(audio, mimeType)` work like this:

1. Open a local chat if none is open (title from the first words, as today).
2. Add the user message, with a new `idempotencyKey`, and an answer placeholder (the waiting dots).
3. Build the body:
   - `question` (up to 32,000 characters; the composer stops there);
   - `chat_id` (if the chat has a `serverId`);
   - `image` + `more_images` (photos and PDF pages, in order);
   - `audio` + `reply_as` (voice).
4. **Save the exact request body** (JSON, up to 6 MB) to a cache file named after the key. This lets a cut-off question be sent again byte for byte; delete the file once the answer is saved.
5. `POST /ask` with `Idempotency-Key`. Each try times out after **65 s** (CloudFront gives up at 60 s).
   - On a timeout, a dropped connection, a 5xx (including CloudFront's 504) or `409 request_not_replayable`, the app **sends the same saved body with the same key again**: every 3 s, quietly, for up to 3 minutes in all, with the waiting dots still showing.
   - A replay returns the finished answer, billed once (tested).
   - After 3 minutes it gives up and shows "Not sent · Tap to retry"; tapping does the same again.
6. When it succeeds:
   - set `serverId`, `requestId` and the answer (`message_id`, `answer`);
   - for voice, the user text becomes the `transcript`;
   - if `finish_reason` is not `completed`, add the note "This answer may be incomplete.";
   - then, in the background, refresh `/me` (quota) and the chat list (server title).

**Retry rules**
- Network error, timeout, 5xx, or `request_not_replayable`: retry with the **same key and the same saved body**. That is safe, because a replay returns the same answer and is billed once.
- A 4xx that rejected the question (`chat_busy`, `rate_limited`, `daily_limit_reached`, `request_too_large`, …): the next Retry uses a **new key** (and a freshly built body). Nothing was processed, so nothing can be billed twice.
- **App closed while waiting:** on the next start, a question still waiting shows "Not sent · Tap to retry". Retry uses the same key and saved body, so a question the server already answered comes back without a second charge, and a new chat gets linked to its `chat_id`.

**No Stop button.** The API can't cancel a question: the server still answers it, saves it and counts it. A Stop button would mislead. While waiting, the send button shows a small spinner and can't be pressed. The person can still open the drawer, read other chats or start a new chat (one question is answered at a time, as today).

**Removed:** Stop (no cancel in the API), Regenerate (the API has none), 👍/👎 (no API to send them to), automatic titles from the AI (the server names chats), and the streaming display.

### 5.5 Photos and PDFs (`src/chat/attachments.ts`, `src/lib/pdf/`)

- **Allowed:**
  - camera;
  - photo library (several photos);
  - Files: PDF and pictures (jpeg, png, webp, heic).
  - Text files (.txt, .csv, .md, .json) are no longer offered, because the API can't take them.
- **Photos:** shrunk to a long edge of 1568 px and saved as JPEG at quality 0.8 (unchanged).
- **PDFs:**
  - When a PDF is added, its pages are drawn as JPEGs (long edge 1400 px, quality 0.7) and saved.
  - The composer shows "Report.pdf · 12 pages".
  - Locked or broken PDFs say "This PDF can't be opened."
  - PDFs over 15 MB are refused, as today.
- **Limits from `/me`:**
  - all pictures in one question ≤ `document_pages_max` (50); extra pages are cut with a note ("Only the first 50 pages will be sent");
  - each picture ≤ `image_bytes_max` (4 MB);
  - if `features.images` is false, photo and file buttons are hidden.
- **Size budget:** the whole request must stay under 6 MB. Before sending, if the base64 total is over 5.5 MB:
  - shrink all pictures again (edge × 0.8, quality 0.6), but **never below a 1000 px long edge**, where page text stays readable;
  - if it still doesn't fit, send the first N pictures that fit and add the note "Only the first N pages fit in one question. Ask again with the rest.";
  - if not even one fits, show the `request_too_large` message.
- **Renderer:**
  - On phones, a hidden `<WebView>` (`PdfRendererHost`, mounted once in the root layout) loads a small HTML page with **PDF.js 3.11.174 from cdnjs**. The app sends the PDF as base64, and each page comes back as a JPEG data URL, one message per page.
  - On web, the same steps run directly in the page.
  - PDF.js needs internet the first time. That's fine, because asking needs internet anyway.
- **History:**
  - Photos sent from this phone show from saved files.
  - Chats from elsewhere show a small "📎 2 attachments" chip (`attachment_count`), because the server never returns the files.

### 5.6 Voice (`VoiceDock`)

- The mic shows only if `features.audio_questions` is on. The recording is m4a on phones and webm on web (both allowed). Recordings still stop at 2 minutes.
- `sendVoice` sends the audio with `reply_as:"voice"` when `features.voice_replies` is on and the speaker isn't muted.
- The user message shows "Voice message…" until the `transcript` arrives.
- **Playback:**
  1. Save `voice_reply` to a cache file (`.ogg`), or use a data URL on web.
  2. Play it with `expo-audio`.
  3. If it errors, or hasn't started within 3 s (an iPhone may not play Ogg/Opus), read the answer aloud with the phone's own voice (`expo-speech`), as today.
- The "Read aloud" button under answers keeps using the phone's voice.
- The old `/api/transcribe` route is gone.

### 5.7 Settings (`SettingsSheet`)

- **Account:** name, phone or email, organisation name.
- **Today:** "12 of 50 questions used". `/me` is refreshed when the sheet opens.
- **Sign out:** asks to confirm, then signs out (5.2).
- Appearance and version stay as they are.

### 5.8 Removed

- **Files deleted:**
  - `src/app/api/{chat,capabilities,title,transcribe}+api.ts`
  - `src/server/*`
  - `src/api/{client,contract,endpoints,sse}.ts`
  - `src/components/chat/{ImageResults,CreatedImageView}.tsx`
  - `src/lib/features.ts`
- **Changed:**
  - the "Create an image" suggestion is removed;
  - the viewer shows photos only;
  - the ActionRow keeps Copy and Read aloud.
- **Packages:** remove `@anthropic-ai/sdk`. Add `expo-secure-store` and `react-native-webview` with `npx expo install`, so the versions match SDK 58.
- **`.env`:** `AI_API_KEY`, `AI_MODEL`, `AI_EFFORT`, `AI_IMAGES` and `STT_*` are no longer used. The user can delete them; I won't edit `.env`.
- **Added:** `src/app/api/sovrns/[...path]+api.ts`, the web-only pass-through.
  - It forwards only `/ask` and `/api/v1/*` to `https://sovrns.com`, with the `Authorization`, `Content-Type` and `Idempotency-Key` headers, and returns the reply unchanged.
  - `web.output: "server"` stays, because the pass-through needs it.

## 6. Testing

- `npm run typecheck` and `npm run lint` must pass.
- **`npm test`** (Node's built-in `node:test`, no new packages) covers the pure modules:
  - error mapping, `isSessionError`;
  - phone cleanup;
  - retry-key rules;
  - building the `/ask` body (image + `more_images`, voice);
  - the size budget;
  - server→app message mapping and merging local photos by `request_id`.
- **`npm run test:live`** runs only when `SOVRNS_TEST_KEY` is set in the shell. The key is never saved in the repo. Through the app's own API functions it checks: `/me`, ask, follow-up, photo, two pages, voice, list and paging, messages and paging, rename, delete. It uses about 8 of the test key's 50 daily questions.
- **Web preview (browser pane):**
  - the sign-in screens and their errors (bad number, wrong code);
  - then **the user signs in** with a registered person phone, typing the code themselves (an admin email tests sign-in and the admin screen only);
  - then ask, follow-up, photo, PDF, voice (webm), history paging, rename, delete, settings and quota, sign out, and an expired session;
  - a cut-off question is checked by forcing a short timeout in a test build, to see the same-key re-send recover the answer.
- **On the user's phone (Expo Go):** spoken replies (Ogg on iPhone), PDF pages on a phone, and keychain storage. I can't run these here.

## 7. Left to the builder

- Exact text, spacing and animation of the sign-in screens, using the existing tokens (`theme/tokens.ts`) and components (`AppText`, `PressableScale`, `IconButton`).
- Splitting work into files, helper names, and how the "waiting" status is named in code.
- How "Load earlier messages" looks at the top of a chat.

## 8. Needed from the user

- ~~Sign-in choice~~: **decided: phone only.**
- **A person account for the test:** the user has one. When the build is ready, they sign in once in the web preview, typing the number and the code themselves.
- After the work: a check on a real phone in Expo Go (voice reply, PDF).

## 9. Calls I made (please check)

1. Phone sign-in with `+91` pre-filled; the country code can be edited.
2. No Stop button, because the API can't cancel (5.4).
3. A cut-off question is re-sent automatically with the same key and saved body, for up to 3 minutes (5.4).
4. An expired session keeps the cached chats and photos; only Sign out or an account switch deletes them (5.2).
5. The phone deletes nothing on a guess when the chat list changes (5.3).
6. Text files are no longer offered; PDFs become page pictures with a 1000 px floor (5.5).
7. 👍/👎, Regenerate, "Create an image" and the test AI are removed (5.8).
8. The app key is never put in the app; it is only used by the opt-in live test (6).
