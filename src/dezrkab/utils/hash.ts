// @ts-nocheck
/** هش سبک و نمکی برای رمزهای داخلی — هیچ رمز خامی در state یا storage نگه‌داری نمی‌شود */

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SALT = "pedal.internal.v1";

export function hashPassword(password: string): string {
  const a = fnv1a(SALT + "::" + password).toString(36);
  const b = fnv1a(password + "::" + SALT.split("").reverse().join("")).toString(36);
  return `${a}.${b}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
