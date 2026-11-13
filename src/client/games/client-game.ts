// Interface qu'un jeu implémente côté client pour se brancher sur la plateforme.
// La plateforme fournit comptes, navigation, classements, progression, replays et temps réel ;
// le jeu fournit son plateau, ses règles d'affichage et ses écrans de jeu et de replay.

import type { GameDefinition } from '../../shared/games/game.ts';
import type { GameState, PlayerId } from '../../shared/platform/protocol.ts';
import type { Lang, Localized } from '../platform/i18n.ts';

/** Données d'un jeu vues par un joueur, avec résolution des noms. */
export interface GameView {
  state: GameState;
  me: PlayerId;
  lang: Lang;
  playerName(id: PlayerId): string;
}

/** `done` : gagné au moins une fois. `open` : jouable. `locked` : prérequis pas encore gagné. */
export type LevelStatus = 'locked' | 'open' | 'done';

/** Case d'un niveau dans la grille. */
export interface LevelTile {
  key: string;
  /** Texte court affiché dans la case, ex. « 12 ». */
  label: string;
  status: LevelStatus;
  /** Meilleur score du joueur, déjà formaté, ou null s'il n'a pas gagné ce niveau. */
  best: string | null;
}

/** Avancement d'un joueur dans les niveaux d'un jeu. */
export interface LevelProgress {
  /** Numéro du plus haut niveau jouable (1 = premier niveau). */
  unlocked: number;
  /** Nombre total de niveaux. */
  total: number;
}

export interface PlayContext {
  key: string;
  lang: Lang;
  /** À appeler après chaque action du joueur. `state` est diffusé aux autres joueurs connectés. */
  progress(update: { state: string; value: number; replay: string }): void;
  /** Fin de partie. La plateforme enregistre la partie et affiche le résultat. */
  finish(result: { status: 'won' | 'lost'; replay: string }): void;
}

export interface ReplayContext {
  key: string;
  replay: string;
  lang: Lang;
}

/** Démonte un écran et libère ses ressources. */
export type Unmount = () => void;

export interface ClientGame {
  readonly definition: GameDefinition;
  readonly name: Localized<string>;
  readonly tagline: Localized<string>;
  readonly icon: string;
  /** Nom lisible d'une clé, ex. « Niveau 12 ». */
  keyLabel(key: string, lang: Lang): string;
  /** Score lisible, ex. « 12 coups ». */
  formatValue(value: number, lang: Lang): string;
  /** Avancement du joueur, pour dimensionner la grille. */
  levelProgress(view: GameView): LevelProgress;
  /** Case du niveau `level` (1 = premier niveau) pour ce joueur. */
  levelTile(level: number, view: GameView): LevelTile;
  /** Clé proposée après une victoire sur `key`, ou null. */
  nextKey(key: string, view: GameView): string | null;
  /** Aperçu de l'état diffusé par un joueur en train de jouer. */
  renderLiveState(state: string): HTMLElement | null;
  mountPlay(host: HTMLElement, ctx: PlayContext): Unmount;
  mountReplay(host: HTMLElement, ctx: ReplayContext): Unmount;
}
