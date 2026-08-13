import crypto from "node:crypto";

export function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class ConfirmationStore {
  constructor({ ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  issue(action, actionFingerprint) {
    this.prune();
    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAtMs = this.now() + this.ttlMs;
    this.entries.set(token, { action, actionFingerprint, expiresAtMs });
    return { confirmationToken: token, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  consume(token, action, actionFingerprint) {
    this.prune();
    const entry = token ? this.entries.get(token) : undefined;
    if (!entry) throw new Error("A valid, unexpired confirmation token is required.");
    this.entries.delete(token);
    if (entry.action !== action || entry.actionFingerprint !== actionFingerprint) {
      throw new Error("The confirmation token does not match the current operation state.");
    }
  }

  prune() {
    const current = this.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAtMs <= current) this.entries.delete(token);
    }
  }
}
