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

/**
 * `done` : gagné au moins une fois. `open` : jouable. `locked` : prérequis pas encore gagné. Un niveau bloqué après
 * une défaite garde son statut : la plateforme l'affiche bloqué d'après `GameState.lockedUntil`.
 */
export type LevelStatus = 'locked' | 'open' | 'done';

/** Situation d'une partie en cours, pour l'indicateur compact d'un aperçu. */
export type LiveStatus = 'start' | 'far' | 'close' | 'stuck';

/** Détenteur du record d'un niveau, pour la case de la grille. */
export interface LevelHolder {
  player: PlayerId;
  name: string;
}

/** Case d'un niveau dans la grille. */
export interface LevelTile {
  key: string;
  /** Texte court affiché dans la case, ex. « 12 ». */
  label: string;
  status: LevelStatus;
  /** Vrai si le joueur a réussi le niveau avec le meilleur score possible. */
  perfect: boolean;
  /** Détenteurs du record du niveau, ex æquo compris, dans l'ordre où ils l'ont atteint ; vide sans victoire. */
  holders: readonly LevelHolder[];
  /** Vrai si le record du niveau vaut le meilleur score possible. */
  recordPerfect: boolean;
}

/** Avancement d'un joueur dans les niveaux d'un jeu. */
export interface LevelProgress {
  /** Niveau où en est le joueur : le premier qu'il n'a pas gagné (1 = premier niveau). */
  current: number;
  /** Numéro du plus haut niveau jouable : `current`, ou plus loin (niveau déjà gagné, jeu qui ouvre les suivants). */
  unlocked: number;
  /** Nombre total de niveaux. */
  total: number;
}

export interface PlayContext {
  key: string;
  lang: Lang;
  /** À appeler au montage puis après chaque action. `state` est diffusé aux autres joueurs connectés. */
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

/** Icône d'un jeu : un emoji, ou une image servie par le site (chemin absolu, ex. `/games/x/icon.webp`). */
export type GameIcon = { kind: 'emoji'; emoji: string } | { kind: 'image'; src: string };

export interface ClientGame {
  readonly definition: GameDefinition;
  readonly name: Localized<string>;
  readonly tagline: Localized<string>;
  readonly icon: GameIcon;
  /** Nom lisible d'une clé, ex. « Niveau 12 ». */
  keyLabel(key: string, lang: Lang): string;
  /**
   * Score lisible, ex. « 12 points ». `null` : le jeu n'affiche pas de score (pas de classement par score,
   * seule la réussite compte).
   */
  readonly formatValue: ((value: number, lang: Lang) => string) | null;
  /** Avancement d'un joueur : dimensionne la grille et situe chaque joueur dessus (`current`). */
  levelProgress(view: GameView, player: PlayerId): LevelProgress;
  /** Numéro du niveau désigné par une clé, ou null si la clé n'est pas un niveau. */
  levelOf(key: string): number | null;
  /** Case du niveau `level` (1 = premier niveau) pour ce joueur. */
  levelTile(level: number, view: GameView): LevelTile;
  /** Clé proposée après une victoire sur `key`, ou null. */
  nextKey(key: string, view: GameView): string | null;
  /**
   * Joueurs au plus dans une course sur un même niveau, soi compris. L'écran de partie montre un aperçu par
   * autre joueur, côte à côte : la taille des aperçus du jeu la limite.
   */
  readonly raceSize: number;
  /** Aperçu de l'état diffusé par un joueur en train de jouer. */
  renderLiveState(state: string): HTMLElement | null;
  /** Indication courte à côté du nom sur l'aperçu (score, vies…), ou null. */
  liveTag(state: string, value: number, lang: Lang): string | null;
  /** Situation de la partie en cours, ou null si l'état est illisible. */
  liveStatus(state: string, value: number): LiveStatus | null;
  mountPlay(host: HTMLElement, ctx: PlayContext): Unmount;
  mountReplay(host: HTMLElement, ctx: ReplayContext): Unmount;
}
