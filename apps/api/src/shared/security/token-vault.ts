import {
  decryptSecret as decryptSecretWithKey,
  encryptSecret as encryptSecretWithKey
} from "@growth-os/shared";

export function encryptSecret(plaintext: string) {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY ?? "local-dev-insecure-key";
  return encryptSecretWithKey(plaintext, rawKey);
}

export function decryptSecret(payload: string) {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY ?? "local-dev-insecure-key";
  return decryptSecretWithKey(payload, rawKey);
}
