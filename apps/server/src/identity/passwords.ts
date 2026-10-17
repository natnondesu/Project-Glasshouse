import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
const N = 32768;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** scrypt needs ~128·N·r bytes; Node's 32 MB default is exactly that, so give it headroom. */
const maxmemFor = (n: number, r: number): number => 2 * 128 * n * r;

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCallback(password, salt, keylen, options, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: maxmemFor(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyText, 'base64url');
  const nn = Number(n);
  const rr = Number(r);
  const key = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N: nn, r: rr, p: Number(p), maxmem: maxmemFor(nn, rr) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** 16 URL-safe characters; shown once to the admin, changed by the user at first sign-in. */
export const temporaryPassword = (): string => randomBytes(12).toString('base64url');
