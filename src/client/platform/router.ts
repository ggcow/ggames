// Routes de l'application, encodées dans le hash de l'URL (#/...). Fonctions pures : testées.

import type { GameId, PlayerId, RunId } from '../../shared/platform/protocol.ts';

/** Routes propres à un jeu. */
export type GameRoute =
  | { name: 'game'; game: GameId }
  | { name: 'player'; game: GameId; player: PlayerId }
  | { name: 'play'; game: GameId; key: string };

export type Route =
  | { name: 'login' }
  | { name: 'hub' }
  | { name: 'chat'; game?: GameId }
  | { name: 'run'; run: RunId }
  | GameRoute;

const SEGMENT = /^[a-z0-9-]{1,40}$/;

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'login':
      return '#/login';
    case 'hub':
      return '#/';
    case 'chat':
      return route.game ? `#/chat/g/${route.game}` : '#/chat';
    case 'game':
      return `#/g/${route.game}`;
    case 'player':
      return `#/g/${route.game}/p/${route.player}`;
    case 'play':
      return `#/g/${route.game}/play/${encodeURIComponent(route.key)}`;
    case 'run':
      return `#/run/${route.run}`;
  }
}

/** Route décrite par un hash ; `null` si le hash ne correspond à aucune route. */
export function parseRoute(hash: string): Route | null {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, game, kind, value] = parts;
  if (parts.length === 0) return { name: 'hub' };
  if (first === 'login' && parts.length === 1) return { name: 'login' };
  if (first === 'chat') {
    if (parts.length === 1) return { name: 'chat' };
    const from = parts[2];
    if (parts.length === 3 && parts[1] === 'g' && from && SEGMENT.test(from)) return { name: 'chat', game: from };
    return null;
  }
  if (first === 'run' && game && SEGMENT.test(game) && parts.length === 2) return { name: 'run', run: game };
  if (first !== 'g' || !game || !SEGMENT.test(game)) return null;
  if (parts.length === 2) return { name: 'game', game };
  if (kind === 'p' && value && SEGMENT.test(value) && parts.length === 4)
    return { name: 'player', game, player: value };
  if (kind === 'play' && value && parts.length === 4) {
    try {
      return { name: 'play', game, key: decodeURIComponent(value) };
    } catch {
      return null;
    }
  }
  return null;
}
