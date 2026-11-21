import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt from node:crypto: no native dependency, safe defaults (N=16384, r=8, p=1).
// Stored format: "scrypt$<salt base64>$<key base64>".

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, length = KEY_LENGTH): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, key] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Hash of a random password: lets login spend the same time whether or not the email exists. */
export const DUMMY_PASSWORD_HASH = await hashPassword(randomBytes(16).toString("hex"));
