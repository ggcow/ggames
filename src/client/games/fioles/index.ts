// Jeu Fioles branché sur la plateforme : catalogue de la campagne, écrans de jeu et de replay.

import { campaignKey, fioles, parseCampaignKey, startBoard } from '../../../shared/games/fioles/definition.ts';
import { parseBoard } from '../../../shared/games/fioles/rules.ts';
import { h } from '../../platform/dom.ts';
import type { Lang } from '../../platform/i18n.ts';
import type { CatalogEntry, CatalogGroup, ClientGame, GameView } from '../client-game.ts';
import { renderMiniBoard } from './board.ts';
import { mountFiolesPlay } from './play.ts';
import { mountFiolesReplay } from './replay.ts';
import { FIOLES_STRINGS } from './strings.ts';

const formatMoves = (value: number, lang: Lang) => FIOLES_STRINGS[lang].moves(value);

/** Meilleur score du joueur sur une clé, ou undefined s'il ne l'a jamais gagnée. */
const myBest = (view: GameView, key: string) => view.state.records[key]?.find((r) => r.player === view.me)?.value;

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

  formatValue: formatMoves,

  catalog(view): CatalogGroup[] {
    const strings = FIOLES_STRINGS[view.lang];
    const unlocked = highestLevel(view) + 1;
    const entries: CatalogEntry[] = Array.from({ length: unlocked }, (_, i) => {
      const key = campaignKey(i + 1);
      const best = myBest(view, key);
      return best === undefined
        ? { key, label: strings.level(i + 1), detail: strings.toPlay, status: 'open' }
        : { key, label: strings.level(i + 1), detail: strings.yourBest(formatMoves(best, view.lang)), status: 'done' };
    });
    return [{ title: strings.campaign, entries: entries.reverse() }];
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
    return mountFiolesReplay(host, start, ctx.replay, FIOLES_STRINGS[ctx.lang]);
  },
};
