/**
 * Limite les échecs de connexion par nom de compte, en mémoire du Durable Object.
 * Freine la recherche de mot de passe par essais successifs.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  private readonly maxFailures: number;
  private readonly windowMs: number;

  constructor(maxFailures: number, windowMs: number) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  isBlocked(account: string, now: number): boolean {
    return this.recent(account, now).length >= this.maxFailures;
  }

  recordFailure(account: string, now: number): void {
    this.failures.set(account, [...this.recent(account, now), now]);
  }

  reset(account: string): void {
    this.failures.delete(account);
  }

  private recent(account: string, now: number): number[] {
    return (this.failures.get(account) ?? []).filter((at) => now - at < this.windowMs);
  }
}
