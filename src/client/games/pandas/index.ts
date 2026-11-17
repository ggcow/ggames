// Jeu Pandas branché sur la plateforme : campagne de niveaux, écrans de jeu et de replay.

import { pandas, startGrid } from '../../../shared/games/pandas/definition.ts';
import { parseLiveState } from '../../../shared/games/pandas/rules.ts';
import { h } from '../../platform/dom.ts';
import { campaignMethods } from '../campaign.ts';
import type { ClientGame } from '../client-game.ts';
import { renderMiniGrid } from './board.ts';
import { mountPandasPlay } from './play.ts';
import { mountPandasReplay } from './replay.ts';
import { pandasStatus } from './status.ts';
import { PANDAS_STRINGS } from './strings.ts';

export const pandasClient: ClientGame = {
  definition: pandas,
  name: { fr: PANDAS_STRINGS.fr.name, zh: PANDAS_STRINGS.zh.name },
  tagline: { fr: PANDAS_STRINGS.fr.tagline, zh: PANDAS_STRINGS.zh.tagline },
  icon: { kind: 'emoji', emoji: '🐼' },
  ...campaignMethods(
    (level, lang) => PANDAS_STRINGS[lang].level(level),
    // Seule la réussite compte : ni score, ni classement par score, ni record.
    null,
    pandas.bestPossible,
  ),

  renderLiveState(state) {
    const live = parseLiveState(state);
    return live ? renderMiniGrid(live.grid, live.pandas) : null;
  },

  liveStatus(state, value) {
    const live = parseLiveState(state);
    return live ? pandasStatus(live.grid, live.pandas, value) : null;
  },

  mountPlay(host, ctx) {
    const grid = startGrid(ctx.key);
    if (!grid) {
      host.replaceChildren(h('p', { class: 'muted center' }, '?'));
      return () => undefined;
    }
    return mountPandasPlay(host, {
      grid,
      strings: PANDAS_STRINGS[ctx.lang],
      onProgress: ctx.progress,
      onWin: (replay) => ctx.finish({ status: 'won', replay }),
      onLose: (replay) => ctx.finish({ status: 'lost', replay }),
    });
  },

  mountReplay(host, ctx) {
    const grid = startGrid(ctx.key);
    if (!grid) return () => undefined;
    return mountPandasReplay(host, grid, ctx.replay);
  },
};
