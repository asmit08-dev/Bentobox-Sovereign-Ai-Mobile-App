// Phone numbers for sign-in. The server wants E.164: a "+", the country code, then the
// number, with no spaces ("+919876543210"). No React Native imports: Node tests this file.

export const DEFAULT_COUNTRY_CODE = '+91';

const digitsOf = (text: string) => text.replace(/\D/g, '');

function asE164(digits: string) {
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/**
 * The country code and the number as the person typed them → E.164, or null when it can't be
 * a phone number. Spaces, dashes and brackets are dropped, and so is a leading 0.
 * A number pasted with its own "+" code is used as it is.
 * Example: ("+91", "098765 43210") → "+919876543210".
 */
export function toE164(countryCode: string, localNumber: string): string | null {
  const local = localNumber.trim();
  if (local.startsWith('+')) return asE164(digitsOf(local));
  const number = digitsOf(local).replace(/^0/, '');
  if (!number) return null;
  return asE164(digitsOf(countryCode) + number);
}

/** For showing: "+919876543210" → "+91 98765 43210". Other countries are left as they are. */
export function formatPhone(e164: string) {
  const india = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return india ? `+91 ${india[1]} ${india[2]}` : e164;
}
