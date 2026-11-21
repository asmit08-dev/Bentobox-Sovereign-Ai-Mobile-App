// WEB PREVIEW ONLY: browsers have no keychain, so the token is kept in localStorage.
// Phones use secureStorage.ts (the keychain).

export async function getSecret(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is blocked. The preview stays signed in until it reloads.
  }
}

export async function deleteSecret(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
