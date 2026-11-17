// Jeu Bouquets branché sur la plateforme : campagne de niveaux, écrans de jeu et de replay.

import { bouquets, startBoard } from '../../../shared/games/bouquets/definition.ts';
import { parseLiveState } from '../../../shared/games/bouquets/rules.ts';
import { h } from '../../platform/dom.ts';
import { campaignMethods } from '../campaign.ts';
import type { ClientGame } from '../client-game.ts';
import { ICON } from './art.ts';
import { livePots, renderMiniBoard } from './board.ts';
import { mountBouquetsPlay } from './play.ts';
import { mountBouquetsReplay } from './replay.ts';
import { potsStatus } from './status.ts';
import { BOUQUETS_STRINGS } from './strings.ts';

export const bouquetsClient: ClientGame = {
  definition: bouquets,
  name: { fr: BOUQUETS_STRINGS.fr.name, zh: BOUQUETS_STRINGS.zh.name },
  tagline: { fr: BOUQUETS_STRINGS.fr.tagline, zh: BOUQUETS_STRINGS.zh.tagline },
  icon: { kind: 'image', src: ICON },
  ...campaignMethods(
    (level, lang) => BOUQUETS_STRINGS[lang].level(level),
    (value, lang) => BOUQUETS_STRINGS[lang].moves(value),
    bouquets.bestPossible,
  ),

  renderLiveState(state) {
    const pots = parseLiveState(state);
    return pots ? renderMiniBoard(livePots(pots)) : null;
  },

  liveStatus(state, value) {
    const pots = parseLiveState(state);
    return pots ? potsStatus(pots, value) : null;
  },

  mountPlay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) {
      host.replaceChildren(h('p', { class: 'muted center' }, '?'));
      return () => undefined;
    }
    return mountBouquetsPlay(host, {
      start,
      strings: BOUQUETS_STRINGS[ctx.lang],
      onProgress: ctx.progress,
      onWin: (replay) => ctx.finish({ status: 'won', replay }),
    });
  },

  mountReplay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) return () => undefined;
    return mountBouquetsReplay(host, start, ctx.replay, BOUQUETS_STRINGS[ctx.lang]);
  },
};
