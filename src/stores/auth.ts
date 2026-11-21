// Who is signed in. The login token is a secret: it lives in the keychain (lib/secureStorage).
// The rest (name, organisation, limits, today's usage) is not secret and is saved in the normal
// file store, so the app can open offline.
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { endsSession } from '@/api/errors';
import { ApiError } from '@/api/http';
import * as api from '@/api/sovrns';
import type { ApiAssistant, ApiFeatures, SessionInfo } from '@/api/types';
import { displayName, isExpired } from '@/auth/session';
import { deleteSecret, getSecret, setSecret } from '@/lib/secureStorage';
import { createFileStorage } from '@/lib/storage';

const SECRET_KEY = 'sovrns.session';
export const SESSION_ENDED = 'Your session ended. Please sign in again.';
const NOT_A_PERSON = "This account can't chat in the app. Use a person account.";

/** A code that was sent and is waiting to be typed. Times are in ms since 1970. */
export type Challenge = {
  id: string;
  phone: string;
  codeLength: number;
  expiresAt: number;
  resendAt: number;
};

export type Profile = { name: string; phone: string | null; organisation: string };

type AuthState = {
  /** loading: the saved token is being read. */
  status: 'loading' | 'signedOut' | 'signedIn';
  token: string | null;
  expiresAt: string | null;
  accountId: string | null;
  profile: Profile | null;
  assistant: ApiAssistant | null;
  features: ApiFeatures | null;
  challenge: Challenge | null;
  /** A message for the sign-in screen, such as "Your session ended…". */
  notice: string | null;

  /** Reads the saved token when the app starts. */
  hydrate: () => Promise<void>;
  /** Sends a code by SMS. `phone` is E.164. Throws ApiError for the screen to show. */
  requestCode: (phone: string) => Promise<void>;
  /** Checks the code and signs in. Throws ApiError (a wrong code never signs anyone out). */
  verifyCode: (code: string) => Promise<void>;
  /** Refreshes the name, limits and today's usage. */
  refreshMe: () => Promise<void>;
  /** The person tapped Sign out: ends the token and removes their data from this phone. */
  signOut: () => Promise<void>;
  /** The token expired or was revoked: forget it, but keep the chats for the same account. */
  endSession: (notice?: string) => Promise<void>;
  clearNotice: () => void;
};

type AccountListener = (accountId: string | null) => void;
const accountListeners = new Set<AccountListener>();

/**
 * Called with the account id after a sign-in, and with null after Sign out. The chats store
 * uses it to keep chats per account (it can't import this file back without a cycle).
 */
export function onAccountChange(listener: AccountListener) {
  accountListeners.add(listener);
  return () => {
    accountListeners.delete(listener);
  };
}

function announceAccount(accountId: string | null) {
  for (const listener of accountListeners) listener(accountId);
}

function profileFrom(info: SessionInfo): Profile {
  return {
    name: displayName(info.user),
    phone: info.user?.phone ?? null,
    organisation: info.organisation?.name ?? '',
  };
}

function deviceName() {
  return Device.modelName ?? (Platform.OS === 'web' ? 'Web browser' : 'Phone');
}

async function readSavedSession() {
  try {
    const raw = await getSecret(SECRET_KEY);
    const saved = raw ? (JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }) : null;
    if (typeof saved?.token !== 'string' || !saved.token) return null;
    return {
      token: saved.token,
      expiresAt: typeof saved.expiresAt === 'string' ? saved.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'loading',
      token: null,
      expiresAt: null,
      accountId: null,
      profile: null,
      assistant: null,
      features: null,
      challenge: null,
      notice: null,

      hydrate: async () => {
        const saved = await readSavedSession();
        if (!saved) {
          set({ status: 'signedOut', token: null, expiresAt: null });
          return;
        }
        if (isExpired(saved.expiresAt)) {
          await get().endSession();
          return;
        }
        set({ status: 'signedIn', token: saved.token, expiresAt: saved.expiresAt });
        // Fresh limits and usage in the background. Offline is fine: the saved ones stay.
        get()
          .refreshMe()
          .catch(() => {});
      },

      requestCode: async (phone) => {
        const challenge = await api.requestCode(phone);
        const now = Date.now();
        set({
          challenge: {
            id: challenge.challenge_id,
            phone,
            codeLength: challenge.code_length || 6,
            expiresAt: now + challenge.expires_in * 1000,
            resendAt: now + challenge.resend_after * 1000,
          },
          notice: null,
        });
      },

      verifyCode: async (code) => {
        const challenge = get().challenge;
        if (!challenge) {
          throw new ApiError({ status: 400, code: 'no_challenge', message: 'Ask for a new code.' });
        }
        const session = await api.verifyCode({
          challengeId: challenge.id,
          code,
          deviceName: deviceName(),
        });
        if (session.account_type !== 'user') {
          // Admin accounts can't chat (spec 5.2). Don't keep their token.
          await api.logout(session.access_token).catch(() => {});
          throw new ApiError({ status: 403, code: 'not_a_person', message: NOT_A_PERSON });
        }
        await setSecret(
          SECRET_KEY,
          JSON.stringify({ token: session.access_token, expiresAt: session.expires_at }),
        );
        // The chats store switches account first, so the chat list never shows someone else's.
        announceAccount(session.user.id);
        set({
          status: 'signedIn',
          token: session.access_token,
          expiresAt: session.expires_at,
          accountId: session.user.id,
          profile: profileFrom(session),
          assistant: session.assistant,
          features: session.features,
          challenge: null,
          notice: null,
        });
      },

      refreshMe: async () => {
        const info = await authed((token) => api.getMe(token));
        set({
          accountId: info.user?.id ?? get().accountId,
          profile: profileFrom(info),
          assistant: info.assistant,
          features: info.features,
        });
      },

      signOut: async () => {
        const token = get().token;
        // The phone forgets everything first; the server is told afterwards, without waiting
        // (a slow network must not keep the person signed in).
        await deleteSecret(SECRET_KEY).catch(() => {});
        set({
          status: 'signedOut',
          token: null,
          expiresAt: null,
          accountId: null,
          profile: null,
          assistant: null,
          features: null,
          challenge: null,
          notice: null,
        });
        announceAccount(null);
        if (token) void api.logout(token).catch(() => {});
      },

      endSession: async (notice = SESSION_ENDED) => {
        await deleteSecret(SECRET_KEY).catch(() => {});
        // accountId and the chats stay, so the same person finds everything after signing in.
        set({ status: 'signedOut', token: null, expiresAt: null, challenge: null, notice });
      },

      clearNotice: () => set({ notice: null }),
    }),
    {
      name: 'sovrns-account',
      version: 1,
      storage: createJSONStorage(createFileStorage),
      partialize: (state) => ({
        accountId: state.accountId,
        profile: state.profile,
        assistant: state.assistant,
        features: state.features,
      }),
    },
  ),
);

/**
 * Runs an API call with the login token. When the server says the token is no longer good,
 * the session ends (the sign-in screen shows "Your session ended…") and the error is rethrown.
 */
export async function authed<T>(call: (token: string) => Promise<T>): Promise<T> {
  const { token, expiresAt } = useAuthStore.getState();
  const ended = () =>
    new ApiError({ status: 401, code: 'authentication_required', message: SESSION_ENDED });
  if (!token) throw ended();
  // The token's end date passed while the app was open.
  if (isExpired(expiresAt, Date.now())) {
    await useAuthStore.getState().endSession();
    throw ended();
  }
  try {
    return await call(token);
  } catch (error) {
    // Any 401 ends the session, whatever its code. Only the session that made the call ends.
    if (endsSession(error) && useAuthStore.getState().token === token) {
      await useAuthStore.getState().endSession();
    }
    throw error;
  }
}

/** What this account may send, or null before it is known. */
export function useFeatures() {
  return useAuthStore((state) => state.features);
}
