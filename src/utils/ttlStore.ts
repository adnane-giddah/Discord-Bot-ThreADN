import { randomBytes } from "node:crypto";

/** Generic in-memory token -> value store with expiry. Used for short-lived interaction state. */
export class TtlStore<T> {
  private store = new Map<string, { value: T; createdAt: number }>();

  constructor(private readonly ttlMs: number) {}

  create(value: T): string {
    const token = randomBytes(8).toString("hex");
    this.store.set(token, { value, createdAt: Date.now() });
    return token;
  }

  get(token: string): T | undefined {
    const entry = this.store.get(token);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(token);
      return undefined;
    }
    return entry.value;
  }

  delete(token: string): void {
    this.store.delete(token);
  }
}
