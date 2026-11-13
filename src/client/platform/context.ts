import type { GameState, PlayerId, PlayerInfo } from '../../shared/platform/protocol.ts';
import type { GameView } from '../games/client-game.ts';
import type { ApiClient } from './api.ts';
import type { Lang } from './i18n.ts';
import type { LiveClient } from './live.ts';
import type { Route } from './router.ts';
import type { PlatformStrings } from './strings.ts';

/** Services et état partagés, fournis à chaque écran. */
export interface AppContext {
  readonly api: ApiClient;
  readonly live: LiveClient;
  readonly lang: Lang;
  readonly t: PlatformStrings;
  readonly me: PlayerInfo;
  navigate(route: Route): void;
  setLang(lang: Lang): void;
  setMe(me: PlayerInfo): void;
  logout(): Promise<void>;
}

/** Écran monté ; `onChange` est appelé quand des données du jeu affiché ont changé sur le serveur. */
export interface ScreenHandle {
  dispose?(): void;
  onDataChanged?(): void;
  onPresenceChanged?(): void;
}

export function createGameView(state: GameState, me: PlayerId, lang: Lang): GameView {
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  return { state, me, lang, playerName: (id) => names.get(id) ?? '?' };
}
