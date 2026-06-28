import crypto from "node:crypto";

const marker = "__palmpayEncryptedFaceDescriptor";

type EncryptedFaceDescriptor = {
  [marker]: true;
  alg: "AES-256-GCM";
  data: string;
  iv: string;
  tag: string;
  version: 1;
};

function getKey() {
  const secret =
    process.env.BIOMETRIC_ENCRYPTION_KEY ??
    process.env.BETTER_AUTH_SECRET ??
    "palmpay-demo-local-biometric-key";
  return crypto.createHash("sha256").update(secret).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEncryptedFaceDescriptor(
  value: unknown,
): value is EncryptedFaceDescriptor {
  return (
    isRecord(value) &&
    value[marker] === true &&
    value.alg === "AES-256-GCM" &&
    value.version === 1 &&
    typeof value.data === "string" &&
    typeof value.iv === "string" &&
    typeof value.tag === "string"
  );
}

function normalizeDescriptor(value: unknown) {
  if (!Array.isArray(value)) return null;
  const descriptor = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
  return descriptor.length >= 32 ? descriptor : null;
}

export function encryptFaceDescriptor(value: unknown) {
  const descriptor = normalizeDescriptor(value);
  if (!descriptor) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(descriptor), "utf8"),
    cipher.final(),
  ]);

  return {
    [marker]: true,
    alg: "AES-256-GCM",
    data: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: 1,
  } satisfies EncryptedFaceDescriptor;
}

export function decryptFaceDescriptor(value: unknown) {
  const plaintextDescriptor = normalizeDescriptor(value);
  if (plaintextDescriptor) return plaintextDescriptor;
  if (!isEncryptedFaceDescriptor(value)) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.data, "base64")),
      decipher.final(),
    ]);
    return normalizeDescriptor(JSON.parse(decrypted.toString("utf8")));
  } catch {
    return null;
  }
}

export function encryptBiometricTemplates<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => encryptBiometricTemplates(item)) as T;
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "face_descriptor" && !isEncryptedFaceDescriptor(item)
        ? encryptFaceDescriptor(item)
        : encryptBiometricTemplates(item),
    ]),
  ) as T;
}

export function decryptBiometricTemplates<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => decryptBiometricTemplates(item)) as T;
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "face_descriptor" ? decryptFaceDescriptor(item) : decryptBiometricTemplates(item),
    ]),
  ) as T;
}
