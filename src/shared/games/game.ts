// Interface qu'un jeu fournit à la plateforme. Le serveur l'utilise pour valider les clés et rejouer
// les parties, sans rien connaître des règles du jeu.

import type { GameId } from '../platform/protocol.ts';

/** Résultat d'un replay rejoué par le serveur. */
export interface ReplayOutcome {
  finished: boolean;
  /** Score calculé à partir du replay. */
  value: number;
}

export type ScoreOrder = 'asc' | 'desc';

/** Vrai si le score `value` vaut au moins `than` (égalité comprise) dans l'ordre `order`. */
export const isAtLeastAsGood = (value: number, than: number, order: ScoreOrder): boolean =>
  order === 'asc' ? value <= than : value >= than;

export interface GameDefinition {
  readonly id: GameId;
  /** `asc` : le plus petit score gagne (ex. nombre de coups). `desc` : le plus grand gagne. */
  readonly scoreOrder: ScoreOrder;
  /** Vrai si `key` désigne un niveau ou un mode existant. */
  isValidKey(key: string): boolean;
  /** Ordre d'affichage de deux clés (négatif si `a` vient avant `b`), stable d'un appel à l'autre. */
  compareKeys(a: string, b: string): number;
  /** Vrai si un joueur ayant gagné les clés `won` a débloqué `key` par sa propre progression. */
  isUnlocked(key: string, won: ReadonlySet<string>): boolean;
  /** Rejoue une partie. `null` si le replay est invalide (action impossible, format incorrect). */
  replay(key: string, replay: string): ReplayOutcome | null;
  /** Meilleur score possible sur une clé, prouvé par une recherche exhaustive ; `null` s'il n'est pas connu. */
  bestPossible(key: string): number | null;
}
