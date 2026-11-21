// Jeu Parking branché sur la plateforme : campagne de niveaux, écrans de jeu et de replay.

import { parking, startBoard } from '../../../shared/games/parking/definition.ts';
import { parseBoard } from '../../../shared/games/parking/rules.ts';
import { RACE_SIZE } from '../../platform/context.ts';
import { h } from '../../platform/dom.ts';
import { campaignMethods } from '../campaign.ts';
import type { ClientGame } from '../client-game.ts';
import { renderMiniParking } from './board.ts';
import { mountParkingPlay } from './play.ts';
import { mountParkingReplay } from './replay.ts';
import { parkingStatus } from './status.ts';
import { PARKING_STRINGS } from './strings.ts';

export const parkingClient: ClientGame = {
  definition: parking,
  name: { fr: PARKING_STRINGS.fr.name, zh: PARKING_STRINGS.zh.name },
  tagline: { fr: PARKING_STRINGS.fr.tagline, zh: PARKING_STRINGS.zh.tagline },
  icon: { kind: 'emoji', emoji: '🚗' },
  ...campaignMethods(
    (level, lang) => PARKING_STRINGS[lang].level(level),
    (value, lang) => PARKING_STRINGS[lang].moves(value),
    parking,
  ),

  raceSize: RACE_SIZE,

  renderLiveState(state) {
    const board = parseBoard(state);
    return board ? renderMiniParking(board) : null;
  },

  liveStatus(state, value) {
    const board = parseBoard(state);
    return board ? parkingStatus(board, value) : null;
  },

  mountPlay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) {
      host.replaceChildren(h('p', { class: 'muted center' }, '?'));
      return () => undefined;
    }
    return mountParkingPlay(host, {
      start,
      strings: PARKING_STRINGS[ctx.lang],
      onProgress: ctx.progress,
      onWin: (replay) => ctx.finish({ status: 'won', replay }),
    });
  },

  mountReplay(host, ctx) {
    const start = startBoard(ctx.key);
    if (!start) return () => undefined;
    return mountParkingReplay(host, start, ctx.replay, PARKING_STRINGS[ctx.lang]);
  },
};
