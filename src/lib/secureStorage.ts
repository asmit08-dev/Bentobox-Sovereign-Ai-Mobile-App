// Secrets (the login token) live in the phone's keychain, never in the normal files.
// The web preview uses secureStorage.web.ts instead.
import * as SecureStore from 'expo-secure-store';

export function getSecret(key: string) {
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string) {
  await SecureStore.deleteItemAsync(key);
}
