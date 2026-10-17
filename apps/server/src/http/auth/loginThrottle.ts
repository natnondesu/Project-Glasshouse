export const MAX_FAILURES = 5;
/** Across all emails from one address: stops password spraying. */
export const MAX_FAILURES_PER_IP = 20;
export const WINDOW_MS = 15 * 60 * 1000;

/** In memory: the server is a single instance, and a restart forgetting failures is acceptable. */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length === 0) this.failures.delete(key);
    else this.failures.set(key, list);
    return list;
  }
  blocked(key: string, limit: number = MAX_FAILURES): boolean {
    return this.recent(key).length >= limit;
  }
  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }
  clear(key: string): void {
    this.failures.delete(key);
  }
}
