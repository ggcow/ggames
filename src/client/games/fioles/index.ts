// Jeu Fioles branché sur la plateforme : campagne de niveaux, écrans de jeu et de replay.

import { fioles, startBoard } from '../../../shared/games/fioles/definition.ts';
import { parseBoard } from '../../../shared/games/fioles/rules.ts';
import { h } from '../../platform/dom.ts';
import { campaignMethods } from '../campaign.ts';
import type { ClientGame } from '../client-game.ts';
import { renderMiniBoard } from './board.ts';
import { mountFiolesPlay } from './play.ts';
import { mountFiolesReplay } from './replay.ts';
import { boardStatus } from './status.ts';
import { FIOLES_STRINGS } from './strings.ts';

export const fiolesClient: ClientGame = {
  definition: fioles,
  name: { fr: FIOLES_STRINGS.fr.name, zh: FIOLES_STRINGS.zh.name },
  tagline: { fr: FIOLES_STRINGS.fr.tagline, zh: FIOLES_STRINGS.zh.tagline },
  icon: { kind: 'emoji', emoji: '🧪' },
  ...campaignMethods(
    (level, lang) => FIOLES_STRINGS[lang].level(level),
    (value, lang) => FIOLES_STRINGS[lang].moves(value),
  ),

  renderLiveState(state) {
    const board = parseBoard(state);
    return board ? renderMiniBoard(board) : null;
  },

  liveStatus(state, value) {
    const board = parseBoard(state);
    return board ? boardStatus(board, value) : null;
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
