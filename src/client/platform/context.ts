import type {
  Account,
  GameId,
  GameState,
  PlayerId,
  Presence,
  RaceVoice,
  RaceVoiceRead,
  ReactionNotice,
} from '../../shared/platform/protocol.ts';
import type { GameView } from '../games/client-game.ts';
import type { ApiClient } from './api.ts';
import type { ChatStore } from './chat.ts';
import type { Lang } from './i18n.ts';
import type { LiveClient } from './live.ts';
import type { Route } from './router.ts';
import type { PlatformStrings } from './strings.ts';

/** Services et état partagés, fournis à chaque écran. */
export interface AppContext {
  readonly api: ApiClient;
  readonly live: LiveClient;
  readonly chat: ChatStore;
  readonly lang: Lang;
  readonly t: PlatformStrings;
  readonly me: Account;
  navigate(route: Route): void;
  setLang(lang: Lang): void;
  setMe(me: Account): void;
  logout(): Promise<void>;
}

/** Écran monté ; `onChange` est appelé quand des données du jeu affiché ont changé sur le serveur. */
export interface ScreenHandle {
  dispose?(): void;
  onDataChanged?(): void;
  onPresenceChanged?(): void;
  onReaction?(reaction: ReactionNotice): void;
  onRaceVoice?(note: RaceVoice): void;
  onRaceVoiceRead?(read: RaceVoiceRead): void;
}

/** Clés qu'un joueur a gagnées au moins une fois. */
export function wonKeys(state: GameState, player: PlayerId): Set<string> {
  return new Set(
    Object.entries(state.records)
      .filter(([, records]) => records.some((r) => r.player === player))
      .map(([key]) => key),
  );
}

/**
 * Joueurs au plus dans une course, soi compris : sur un écran de téléphone, on n'a la place que pour son
 * plateau et deux aperçus.
 */
export const RACE_SIZE = 3;

/** Autres joueurs en direct sur la même clé, dans l'ordre de la présence. */
export function rivalsOn(presence: readonly Presence[], me: PlayerId, game: GameId, key: string): Presence[] {
  return presence.filter((p) => p.player !== me && p.game === game && p.key === key);
}

/** Une course rejointe a encore de la place pour soi. */
export const canJoinRace = (liveCount: number): boolean => liveCount > 0 && liveCount < RACE_SIZE;

export function createGameView(state: GameState, me: PlayerId, lang: Lang): GameView {
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  return { state, me, lang, playerName: (id) => names.get(id) ?? '?' };
}
