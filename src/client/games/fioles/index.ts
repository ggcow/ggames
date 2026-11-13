// Jeu Fioles branché sur la plateforme : niveaux de la campagne, écrans de jeu et de replay.

import {
  campaignKey,
  fioles,
  MAX_LEVEL,
  parseCampaignKey,
  startBoard,
} from '../../../shared/games/fioles/definition.ts';
import { parseBoard } from '../../../shared/games/fioles/rules.ts';
import { h } from '../../platform/dom.ts';
import type { ClientGame, GameView, LevelTile } from '../client-game.ts';
import { renderMiniBoard } from './board.ts';
import { mountFiolesPlay } from './play.ts';
import { mountFiolesReplay } from './replay.ts';
import { FIOLES_STRINGS } from './strings.ts';

/** Le joueur a gagné la clé au moins une fois. */
const hasWon = (view: GameView, key: string) => (view.state.records[key] ?? []).some((r) => r.player === view.me);

/** Plus haut niveau gagné par le joueur (0 si aucun). */
export function highestLevel(view: GameView): number {
  let highest = 0;
  for (const [key, records] of Object.entries(view.state.records)) {
    const level = parseCampaignKey(key);
    if (level !== null && records.some((r) => r.player === view.me)) highest = Math.max(highest, level);
  }
  return highest;
}

export const fiolesClient: ClientGame = {
  definition: fioles,
  name: { fr: FIOLES_STRINGS.fr.name, zh: FIOLES_STRINGS.zh.name },
  tagline: { fr: FIOLES_STRINGS.fr.tagline, zh: FIOLES_STRINGS.zh.tagline },
  icon: '🧪',

  keyLabel(key, lang) {
    const level = parseCampaignKey(key);
    return level === null ? key : FIOLES_STRINGS[lang].level(level);
  },

  // Seule la réussite d'un niveau compte : pas de score affiché.
  formatValue: null,

  levelProgress(view) {
    return { unlocked: Math.min(highestLevel(view) + 1, MAX_LEVEL), total: MAX_LEVEL };
  },

  levelTile(level, view): LevelTile {
    const key = campaignKey(level);
    const required = fioles.prerequisite(key);
    const status = hasWon(view, key) ? 'done' : required === null || hasWon(view, required) ? 'open' : 'locked';
    return { key, label: String(level), status, best: null };
  },

  nextKey(key) {
    const level = parseCampaignKey(key);
    return level === null ? null : campaignKey(level + 1);
  },

  renderLiveState(state) {
    const board = parseBoard(state);
    return board ? renderMiniBoard(board) : null;
  },

  mountPlay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) {
      host.replaceChildren(h('p', { class: 'muted center' }, '?'));
      return () => undefined;
    }
    return mountFiolesPlay(host, {
      start,
      strings: FIOLES_STRINGS[ctx.lang],
      onProgress: ctx.progress,
      onWin: (replay) => ctx.finish({ status: 'won', replay }),
    });
  },

  mountReplay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) return () => undefined;
    return mountFiolesReplay(host, start, ctx.replay);
  },
};
