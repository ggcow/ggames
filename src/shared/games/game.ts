// Interface qu'un jeu fournit à la plateforme. Le serveur l'utilise pour valider les clés et rejouer
// les parties, sans rien connaître des règles du jeu.

import type { GameId } from '../platform/protocol.ts';

/** Résultat d'un replay rejoué par le serveur. */
export interface ReplayOutcome {
  finished: boolean;
  /** Score calculé à partir du replay. */
  value: number;
}

export interface GameDefinition {
  readonly id: GameId;
  /** `asc` : le plus petit score gagne (ex. nombre de coups). `desc` : le plus grand gagne. */
  readonly scoreOrder: 'asc' | 'desc';
  /** Vrai si `key` désigne un niveau ou un mode existant. */
  isValidKey(key: string): boolean;
  /** Rejoue une partie. `null` si le replay est invalide (action impossible, format incorrect). */
  replay(key: string, replay: string): ReplayOutcome | null;
}
