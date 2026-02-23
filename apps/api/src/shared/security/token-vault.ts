import {
  decryptSecret as decryptSecretWithKey,
  encryptSecret as encryptSecretWithKey
} from "@growth-os/shared";

function requireTokenEncryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be configured.");
  }
  return key;
}

export function encryptSecret(plaintext: string) {
  const rawKey = requireTokenEncryptionKey();
  return encryptSecretWithKey(plaintext, rawKey);
}

export function decryptSecret(payload: string) {
  const rawKey = requireTokenEncryptionKey();
  return decryptSecretWithKey(payload, rawKey);
}
