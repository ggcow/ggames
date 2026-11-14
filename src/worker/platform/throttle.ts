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

/** Limite les messages d'un joueur sur une fenêtre glissante, en mémoire du Durable Object. */
export class ChatThrottle {
  private readonly sent = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  allow(player: string, now: number): boolean {
    const recent = (this.sent.get(player) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.sent.set(player, recent);
      return false;
    }
    this.sent.set(player, [...recent, now]);
    return true;
  }
}

/** Laisse passer au plus une réaction par joueur et par intervalle, en mémoire du Durable Object. */
export class ReactionThrottle {
  private readonly last = new Map<string, number>();
  private readonly cooldownMs: number;

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs;
  }

  allow(player: string, now: number): boolean {
    const previous = this.last.get(player);
    if (previous !== undefined && now - previous < this.cooldownMs) return false;
    this.last.set(player, now);
    return true;
  }
}
