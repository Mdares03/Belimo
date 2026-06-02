import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed token proving the user re-entered their login password.
// Required by the actuation command route so a logged-in session alone cannot
// toggle a physical valve — the password gate must be passed first.

const TTL_MS = 5 * 60 * 1000; // 5 minutes
// NextAuth v5 uses AUTH_SECRET; fall back to NEXTAUTH_SECRET for older setups.
const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

function sign(payload: string) {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function signActuationToken(userId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const token = `${expiresAt}.${sign(payload)}`;
  return { token, expiresAt };
}

// Belimo device IDs permitted for actuation. Hard backstop so an accidental
// fleet-wide command is impossible during development. Widen via env only.
export function actuationAllowlist(): Set<string> {
  const set = new Set<string>();
  const dummy = process.env.BELIMO_DUMMY_DEVICE_ID?.trim();
  if (dummy) set.add(dummy);
  for (const item of (process.env.BELIMO_ACTUATION_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    set.add(item);
  }
  return set;
}

export function verifyActuationToken(token: string | null | undefined, userId: string): boolean {
  if (!token || !SECRET) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expiresAt = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = sign(`${userId}.${expiresAt}`);
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
}
