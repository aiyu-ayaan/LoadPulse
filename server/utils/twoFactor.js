import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import speakeasy from "speakeasy";

const ALGORITHM = "aes-256-gcm";

const toKey = (secretSeed) => createHash("sha256").update(String(secretSeed)).digest();

export const encryptSecret = (plainText, secretSeed) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, toKey(secretSeed), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptSecret = (encoded, secretSeed) => {
  if (!encoded) {
    return "";
  }
  const [ivHex, tagHex, encryptedHex] = String(encoded).split(":");
  if (!ivHex || !tagHex || !encryptedHex) {
    return "";
  }

  const decipher = createDecipheriv(ALGORITHM, toKey(secretSeed), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
};

export const generateTwoFactorSecret = (username, issuer = "LoadPulse") =>
  speakeasy.generateSecret({
    name: `${issuer}:${username}`,
    issuer,
    length: 20,
  });

export const verifyTwoFactorCode = (secret, token) =>
  speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token ?? "").replace(/\s+/g, ""),
    window: 1,
  });

export const toQrCodeDataUrl = async (otpauthUrl) =>
  QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
  });
