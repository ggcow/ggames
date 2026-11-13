// Interface qu'un jeu fournit à la plateforme. Le serveur l'utilise pour valider les clés,
// les contenus et rejouer les parties, sans rien connaître des règles du jeu.

import type { ContentId, GameId } from '../platform/protocol.ts';

/** Ce que désigne une clé de partie. */
export type KeyTarget = { kind: 'builtin' } | { kind: 'content'; contentId: ContentId };

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
  /** Valide une clé de partie. `null` si invalide. */
  parseKey(key: string): KeyTarget | null;
  /** Clé des parties jouées sur un contenu créé par un joueur. */
  contentKey(id: ContentId): string;
  /** Valide les données d'un contenu créé par un joueur. */
  isValidContent(data: string): boolean;
  /**
   * Rejoue une partie. `content` : données du contenu si la clé désigne un contenu, sinon null.
   * `null` si le replay est invalide (action impossible, format incorrect).
   */
  replay(key: string, content: string | null, replay: string): ReplayOutcome | null;
}
