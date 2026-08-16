import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const SECRET_ENVELOPE_PREFIX = "enc:v1:";

function keyBytes(): Buffer | null {
  const raw = process.env.EMAIL_SECRETS_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const asB64 = Buffer.from(raw, "base64");
  if (asB64.length === 32) return asB64;
  return createHash("sha256").update(raw).digest();
}

export function hasEmailSecretsKey(): boolean {
  return Boolean(keyBytes());
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(SECRET_ENVELOPE_PREFIX));
}

export function encryptSecret(plain: string): string {
  const trimmed = plain.trim();
  if (!trimmed) return "";
  if (isEncryptedSecret(trimmed)) return trimmed;
  const key = keyBytes();
  if (!key) return trimmed;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_ENVELOPE_PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isEncryptedSecret(trimmed)) return trimmed;
  const key = keyBytes();
  if (!key) {
    throw new Error("EMAIL_SECRETS_KEY is required to decrypt mailbox secrets");
  }
  const packed = Buffer.from(trimmed.slice(SECRET_ENVELOPE_PREFIX.length), "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type SecretFields = {
  smtpPass?: string;
  resendApiKey?: string;
};

export function secretsNeedSealing(fields: SecretFields): boolean {
  if (!hasEmailSecretsKey()) return false;
  const pass = fields.smtpPass?.trim();
  const key = fields.resendApiKey?.trim();
  return Boolean((pass && !isEncryptedSecret(pass)) || (key && !isEncryptedSecret(key)));
}

export function sealEmailSecrets<T extends SecretFields>(fields: T): T {
  return {
    ...fields,
    smtpPass: fields.smtpPass ? encryptSecret(fields.smtpPass) : fields.smtpPass,
    resendApiKey: fields.resendApiKey ? encryptSecret(fields.resendApiKey) : fields.resendApiKey,
  };
}

export function unsealEmailSecrets<T extends SecretFields>(fields: T): T {
  return {
    ...fields,
    smtpPass: fields.smtpPass ? decryptSecret(fields.smtpPass) : fields.smtpPass,
    resendApiKey: fields.resendApiKey ? decryptSecret(fields.resendApiKey) : fields.resendApiKey,
  };
}
