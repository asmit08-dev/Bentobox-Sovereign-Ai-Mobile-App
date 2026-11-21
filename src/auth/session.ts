// Small helpers about the signed-in session. No React Native imports: Node tests this file.
import type { ApiUser } from '../api/types';

/** True once the token's `expires_at` has passed. A missing or broken date never expires. */
export function isExpired(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= now;
}

/** The person's name for Settings: "Asha K". */
export function displayName(user: ApiUser | null | undefined) {
  if (!user) return '';
  const full = user.name?.trim();
  if (full) return full;
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
}
