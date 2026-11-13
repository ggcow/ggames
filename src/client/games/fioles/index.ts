// Jeu Fioles branché sur la plateforme : catalogue (campagne + niveaux des joueurs), écrans de jeu,
// de replay et de création.

import { campaignKey, customKey, fioles, parseFiolesKey, startBoard } from '../../../shared/games/fioles/definition.ts';
import { parseBoard } from '../../../shared/games/fioles/rules.ts';
import { h } from '../../platform/dom.ts';
import type { Lang } from '../../platform/i18n.ts';
import type { CatalogEntry, CatalogGroup, ClientGame, GameView } from '../client-game.ts';
import { renderMiniBoard } from './board.ts';
import { mountFiolesEditor } from './editor.ts';
import { mountFiolesPlay } from './play.ts';
import { mountFiolesReplay } from './replay.ts';
import { FIOLES_STRINGS } from './strings.ts';

const formatMoves = (value: number, lang: Lang) => FIOLES_STRINGS[lang].moves(value);

/** Meilleur score du joueur sur une clé, ou undefined s'il ne l'a jamais gagnée. */
const myBest = (view: GameView, key: string) => view.state.records[key]?.find((r) => r.player === view.me)?.value;

/** Plus haut niveau de campagne gagné par le joueur (0 si aucun). */
export function highestCampaignLevel(view: GameView): number {
  let highest = 0;
  for (const [key, records] of Object.entries(view.state.records)) {
    const target = parseFiolesKey(key);
    if (target?.kind === 'campaign' && records.some((r) => r.player === view.me)) {
      highest = Math.max(highest, target.level);
    }
  }
  return highest;
}

function entryDetail(view: GameView, key: string): { detail: string; done: boolean } {
  const strings = FIOLES_STRINGS[view.lang];
  const best = myBest(view, key);
  return best === undefined
    ? { detail: strings.toPlay, done: false }
    : { detail: strings.yourBest(formatMoves(best, view.lang)), done: true };
}

export const fiolesClient: ClientGame = {
  definition: fioles,
  name: { fr: FIOLES_STRINGS.fr.name, zh: FIOLES_STRINGS.zh.name },
  tagline: { fr: FIOLES_STRINGS.fr.tagline, zh: FIOLES_STRINGS.zh.tagline },
  icon: '🧪',

  keyLabel(key, lang, view) {
    const strings = FIOLES_STRINGS[lang];
    const target = parseFiolesKey(key);
    if (!target) return key;
    if (target.kind === 'campaign') return strings.level(target.level);
    const content = view?.state.contents.find((c) => c.id === target.contentId);
    return content ? content.title || strings.untitled : strings.customLevel;
  },

  formatValue: formatMoves,

  catalog(view): CatalogGroup[] {
    const strings = FIOLES_STRINGS[view.lang];
    const unlocked = highestCampaignLevel(view) + 1;
    const campaign: CatalogEntry[] = Array.from({ length: unlocked }, (_, i) => {
      const key = campaignKey(i + 1);
      const { detail, done } = entryDetail(view, key);
      return { key, label: strings.level(i + 1), detail, status: done ? 'done' : 'open' };
    });
    const custom: CatalogEntry[] = view.state.contents.map((content) => {
      const key = customKey(content.id);
      const { detail, done } = entryDetail(view, key);
      return {
        key,
        label: content.title || strings.untitled,
        detail: `${strings.by(view.playerName(content.author))} · ${detail}`,
        status: done ? 'done' : 'open',
      };
    });
    return [
      { title: strings.campaign, entries: campaign.reverse() },
      ...(custom.length > 0 ? [{ title: strings.custom, entries: custom, contents: true }] : []),
    ];
  },

  nextKey(key) {
    const target = parseFiolesKey(key);
    return target?.kind === 'campaign' ? campaignKey(target.level + 1) : null;
  },

  renderLiveState(state) {
    const board = parseBoard(state);
    return board ? renderMiniBoard(board) : null;
  },

  mountPlay(host, ctx) {
    const start = startBoard(ctx.key, ctx.content?.data ?? null);
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
    const start = startBoard(ctx.key, ctx.content?.data ?? null);
    if (!start) return () => undefined;
    return mountFiolesReplay(host, start, ctx.replay, FIOLES_STRINGS[ctx.lang]);
  },

  mountCreator: mountFiolesEditor,
};
