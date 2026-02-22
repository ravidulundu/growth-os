import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createLogger } from "../observability/logger";

const ALGORITHM = "aes-256-gcm";
const BASE64_32_BYTE_KEY_PATTERN =
  /^(?:[A-Za-z0-9+/]{43}=|[A-Za-z0-9+/]{44}|[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{44})$/;
const derivedKeyWarningFingerprints = new Set<string>();
const logger = createLogger("token-vault");

function allowDerivedKeyFallback() {
  const explicit = process.env.TOKEN_KEY_ALLOW_DERIVED?.trim().toLowerCase();
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  const mode = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
  return mode === "" || mode === "development" || mode === "test" || mode === "ci";
}

export function resolveEncryptionKey(rawKey: string) {
  const normalized = rawKey.trim();

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }

  if (BASE64_32_BYTE_KEY_PATTERN.test(normalized)) {
    const base64Candidate = Buffer.from(normalized, "base64");
    if (base64Candidate.length === 32) {
      return base64Candidate;
    }
  }

  if (!allowDerivedKeyFallback()) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64-char hex or base64.");
  }

  const keyFingerprint = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  if (!derivedKeyWarningFingerprints.has(keyFingerprint)) {
    derivedKeyWarningFingerprints.add(keyFingerprint);
    logger.warn(
      `Using derived TOKEN_ENCRYPTION_KEY fallback (sha256 of raw input). Provide a 32-byte hex/base64 key for production. key_fingerprint=${keyFingerprint}`
    );
  }

  // Dev-friendly fallback: derive a 32-byte key from arbitrary-length input.
  return createHash("sha256").update(normalized).digest();
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

export function encryptSecret(plaintext: string, rawKey: string) {
  const key = resolveEncryptionKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return encodeParts(iv, ciphertext, authTag);
}

export function decryptSecret(payload: string, rawKey: string) {
  const key = resolveEncryptionKey(rawKey);
  const { iv, ciphertext, authTag } = decodeParts(payload);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
