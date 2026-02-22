import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function resolveEncryptionKey(rawKey: string) {
  const normalized = rawKey.trim();

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }

  const base64Candidate = Buffer.from(normalized, "base64");
  if (base64Candidate.length === 32) {
    return base64Candidate;
  }

  // Dev-friendly fallback: derive a 32-byte key from arbitrary-length input.
  return createHash("sha256").update(normalized).digest();
}

function keyOrThrow() {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
  return resolveEncryptionKey(rawKey ?? "local-dev-insecure-key");
}

function encodeParts(iv: Buffer, ciphertext: Buffer, authTag: Buffer) {
  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url")
  ].join(".");
}

function decodeParts(payload: string) {
  const [ivPart, cipherPart, tagPart] = payload.split(".");
  if (!ivPart || !cipherPart || !tagPart) {
    throw new Error("Invalid encrypted payload format");
  }

  return {
    iv: Buffer.from(ivPart, "base64url"),
    ciphertext: Buffer.from(cipherPart, "base64url"),
    authTag: Buffer.from(tagPart, "base64url")
  };
}

export function encryptSecret(plaintext: string) {
  const key = keyOrThrow();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return encodeParts(iv, ciphertext, authTag);
}

export function decryptSecret(payload: string) {
  const key = keyOrThrow();
  const { iv, ciphertext, authTag } = decodeParts(payload);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
