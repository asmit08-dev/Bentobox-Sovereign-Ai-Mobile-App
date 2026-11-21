# Sovrns API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the test AI in the Sovrns Expo app with the real sovrns.com API: phone sign-in, server chat history, photos, PDFs and voice.

**Architecture:**
- A pure, Node-testable API layer (`src/api/*`) sits under three small zustand stores: auth, chats and live.
- The chat engine sends one non-streaming `/ask` per question with an idempotency key. It re-sends a cut-off question byte for byte with the same key, and syncs history from the server.
- Phones call sovrns.com directly. The web preview goes through a same-origin pass-through route.

**Tech Stack:**
- Expo SDK 58 (Expo Go), expo-router 58 (`Stack.Protected`), zustand 5
- expo-secure-store, react-native-webview + PDF.js 3.11.174 (cdnjs)
- expo-audio, expo-image-manipulator, expo-file-system
- Node 25 `node:test` (built-in TypeScript stripping)

**Spec:** `docs/superpowers/specs/2026-11-21-sovrns-api-integration-design.md` (approved 2026-11-21). Read it before any task; section numbers below refer to it.

## Global Constraints

**API and secrets**
- API base on phones: `process.env.EXPO_PUBLIC_API_URL ?? 'https://sovrns.com'`. Web preview base: `/api/sovrns`.
- The app key (`sk-app-…`) never goes in app code, in `.env*` files, or in fixtures. Live tests read `SOVRNS_TEST_KEY` from the shell only.
- The login token lives only in secure storage: `expo-secure-store`, or `localStorage` in the web preview. The secret key name is `sovrns.session`.

**Sign-in**
- Phone only, E.164 with `+`, default country code `+91`. Verify sends `device_name`.

**Asking**
- Each `/ask` try times out after 65 000 ms.
- Auto re-send (same key + saved body): every 3 000 ms, at most 180 000 ms in all. Stop after 2 network errors in a row.

**Limits**
- Question ≤ 32 000 characters. Chat title 1–120 characters.
- ≤ `features.document_pages_max` (50) pictures per question. Each picture ≤ `features.image_bytes_max` (4 194 304 bytes).
- Request JSON ≤ 5 500 000 characters.

**Pictures**
- Shrink step: edge × 0.8 at JPEG quality 0.6, never below a 1000 px long edge.
- PDF pages: 1400 px long edge at quality 0.7. PDFs up to 15 MB.
- Photos: 1568 px at quality 0.8 (unchanged).

**Code rules**
- "Pure modules" (`src/api/*` except `config.ts`, plus `src/auth/phone.ts`, `src/auth/session.ts`, `src/chat/types.ts`, `src/chat/mapping.ts`, `src/chat/askBody.ts`, `src/chat/replay.ts`) follow four rules:
  - relative imports only, no React Native or Expo imports;
  - `import type` for every type-only import;
  - no `enum`;
  - no constructor parameter properties.
  - Reason: Node runs them with type stripping.
- App code imports the endpoint functions as a namespace: `import * as api from '@/api/sovrns'`, then `api.renameChat(…)`, `api.deleteChat(…)`. They share names with the store actions `renameChat` / `deleteChat`, which only change the phone's copy.
- Copy: plain, simple English, exactly as written in the spec (error table 5.1, screens 5.2, notes 5.4/5.5).
- Style: only existing tokens and components (`theme/tokens.ts`, `AppText`, `PressableScale`, `IconButton`). Light surfaces. Black (`colors.primary`) only for small fills such as the main button.

**Process**
- **No commits.** All work stays uncommitted on `feat/sovrns-api` for the user to review. A "Checkpoint" step means: run the stated checks, nothing else.
- Don't read or edit `.env`. Don't touch `.audit/` or the backup folders.
- Budget: the test key has 50 questions a day. Live tests use about 6; browser checks should stay under 20.

## Review Focus

1. **An answer slower than 60 s** (long PDF, voice reply). CloudFront returns 504. The app must re-send with the same key and show the answer once: one chat, one charge. Covered by Task 5 `replay.test.ts` and Task 6 Step 5.
2. **The token expires while the app is open.** The person lands on sign-in with "Your session ended. Please sign in again.", and the same account still finds its chats and photos. Covered by Task 1 `isSessionError`, Task 3 `isExpired`, and Task 10 Step 4.
3. **A full number pasted into the number field** ("+91 98765 43210", "098765 43210"). The server must still get `+919876543210`. Covered by Task 3 `phone.test.ts`.
4. **The app is closed while a question waits.** After a restart, the question shows "Not sent · Tap to retry" (no endless dots), and Retry gets the answer without a second charge. Covered by Task 5 `settleWaiting` test.
5. **50 scanned pages or 6 large photos.** Shrink down to the 1000 px floor, then drop the last pages with a note. Never a raw 413. Covered by Task 5 `imagesThatFit` / `nextEdge` tests.

---

### Task 1: Test runner and HTTP core

**Files:**
- Create: `tests/setup/resolve-ts.mjs`, `tests/setup/register.mjs`
- Create: `src/api/types.ts`, `src/api/http.ts`, `src/api/errors.ts`
- Test: `tests/unit/http.test.ts`, `tests/unit/errors.test.ts`
- Modify: `package.json` (scripts only)

**Interfaces:**
- Produces, `types.ts`. Server field names stay exactly as the server sends them (snake_case, spec 3.0/3.1):
  - auth: `ApiErrorBody`, `ApiErrorDetail = { location: (string | number)[]; type: string }`, `OtpChallenge`, `VerifyResponse` (= `SessionInfo & { access_token; token_type; expires_at }`), `SessionInfo`;
  - account: `ApiUser`, `ApiOrganisation`, `ApiAssistant`, `ApiFeatures`;
  - asking: `AskImage`, `AskAudio`, `AskBody`, `VoiceReply = { media_type: string; base64: string }`, `AskResponse`;
  - history: `ChatSummary`, `ChatListResponse`, `ServerMessage`, `MessagesResponse`.
- Produces, `http.ts`:
  - `configureApi(o: { baseUrl: string }): void`
  - `apiRequest<T>(o: ApiRequestOptions): Promise<T>`, where `ApiRequestOptions = { path: string; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; token?: string | null; idempotencyKey?: string; signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch }`. A `string` body is sent unchanged; anything else goes through `JSON.stringify`.
  - classes `ApiError` (`status: number; code: string; details: ApiErrorDetail[]`), `NetworkError`, `TimeoutError`.
- Produces, `errors.ts`:
  - `isSessionError(e: unknown): boolean`
  - `isReplayable(e: unknown): boolean`
  - `friendlyError(e: unknown): string`

- [ ] **Step 1: Add the test runner.** `register.mjs` calls `register('./resolve-ts.mjs', import.meta.url)`. `resolve-ts.mjs`:

```js
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Node needs file extensions; app code imports without them. Try .ts, .tsx, /index.ts.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
```

Add the scripts:
- `"test": "node --import ./tests/setup/register.mjs --test 'tests/unit/*.test.ts'"`
- `"test:live": "node --import ./tests/setup/register.mjs --test 'tests/live/*.test.ts'"`

The glob must be quoted. A bare folder path does not run.

- [ ] **Step 2: Write the failing tests in `tests/unit/http.test.ts`.** Use a fake `fetchImpl` that records the call.
  - `joins the base URL and the path`: after `configureApi({ baseUrl: 'https://sovrns.com/' })`, path `/api/v1/me` → url `'https://sovrns.com/api/v1/me'`.
  - `sends the token, the idempotency key and a JSON body`: headers `Authorization: 'Bearer t1'`, `Idempotency-Key: 'k1'`, `Content-Type: 'application/json'`; body `'{"question":"Hi"}'`.
  - `sends a string body unchanged`: `'{"a":1}'` arrives as `'{"a":1}'`.
  - `turns an error body into ApiError`: 409 `{"error":{"code":"chat_busy","message":"busy"}}` → `status 409`, `code 'chat_busy'`, `message 'busy'`.
  - `handles an HTML error page`: 504 with `text/html` → `status 504`, `code 'http_504'`, message `'The server returned an error (504).'`.
  - `wraps a failed fetch as NetworkError`: fetch rejects with `TypeError` → `NetworkError`.
  - `times out`: a fetch that only settles on abort, with `timeoutMs: 20` → `TimeoutError`.
  - `passes a caller's abort through`: the caller aborts → the error name is `'AbortError'`.

- [ ] **Step 3: Write the failing tests in `tests/unit/errors.test.ts`.**
  - `isSessionError`:
    - true for `ApiError(401, 'invalid_credential')` and `'authentication_required'`;
    - **false** for `ApiError(401, 'invalid_otp')` and for `NetworkError`.
  - `isReplayable`:
    - true for `TimeoutError`, `NetworkError`, `ApiError` 502 and 504, and `ApiError(409, 'request_not_replayable')`;
    - false for `chat_busy`, `daily_limit_reached`, `validation_error`.
  - `friendlyError`: every row of the spec 5.1 table. The exact strings include:
    - `invalid_otp` → `"That code is wrong or has expired."`
    - `validation_error` with `details:[{location:['body','phone'],type:'string_pattern_mismatch'}]` → `"Enter your number with the country code, like +91 98765 43210."`
    - `NetworkError` → `"Can't reach Sovrns. Check your internet connection."`
    - an unknown code with message `'Boom'` → `'Boom'`
    - a non-error value → `"Something went wrong. Try again."`

- [ ] **Step 4: Run `npm test`.** Expected: FAIL, because the modules can't be found.
- [ ] **Step 5: Implement `types.ts`, `http.ts` and `errors.ts`** to match the Interfaces. One `AbortController` combines the caller's signal and the timeout. Parse JSON errors only when the content type contains `json`.
- [ ] **Step 6: Run `npm test` and `npm run typecheck`.** Expected: both PASS.
- [ ] **Checkpoint.**

### Task 2: Endpoint functions and live API test

**Files:**
- Create: `src/api/sovrns.ts`
- Create: `tests/live/api.live.test.ts`
- Create fixtures by copying from the research scratchpad (`…/scratchpad/api/`):
  - `q.jpg` → `tests/fixtures/question.jpg` (an 800×400 picture of "Solve: 12 x 7 = ?")
  - `p2.jpg` → `tests/fixtures/page2.jpg` ("Page 2: The answer is 84.")
  - `q.m4a` → `tests/fixtures/question.m4a` (spoken "What is the capital of France?")

**Interfaces:**
- Consumes: Task 1 `apiRequest` and the types.
- Produces (paths exactly as in spec 3.0; null or undefined query values are left out):
  - `requestCode(phone: string): Promise<OtpChallenge>`
  - `verifyCode(i: { challengeId: string; code: string; deviceName?: string }): Promise<VerifyResponse>`
  - `getMe(token: string): Promise<SessionInfo>`
  - `logout(token: string): Promise<void>`
  - `ask(token: string, body: AskBody | string, o: { idempotencyKey: string; signal?: AbortSignal; timeoutMs?: number }): Promise<AskResponse>`
  - `listChats(token: string, o?: { limit?: number; cursor?: string | null }): Promise<ChatListResponse>`
  - `listMessages(token: string, chatId: string, o?: { limit?: number; before?: number | null }): Promise<MessagesResponse>`
  - `renameChat(token: string, chatId: string, title: string): Promise<Pick<ChatSummary, 'id' | 'title' | 'can_continue' | 'last_activity_at'>>`
  - `deleteChat(token: string, chatId: string): Promise<void>`

- [ ] **Step 1: Write `tests/live/api.live.test.ts`.**
  - The whole `describe` skips unless `process.env.SOVRNS_TEST_KEY` is set. The base URL is `SOVRNS_BASE_URL ?? 'https://sovrns.com'`. Tests run in order. Every chat created is deleted in `after`.
  - Tests:
    - `me returns the limits`: `features.document_pages_max === 50`, `features.image_bytes_max === 4194304`, `assistant.questions_per_day > 0`.
    - `asks in a new chat, then a follow-up`: the first answer has a `chat_id` and `status === 'succeeded'`. The follow-up with that `chat_id` returns the same `chat_id` and `context.history_message_count === 2`.
    - `a replayed key gives the same answer once`: send the same key and body twice. Both return the same `request_id`, and `questions_used_today` goes up by exactly 1.
    - `asks about a photo and two pages`:
      - one `image` → the answer matches `/84/`;
      - `image` + `more_images` → `status === 'succeeded'`.
    - `asks by voice with a spoken reply`: m4a + `reply_as:'voice'` → `transcript` matches `/France/i` and `voice_reply.media_type === 'audio/ogg'`.
    - `pages chats and messages`: `listChats({ limit: 1 }).next_cursor !== null`, and `listMessages(chatId, { limit: 1 }).next_before !== null`.
    - `renames and deletes`:
      - `renameChat(…, 'Live test').title === 'Live test'`;
      - after `deleteChat`, `listMessages` rejects with `code === 'chat_not_found'`.
    - `rejects a wrong key`: `getMe('sk-app-wrong')` rejects with `code === 'invalid_credential'`.
- [ ] **Step 2: Run `SOVRNS_TEST_KEY=<key> npm run test:live`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/api/sovrns.ts`.**
- [ ] **Step 4: Run the live test again.** Expected: PASS. `npm test` and `npm run typecheck` still pass.
- [ ] **Checkpoint.**

### Task 3: Auth state, secure storage and the web pass-through

**Files:**
- Install: `npx expo install expo-secure-store`
- Create: `src/auth/phone.ts`, `src/auth/session.ts`
- Create: `src/lib/secureStorage.ts`, `src/lib/secureStorage.web.ts`
- Create: `src/stores/auth.ts`, `src/api/config.ts`, `src/app/api/sovrns/[...path]+api.ts`
- Test: `tests/unit/phone.test.ts`, `tests/unit/session.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces, `phone.ts`:
  - `DEFAULT_COUNTRY_CODE = '+91'`
  - `toE164(countryCode: string, localNumber: string): string | null`
  - `formatPhone(e164: string): string`
- Produces, `session.ts`:
  - `isExpired(expiresAt: string | null, now?: number): boolean`
  - `displayName(user: ApiUser | null | undefined): string`
- Produces, `secureStorage`: `getSecret(key: string): Promise<string | null>`, `setSecret(key: string, value: string): Promise<void>`, `deleteSecret(key: string): Promise<void>`.
- Produces, `config.ts`: `setupApi(): void`. It calls `configureApi` with the base from Global Constraints, using `Platform.OS === 'web'` to choose.
- Produces, `stores/auth.ts`:

  ```ts
  type Challenge = { id: string; phone: string; codeLength: number; expiresAt: number; resendAt: number };
  type Profile = { name: string; phone: string | null; organisation: string };
  type AuthState = {
    status: 'loading' | 'signedOut' | 'signedIn';
    token: string | null; expiresAt: string | null; accountId: string | null;
    profile: Profile | null; assistant: ApiAssistant | null; features: ApiFeatures | null;
    challenge: Challenge | null; notice: string | null;
    hydrate(): Promise<void>; requestCode(phone: string): Promise<void>; verifyCode(code: string): Promise<void>;
    refreshMe(): Promise<void>; signOut(): Promise<void>; endSession(notice?: string): Promise<void>; clearNotice(): void;
  };
  export const useAuthStore: UseBoundStore<StoreApi<AuthState>>;
  export function authed<T>(call: (token: string) => Promise<T>): Promise<T>;
  export function onAccountChange(listener: (accountId: string | null) => void): () => void;
  ```

  Behaviour (spec 5.2):
  - **Storage:** the secret `sovrns.session` holds `JSON {token, expiresAt}`. Non-secret data (`accountId`, `profile`, `assistant`, `features`) uses `persist` + `createFileStorage`, name `'sovrns-account'`.
  - **`hydrate`:**
    - if there is no secret, or `isExpired`, the status is `signedOut`;
    - otherwise `signedIn`, and `refreshMe()` runs in the background;
    - a session error from it calls `endSession`, while network errors are ignored.
  - **`verifyCode`:**
    - an `account_type` other than `'user'` → `logout` (best effort), status stays `signedOut`, notice `"This account can't chat in the app. Use a person account."`;
    - otherwise save the session and fire `onAccountChange(user.id)`.
  - **`signOut`:** `logout` (best effort), delete the secret, clear the state, fire `onAccountChange(null)`.
  - **`endSession`:** delete the secret only (the cache is kept), status `signedOut`, notice defaults to `"Your session ended. Please sign in again."`. It does **not** fire `onAccountChange`.
  - **`authed`:** with no token, throw `ApiError(401, 'authentication_required')`. When `isSessionError`, `await endSession()` and then rethrow.
  - **`device_name`:** `Device.modelName ?? (Platform.OS === 'web' ? 'Web browser' : 'Phone')`.
- Produces, the pass-through:
  - `/api/sovrns/<path>?<query>` goes to `${process.env.SOVRNS_API_URL ?? 'https://sovrns.com'}/<path>?<query>`, only when `<path>` matches `/^(ask|api\/v1\/[\w\-/]+)$/`. Anything else gets 404 `{"error":{"code":"not_found","message":"Not found"}}`.
  - It forwards the method, the body (`arrayBuffer`) and the headers `authorization`, `content-type` and `idempotency-key`.
  - It returns the status, body and `content-type` unchanged. Read the path from `new URL(request.url).pathname`.
  - Export `GET`, `POST`, `PATCH` and `DELETE`.

- [ ] **Step 1: Write the failing tests in `tests/unit/phone.test.ts`.**
  - `toE164`, valid numbers:
    - `('+91','98765 43210')` → `'+919876543210'`
    - `('91','98765-43210')` → `'+919876543210'`
    - `('+91','098765 43210')` → `'+919876543210'`
    - `('+91','+91 98765 43210')` → `'+919876543210'`
    - `('+1','(555) 555-0100')` → `'+15555550100'`
  - `toE164`, rejected: `('+91','123')`, `('+91','abcd')` and `('+91','')` → `null`.
  - `formatPhone`:
    - `('+919876543210')` → `'+91 98765 43210'`
    - `('+15555550100')` → `'+15555550100'`
  - Rules:
    - keep digits only;
    - a local part that starts with `+` is already complete;
    - drop one leading trunk `0`;
    - total digits must be 8–15.
- [ ] **Step 2: Write the failing tests in `tests/unit/session.test.ts`.**
  - `isExpired`:
    - `(null)` → false;
    - `('2026-01-01T00:00:00Z', Date.parse('2026-01-02'))` → true;
    - a future date → false;
    - `('garbage')` → false.
  - `displayName`:
    - `({ name: 'Asha K' } as ApiUser)` → `'Asha K'`;
    - `({ name: null, first_name: 'Asha', last_name: 'K' })` → `'Asha K'`;
    - `(null)` → `''`.
- [ ] **Step 3: Run `npm test`.** Expected: FAIL. Then implement `phone.ts` and `session.ts`. Expected: PASS.
- [ ] **Step 4: Install `expo-secure-store`.** Then implement `secureStorage`, `auth.ts`, `config.ts` and the pass-through.
- [ ] **Step 5: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS. (The pass-through is checked live in Task 4, Step 3.)
- [ ] **Checkpoint.**

### Task 4: Sign-in screens and the route guard

**Files:**
- Create: `src/components/ui/PrimaryButton.tsx`, `src/components/auth/PhoneField.tsx`, `src/components/auth/CodeInput.tsx`
- Create: `src/app/sign-in.tsx`, `src/app/verify.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `/Users/apple/Zolix/Soverign-AI/.claude/launch.json`. Add `{ "name": "mobile-web", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "Sovruns-AI-Mobile-App", "run", "web", "--", "--port", "8081"], "port": 8081 }`.

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `PrimaryButton({ label, onPress, disabled?, loading? })`
  - `PhoneField({ countryCode, number, onChangeCountryCode, onChangeNumber, onSubmit, error? })`
  - `CodeInput({ length, value, onChange, onComplete, disabled?, error? })`
  - routes `/sign-in` and `/verify`.
  - Guards: `index` and `viewer` need `signedIn`; `sign-in` and `verify` need `!signedIn`.

- [ ] **Step 1: Build the screens** to match the spec 5.2 sketch and copy.
  - **`sign-in`**, top to bottom:
    - `Wordmark` (`sizes.logo.hero`);
    - "Sign in" (`display`);
    - "We'll text you a 6-digit code." (`bodySm`, `textSecondary`);
    - `PhoneField`;
    - `PrimaryButton` "Continue";
    - the footer line (`caption`, `textTertiary`).
  - **`auth.notice`** shows in a soft `surface` box above the title, and is cleared when the person edits.
  - If `toE164` returns `null`, show the phone message **without calling the API**. Show server errors with `friendlyError` under the field. On success: `router.push('/verify')`.
  - **`verify`:**
    - back `IconButton` (ArrowLeft) → `router.back()`;
    - "Enter the code" and "Sent to {formatPhone(phone)}";
    - `CodeInput`, with `length` = `challenge.codeLength`, submits by itself when full.
  - On a wrong code: clear the boxes, show `friendlyError`, keep focus.
  - "Resend code in m:ss" counts down to `resendAt`, then becomes a "Resend code" text button that calls `requestCode(phone)` again.
  - After `expiresAt`, show "This code expired. Send a new one." and disable the boxes.
  - "Wrong number? Change it" → `router.back()`.
  - With no challenge → `<Redirect href="/sign-in" />`.
  - **`CodeInput`:**
    - one hidden `TextInput` with `keyboardType="number-pad"`, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"` and `maxLength={length}`; digits only;
    - boxes are 48×56 with `radius.md`;
    - the active box border is `colors.text`; on error, the borders are `colors.danger`.
  - **`_layout`:**
    - `setupApi()` at module scope;
    - `useEffect(() => { void useAuthStore.getState().hydrate(); }, [])`;
    - `ready` also waits for `status !== 'loading'`;
    - `<Stack.Protected guard={signedIn}>` wraps index and viewer; `<Stack.Protected guard={!signedIn}>` wraps sign-in and verify.
- [ ] **Step 2: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS.
- [ ] **Step 3: Check in the browser** (`preview_start mobile-web`).
  - While signed out, the sign-in screen shows, in light and dark.
  - "123" + Continue shows the phone message, and `read_network_requests` shows no `/auth` call.
  - Opening `http://localhost:8081/api/sovrns/api/v1/me` returns sovrns.com's 401 `authentication_required` JSON.
  - `/api/sovrns/admin` returns 404.
- [ ] **Step 4: Ask the user to sign in once in the browser pane** with their person phone. They type the number and the code themselves.
  - Network shows `otp/request` 202 → `otp/verify` 200 → `/api/v1/me` 200, and the chat screen opens.
  - Note `expires_at` (token lifetime) for the report.
- [ ] **Checkpoint.**

### Task 5: Chat model, mapping, ask body and replay (pure)

**Files:**
- Modify: `src/chat/types.ts` (v2 shapes from spec 5.3; it imports only `../api/types`)
- Create: `src/chat/mapping.ts`, `src/chat/askBody.ts`, `src/chat/replay.ts`
- Test: `tests/unit/mapping.test.ts`, `tests/unit/askBody.test.ts`, `tests/unit/replay.test.ts`

Note: after this task `npm test` passes, but `npm run typecheck` fails in the UI files until Task 6.

**Interfaces:**
- Produces, `types.ts`:
  - `AttachmentKind = 'image' | 'pdf'`
  - `PageImage = { path: string; width: number; height: number; size: number }`
  - `Attachment` adds `pages?: PageImage[]; pageCount?: number`
  - `UserMessage` adds `voice?: boolean; requestId?: string; idempotencyKey?: string; attachmentCount?: number`
  - `AnswerStatus = 'waiting' | 'done' | 'error'`
  - `AssistantMessage = { id; role: 'assistant'; text; status; note?; createdAt; requestId? }` (no `images`, no `feedback`)
  - `Chat = { id; serverId?; title; createdAt; updatedAt; messages; canContinue: boolean; preview?: string; olderBefore?: number | null; synced?: boolean }`
- Produces, `mapping.ts`:
  - `chatFromSummary(s: ChatSummary, existing?: Chat): Chat`
  - `messagesFromServer(items: ServerMessage[], local: Message[]): Message[]`
  - `hasPendingAnswer(items: ServerMessage[]): boolean`
  - `settleWaiting(chats: Record<string, Chat>): Record<string, Chat>`
- Produces, `askBody.ts`:
  - constants `REQUEST_BUDGET_CHARS = 5_500_000`, `MAX_QUESTION_CHARS = 32_000`, `MIN_IMAGE_EDGE = 1000`, `SHRINK_FACTOR = 0.8`, `SHRINK_QUALITY = 0.6`
  - `buildAskBody(i: { question?: string; chatId?: string; images?: AskImage[]; audio?: AskAudio; replyAsVoice?: boolean }): AskBody`
  - `imagesThatFit(imageChars: number[], otherChars: number, budget?: number): number`
  - `nextEdge(edge: number): number | null`
- Produces, `replay.ts`:
  - `askWithReplay<T>(send: () => Promise<T>, o?: { maxMs?: number; waitMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number; onRetry?: (attempt: number) => void }): Promise<T>`
  - Defaults: `maxMs 180_000`, `waitMs 3_000`.
  - It re-sends while `isReplayable(error)` and time is left, stops after 2 `NetworkError`s in a row, and rethrows the last error.

- [ ] **Step 1: Write the failing tests in `mapping.test.ts`.**
  - `maps server messages`:
    - user → `{ id, text, requestId: 'r1', status: 'sent', createdAt: Date.parse(created_at) }`;
    - assistant → `status: 'done'`.
  - `keeps photos sent from this phone`: a local user message with `requestId 'r1'` and `attachments [photo]` → the mapped server message `r1` has `attachments [photo]`.
  - `shows a count for photos sent from elsewhere`: `attachment_count 2`, no local match → `attachments []`, `attachmentCount 2`.
  - `keeps unsent messages`: a local `status 'failed'` message without `requestId` stays last.
  - `marks a failed answer`: assistant `request_status 'failed'` → `status 'error'`.
  - `adds a waiting answer while the server is still answering`:
    - the last item is a user message with `request_status 'processing'` → the last mapped message is an assistant with `status 'waiting'`;
    - `hasPendingAnswer` is true.
  - `chatFromSummary keeps the local id and messages`: an existing chat `{ id: 'local-1', serverId: 's1' }` → `id 'local-1'`; title, `updatedAt` (= `Date.parse(last_activity_at)`), `canContinue` and preview come from the summary.
  - `settleWaiting turns a waiting question into Not sent`: user message + waiting answer → the user message becomes `status 'failed'` and the answer is removed.
- [ ] **Step 2: Write the failing tests in `askBody.test.ts`.**
  - `text only`:
    - → `{ question: 'Hi' }`, with no `chat_id` key;
    - with `chatId` → `chat_id` is set.
  - `three images`: `image` = the first one; `more_images` has length 2.
  - `one image`: there is no `more_images` key.
  - `an empty question with an image`: there is no `question` key.
  - `voice`:
    - → `{ audio, reply_as: 'voice' }`;
    - with `replyAsVoice: false` there is no `reply_as`.
  - `question limit`: a 40 000-character question is cut to 32 000.
  - `imagesThatFit`:
    - `([2e6, 2e6, 2e6], 1000)` → 2;
    - `([6e6], 0)` → 0.
  - `nextEdge`:
    - `(1568)` → 1254;
    - `(1254)` → 1003;
    - `(1003)` → null.
- [ ] **Step 3: Write the failing tests in `replay.test.ts`.** Use a fake `sleep` and `now`.
  - `returns at once on success`: 1 call.
  - `re-sends after a 504`: `ApiError 504`, then a value → 2 calls, value returned.
  - `re-sends while the server is still answering`: `409 request_not_replayable` twice, then a value → 3 calls.
  - `does not re-send a rejected question`: `409 chat_busy` → throws after 1 call.
  - `gives up after maxMs`: always `TimeoutError`, with `now` moving 65 s per call → throws `TimeoutError` after ≤ 4 calls.
  - `fails fast on repeated network errors`: `NetworkError` twice → throws after 2 calls.
- [ ] **Step 4: Run `npm test`.** Expected: FAIL.
- [ ] **Step 5: Implement the four modules.** Run `npm test`. Expected: PASS.
- [ ] **Checkpoint.** `npm test` is green. Typecheck stays red only in UI files, which Task 6 fixes.

### Task 6: Real engine, sync and chat screen

**Files:**
- Modify:
  - `src/stores/chats.ts`
  - `src/stores/live.ts` (state becomes `{ chatId, messageId, startedAt }`, without images or phases)
  - `src/lib/files.ts` and `files.web.ts`: add `deleteAllAttachments(): void`
- Create: `src/chat/pendingBodies.ts`, `src/chat/pendingBodies.web.ts`, `src/chat/images.ts`, `src/chat/sync.ts`
- Rewrite: `src/chat/engine.ts`
- Modify:
  - `src/app/index.tsx`, `src/app/viewer.tsx` (photos only)
  - `src/components/chat/{AssistantMessageView,ActionRow,Composer,SendButton,UserMessageView,EmptyState,suggestions}.tsx|ts`
  - `src/lib/share.ts` (remove `shareCreatedImage`)
  - `src/components/voice/VoiceDock.tsx` (interim text path)
- Delete:
  - `src/app/api/{chat,capabilities,title,transcribe}+api.ts`
  - `src/server/` (the whole folder)
  - `src/api/{client,contract,endpoints,sse}.ts`
  - `src/components/chat/{ImageResults,CreatedImageView}.tsx`
  - `src/lib/features.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 5.
- Produces, the chats store:
  - Keep `createChat`, `openChat`, `appendMessages`, `updateMessage`, `removeMessage`, `renameChat`. Keep `deleteChat` too; it deletes attachment files, and PDF page files from Task 8.
  - Add:
    - `linkServer(chatId: string, serverId: string)`
    - `applyChatPage(items: ChatSummary[], nextCursor: string | null, reset: boolean)`
    - `replaceMessages(chatId: string, messages: Message[], meta: { olderBefore: number | null; canContinue?: boolean; title?: string })`
    - `prependMessages(chatId: string, messages: Message[], olderBefore: number | null)`
    - `setAccount(accountId: string)`, which wipes when the account is different
    - `wipe()`
  - State adds `order: string[]`, `nextCursor: string | null` and `accountId: string | null`.
  - Selector `useDrawerChats(): Chat[]`: chats that exist only on this phone (they have messages and no `serverId`) come first, newest first; then the chats in `order`.
  - `persist`: name `'sovrns-chats'`, `version: 2`. `migrate` from v1 returns an empty state and calls `deleteAllAttachments()`. `partialize` keeps `{ chats, order, accountId }`. `merge` applies `settleWaiting`.
  - It subscribes `onAccountChange`: `null` → `wipe()` + `deleteAllAttachments()` + clear the composer; an id → `setAccount(id)`.
- Produces, `pendingBodies`:
  - `savePendingBody(key: string, json: string): Promise<void>`
  - `loadPendingBody(key: string): Promise<string | null>`
  - `deletePendingBody(key: string): Promise<void>`
  - Phones: `Paths.cache/pending/<key>.json`. Web: an in-memory `Map`.
- Produces, `images.ts`:
  - `prepareImagesForSend(attachments: Attachment[], limits: { maxImages: number; maxImageBytes: number }): Promise<{ images: AskImage[]; dropped: number }>`
  - Photos only in this task: read them as base64 and cap the count. Task 8 adds pages and shrinking.
- Produces, `engine.ts`:
  - `sendMessage(text: string, attachments: Attachment[]): Promise<AssistantMessage | undefined>`
  - `sendVoice(audio: AskAudio, o: { replyAsVoice: boolean }): Promise<{ answer?: AssistantMessage; voiceReply: VoiceReply | null }>`
  - `retrySend(chatId: string, userMessageId: string)`
  - `retryAnswer(chatId: string, answerId: string)`
  - `titleFrom(text, attachments)` (unchanged)
  - The flow follows spec 5.4:
    - the key is `newId()` per user message, and the JSON body is saved with `savePendingBody`;
    - the call is `askWithReplay(() => authed(t => ask(t, json, { idempotencyKey, timeoutMs: 65_000 })))`.
  - **On success:**
    - `linkServer`, and set `requestId`;
    - for voice, the user text becomes the `transcript`;
    - set the answer text; the note is "This answer may be incomplete." when `finish_reason` is neither null nor `'completed'`;
    - delete the saved body;
    - in the background, run `refreshMe()` + `refreshChats()`.
  - **When re-sending gives up:** the user message becomes `status 'failed'` and keeps its key; the answer is removed.
  - **On any other error:** the answer becomes `status 'error'` with the `friendlyError` note; the user message gets a fresh key, and its saved body is deleted.
- Produces, `sync.ts`:
  - `refreshChats()`, `loadMoreChats()`, `syncChat(chatId)`, `loadOlderMessages(chatId)`
  - `syncChat` runs again every 4 000 ms, for up to 120 000 ms, while `hasPendingAnswer` is true and that chat is open.
  - `404 chat_not_found` → delete the chat locally + `openChat(null)`.
- UI changes:
  - **`SendButton`:** mode `'waiting'` replaces `'stop'`. It shows a spinner, is disabled, and is labelled "Waiting for the answer".
  - **`Composer`:** `maxLength={32000}`.
  - **`index.tsx`:**
    - shows "This chat can't continue. Start a new chat." in place of the composer when `canContinue === false`;
    - voice is available when `features?.audio_questions === true`;
    - calls `refreshChats()` on mount and `syncChat(id)` when the open chat changes.
  - **`AssistantMessageView`:** `ThinkingIndicator` while waiting. The `ErrorBlock` retry calls `retryAnswer` (newest answer only).
  - **`ActionRow`:** Copy and Read aloud only.
  - **`UserMessageView`:**
    - shows "Voice message…" when `voice` is set and the text is empty;
    - shows a "📎 {n} attachments" chip when `attachmentCount > 0` and there are no local attachments.
  - **`suggestions`:** drop `'image'`; `suggestionsFor()` takes no arguments.
  - **`VoiceDock` (interim):** call `sendVoice(…, { replyAsVoice: false })`, then `speak(answer.text)`. The talk button is disabled while answering.

- [ ] **Step 1: Implement the stores, `pendingBodies`, `images` (photos), `engine` and `sync`.**
- [ ] **Step 2: Make the UI edits and delete the listed files.** `grep -rnE "api/(contract|endpoints|client)|src/server|CreatedImage|regenerateAnswer|setFeedback|useCapabilities" src` → no matches.
- [ ] **Step 3: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS.
- [ ] **Step 4: Check in the browser** (signed in since Task 4).
  - Ask "What is photosynthesis? Two sentences." → the answer shows. Network shows `POST /api/sovrns/ask` 200 with an `Idempotency-Key`.
  - Ask a follow-up → the request body has `chat_id`.
  - Reload → the chat is still there, and opening it calls `…/messages`.
  - Attach a photo and ask → an answer comes back.
- [ ] **Step 5: Check the cut-off recovery live.**
  - Temporarily give the *first* try `timeoutMs: 1500`; later tries keep 65 000.
  - Ask a question. The waiting dots stay, then the answer arrives. Network shows the same `Idempotency-Key` repeated, ending in one 200.
  - Afterwards, `/api/v1/me` shows the question counted once.
  - **Undo the temporary change** and confirm with `git diff src/chat/engine.ts`.
- [ ] **Checkpoint.**

### Task 7: History drawer, older messages and settings

**Files:**
- Modify: `src/components/chat/HistoryDrawer.tsx`, `RenameDialog.tsx`, `SettingsSheet.tsx`, `MessageList.tsx`

**Interfaces:**
- Consumes: Task 6 sync and store, and the Task 3 auth store.

- [ ] **Step 1: Implement spec 5.3 and 5.7.**
  - **Drawer list:**
    - built from `useDrawerChats()`;
    - `refreshChats()` runs whenever the drawer opens, and on pull-to-refresh (`RefreshControl`);
    - at the end of the list, if there is a `nextCursor`: "Loading more…" and `loadMoreChats()`;
    - search filters by title and preview.
  - **Rename:** update the chat straight away (`renameChat`), then call `authed(t => renameChat(t, serverId, title))`. On failure, undo and show an `Alert` with `friendlyError`.
  - **Delete:**
    - the confirm text is "This chat will be deleted.";
    - remove the chat straight away; on failure, put the saved chat object back and show an `Alert`;
    - a chat with no `serverId` is deleted on the phone only.
  - **`RenameDialog`:** `maxLength={120}`.
  - **`MessageList`:** when `chat.olderBefore != null`, a "Load earlier messages" text button at the top (`ListHeaderComponent`) calls `loadOlderMessages(chat.id)`.
  - **Settings:**
    - an Account group with `displayName`, `formatPhone(profile.phone)` and the organisation;
    - "{used} of {perDay} questions used", with `refreshMe()` when the sheet opens;
    - a red "Sign out" row → `Alert` "Sign out?" / "Your chats will be removed from this phone." → `signOut()`.
- [ ] **Step 2: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS.
- [ ] **Step 3: Check in the browser.**
  - The drawer matches the server's order.
  - Rename → `PATCH` 200, and the title stays after a refresh.
  - Delete → `DELETE` 200, and the chat is gone after a refresh.
  - Settings shows the usage numbers.
  - The paging API is covered by the live test; the UI paging only runs with more than 30 chats, so say so in the report.
- [ ] **Checkpoint.**

### Task 8: Photos and PDFs

**Files:**
- Install: `npx expo install react-native-webview`
- Create:
  - `src/lib/pdf/pdfScript.ts` (one JS string, shared by both renderers)
  - `src/lib/pdf/renderPdf.ts`, `renderPdf.web.ts`
  - `src/lib/pdf/PdfRendererHost.tsx`, `PdfRendererHost.web.tsx` (the web one returns `null`)
- Modify:
  - `src/chat/attachments.ts`, `src/chat/images.ts`
  - `src/lib/files.ts` and `files.web.ts`
  - `src/components/chat/{AttachSheet,AttachmentStrip,DocumentCard,Composer}.tsx`, `src/stores/composer.ts`
  - `src/stores/chats.ts` (also delete PDF page files)
  - `src/app/_layout.tsx` (mount the host while signed in)

**Interfaces:**
- Produces, `files`: `writeBase64File(fileName: string, base64: string, folder: 'attachments' | 'cache'): Promise<{ path: string; uri: string; size: number }>`. On web, `path` and `uri` are a data URL.
- Produces, `renderPdfPages(base64: string, o: { maxPages: number; maxEdge: number; quality: number }): Promise<{ pages: { base64: string; width: number; height: number }[]; totalPages: number }>`. It rejects with `Error("This PDF can't be opened.")`.
- Produces, `pdfScript`:
  - it defines `window.__renderPdf(base64, opts, onPage, onDone, onError)`;
  - it uses `pdfjsLib` from `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`, with the worker at `…/3.11.174/pdf.worker.min.js`;
  - for each page: `scale = maxEdge / max(width, height)` (at scale 1), draw it to a canvas, then `toDataURL('image/jpeg', quality)`.
- Native host:
  - a hidden 1×1 `WebView` whose HTML loads PDF.js + `pdfScript`;
  - jobs go in through `injectJavaScript`, and pages come back through `postMessage`, one message per page;
  - each job times out after 60 000 ms.
- Produces, the full `prepareImagesForSend`:
  1. Take the photos and PDF pages in order, up to `maxImages`; the rest count as `dropped`.
  2. While the total base64 > `REQUEST_BUDGET_CHARS`, or any picture > `maxImageBytes * 4 / 3`: re-encode every picture with `ImageManipulator` to `nextEdge(edge)` at quality 0.6. Stop when `nextEdge` returns `null`.
  3. Then use `imagesThatFit` to drop the remaining pictures.
  - The engine adds the note "Only the first {n} pages fit in one question. Ask again with the rest." when `dropped > 0`, and shows the `request_too_large` text when 0 fit.
- `attachments.ts`:
  - the Files picker takes `['application/pdf','image/jpeg','image/png','image/webp','image/heic']`;
  - pictures from Files go through `preparePhoto`;
  - a PDF is rendered when it is added (`maxEdge 1400`, `quality 0.7`, `maxPages = features.document_pages_max ?? 50`), and its pages are saved with `writeBase64File(…, 'attachments')` → `{ kind: 'pdf', pages, pageCount: totalPages }`;
  - PDFs over 15 MB are refused; a render error shows the draft as failed with "This PDF can't be opened.";
  - the text-file code is removed.
- UI:
  - **`AttachSheet`:** the Files hint is "PDF and pictures".
  - **`Composer`:** the `+` button is hidden when `features?.images === false`. The same applies to the "Summarize a document" and "Ask about a photo" suggestions.
  - **`DocumentCard` / `AttachmentStrip`:** show "PDF · {pageCount} pages". When fewer pages were kept than the PDF has, add " · first {pages.length} sent".

- [ ] **Step 1: Implement the renderer, attachments and images.**
- [ ] **Step 2: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS.
- [ ] **Step 3: Check in the browser.**
  - Make a 3-page test PDF in the scratchpad with PIL.
  - Attach it by setting the web file input from `javascript_tool`. This is a test action only: build the `File` from inline base64 and fire `change`.
  - Ask "Summarise each page in one line." The answer covers all 3 pages, and the request body has `image` + 2 `more_images`.
  - A 6-photo question stays under 6 MB: check the request size in the network log.
- [ ] **Checkpoint.**

### Task 9: Voice replies

**Files:**
- Create: `src/lib/voiceReply.ts`
- Modify: `src/components/voice/VoiceDock.tsx`

**Interfaces:**
- Consumes: Task 6 `sendVoice`, Task 8 `writeBase64File`, and `speak` / `stopSpeaking`.
- Produces: `playVoiceReply(id: string, reply: VoiceReply, fallbackText: string, onEnd: () => void): () => void` (it returns stop).
  1. Write the reply to the cache (`.ogg`).
  2. `createAudioPlayer({ uri })`, then `play()`.
  3. `didJustFinish` → `onEnd`.
  4. On an error, or if it isn't `playing` within 3 000 ms: remove the player, then `speak(id, fallbackText, onEnd)`.
- `VoiceDock`:
  - `available = features?.audio_questions === true`;
  - `replyAsVoice = features?.voice_replies === true && !muted`;
  - the phases are `idle → listening → answering → speaking`; the "transcribing" phase is removed, because the server writes down the words and answers in one call;
  - the status while answering is "Getting your answer"; the talk button is disabled with a spinner, and there is no Stop;
  - with a voice reply → `playVoiceReply`; without one, and not muted → `speak(answer.text)`;
  - the recording type is unchanged (`audio/m4a` on phones, `audio/webm` on web).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `npm run typecheck && npm run lint && npm test`.** Expected: PASS.
- [ ] **Step 3: Check in the browser.**
  - Voice mode is offered.
  - If the pane can use a microphone: say "What is two plus two?" → the user message shows the transcript, the answer shows, and the reply plays (Chromium plays Ogg/Opus). The request uses `audio/webm`.
  - If there is no microphone, say so in the report. The API path is covered by the live test (m4a).
- [ ] **Checkpoint.**

### Task 10: Cleanup and final verification

**Files:**
- Modify: `package.json` (`npm uninstall @anthropic-ai/sdk`), `README.md`

- [ ] **Step 1: Remove the old package.** Run `npm uninstall @anthropic-ai/sdk`. Then `grep -rnE "anthropic|AI_API_KEY|STT_|creating_image|imageGeneration" src` → no matches.
- [ ] **Step 2: Update the README.** It covers:
  - how to run (`npx expo start`), and the web-preview pass-through;
  - `npm test`, and `SOVRNS_TEST_KEY=… npm run test:live`;
  - `EXPO_PUBLIC_API_URL`;
  - that the old `AI_*` / `STT_*` lines in `.env` can be deleted.
- [ ] **Step 3: Run every check.** `npm run typecheck && npm run lint && npm test && SOVRNS_TEST_KEY=… npm run test:live && npm run doctor` → all PASS (`doctor`: no SDK version mismatches).
- [ ] **Step 4: Do a full pass in the browser** with the user's account:
  1. New chat, follow-up, photo, PDF; open an older chat; rename; delete; Settings usage.
  2. **Session ended:** set a bad token in `localStorage` with `javascript_tool` (a test action), then reload. The sign-in screen shows "Your session ended. Please sign in again.", and `localStorage['sovrns-chats']` still holds the chats.
  3. Ask the user to sign in again. The same chats show without a sync.
  4. **Sign out** from Settings → back to sign-in, and `sovrns-chats` is empty.
- [ ] **Step 5: Get a whole-branch review** from a fresh reviewer subagent on `git diff main...` plus the untracked files. Fix the confirmed findings and re-run Step 3.
- [ ] **Step 6: Report to the user.** Say what works and how it was checked, and what only a phone can check: Ogg playback on iPhone, PDF rendering in the WebView, the keychain. Ask whether to commit.
