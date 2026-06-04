interface ThrottleEntry {
  failures: number;
  retryAfterMs: number;
  blockedUntil: number;
}

export interface AuthThrottleDecision {
  allowed: boolean;
  retryAfterMs?: number;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export class AuthAttemptThrottler {
  private readonly entries = new Map<string, ThrottleEntry>();

  check(key: string, now = Date.now()): AuthThrottleDecision {
    const entry = this.entries.get(key);
    if (!entry || entry.blockedUntil <= now) {
      return { allowed: true };
    }
    return { allowed: false, retryAfterMs: Math.max(1, entry.blockedUntil - now) };
  }

  recordFailure(key: string, now = Date.now()): AuthThrottleDecision {
    const current = this.entries.get(key);
    const failures = (current?.failures ?? 0) + 1;
    const retryAfterMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1));
    this.entries.set(key, {
      failures,
      retryAfterMs,
      blockedUntil: now + retryAfterMs,
    });
    return { allowed: false, retryAfterMs };
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }
}
