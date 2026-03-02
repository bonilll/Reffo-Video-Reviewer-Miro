import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const IV_SIZE = 12;
const TAG_SIZE = 16;

const normalizeMasterKey = () => {
  const raw = process.env.AI_KEYS_MASTER_KEY;
  if (!raw) {
    throw new Error("AI_KEYS_MASTER_KEY_MISSING");
  }

  const trimmed = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const asBase64 = Buffer.from(trimmed, "base64");
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    // noop
  }

  return createHash("sha256").update(trimmed).digest();
};

const encryptAesGcm = (plaintext: Buffer, key: Buffer, aad: string) => {
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decryptAesGcm = (encoded: string, key: Buffer, aad: string) => {
  const payload = Buffer.from(encoded, "base64");
  const iv = payload.subarray(0, IV_SIZE);
  const tag = payload.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ciphertext = payload.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

export type EncryptedApiKey = {
  ciphertext: string;
  wrappedDek: string;
  kmsKeyVersion: string;
  fingerprint: string;
  last4: string;
};

export const encryptApiKey = (apiKey: string): EncryptedApiKey => {
  const normalized = apiKey.trim();
  if (normalized.length < 12) {
    throw new Error("API_KEY_TOO_SHORT");
  }

  const dek = randomBytes(32);
  const masterKey = normalizeMasterKey();

  const wrappedDek = encryptAesGcm(dek, masterKey, "ai-key-wrap:v1");
  const ciphertext = encryptAesGcm(Buffer.from(normalized, "utf8"), dek, "ai-key-data:v1");

  const fingerprint = createHash("sha256").update(normalized).digest("hex");
  const last4 = normalized.slice(-4);

  return {
    ciphertext,
    wrappedDek,
    kmsKeyVersion: process.env.GCP_KMS_KEY_VERSION || "local-kek:v1",
    fingerprint,
    last4,
  };
};

export const decryptApiKey = (params: {
  ciphertext: string;
  wrappedDek: string;
}) => {
  const masterKey = normalizeMasterKey();
  const dek = decryptAesGcm(params.wrappedDek, masterKey, "ai-key-wrap:v1");
  const plaintext = decryptAesGcm(params.ciphertext, dek, "ai-key-data:v1");
  return plaintext.toString("utf8");
};

const hashValue = (input: string) => createHash("sha256").update(input).digest("hex");

const gatewaySecret = () => {
  const secret = process.env.AI_KEYS_GATEWAY_SIGNING_SECRET;
  if (!secret) {
    throw new Error("AI_KEYS_GATEWAY_SIGNING_SECRET_MISSING");
  }
  return secret;
};

const randomNonce = () => randomBytes(12).toString("hex");

export const hashProofToken = (proofToken: string) => hashValue(proofToken);

export const newProofToken = () => randomBytes(24).toString("base64url");

export const buildGatewayEnvelope = (
  userId: string,
  action: string,
  payload: Record<string, unknown>
) => {
  const ts = Date.now();
  const nonce = randomNonce();
  const payloadHash = hashValue(JSON.stringify(payload));
  const message = `${userId}:${action}:${ts}:${nonce}:${payloadHash}`;
  const signature = createHmac("sha256", gatewaySecret()).update(message).digest("hex");

  return {
    ts,
    nonce,
    payloadHash,
    signature,
  };
};

const KEY_PATTERN = /(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,})/g;

export const redactSecrets = (value: string) => value.replace(KEY_PATTERN, "[REDACTED_KEY]");

export const isLikelyApiKey = (value: string) => {
  if (!value) return false;
  if (value.startsWith("AIza") && value.length >= 20) return true;
  if (value.startsWith("sk-") && value.length >= 20) return true;
  return false;
};
