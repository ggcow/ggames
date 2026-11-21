// Jeu Couteaux branché sur la plateforme : campagne de niveaux, écrans de jeu et de replay.

import { parseCampaignKey } from '../../../shared/games/campaign.ts';
import { couteaux, levelOf, startLevel } from '../../../shared/games/couteaux/definition.ts';
import { LEVEL_COUNT, LIVES, parseLiveState } from '../../../shared/games/couteaux/rules.ts';
import { RACE_SIZE } from '../../platform/context.ts';
import { h } from '../../platform/dom.ts';
import { campaignMethods } from '../campaign.ts';
import type { ClientGame } from '../client-game.ts';
import { livesText } from '../puzzle-frame.ts';
import { renderMiniTarget } from './board.ts';
import { mountCouteauxPlay } from './play.ts';
import { mountCouteauxReplay } from './replay.ts';
import { couteauxStatus } from './status.ts';
import { COUTEAUX_STRINGS } from './strings.ts';

export const couteauxClient: ClientGame = {
  definition: couteaux,
  name: { fr: COUTEAUX_STRINGS.fr.name, zh: COUTEAUX_STRINGS.zh.name },
  tagline: { fr: COUTEAUX_STRINGS.fr.tagline, zh: COUTEAUX_STRINGS.zh.tagline },
  icon: { kind: 'emoji', emoji: '🔪' },
  ...campaignMethods(
    (level, lang) => COUTEAUX_STRINGS[lang].level(level),
    (value, lang) => COUTEAUX_STRINGS[lang].misses(value),
    couteaux,
    LEVEL_COUNT,
  ),

  raceSize: RACE_SIZE,

  renderLiveState(state) {
    const live = parseLiveState(state);
    const level = live ? levelOf(live.level) : null;
    return live && level ? renderMiniTarget(level, live.planted) : null;
  },

  // Les vies de l'autre joueur plutôt que son score : on voit d'un coup d'œil s'il est en danger.
  liveTag(state) {
    const live = parseLiveState(state);
    return live ? livesText(live.misses, LIVES) : null;
  },

  liveStatus(state, value) {
    const live = parseLiveState(state);
    const level = live ? levelOf(live.level) : null;
    return live && level ? couteauxStatus(level, live, value) : null;
  },

  mountPlay(host, ctx) {
    const level = startLevel(ctx.key);
    const number = parseCampaignKey(ctx.key, LEVEL_COUNT);
    if (!level || number === null) {
      host.replaceChildren(h('p', { class: 'muted center' }, '?'));
      return () => undefined;
    }
    return mountCouteauxPlay(host, {
      level,
      number,
      strings: COUTEAUX_STRINGS[ctx.lang],
      onProgress: ctx.progress,
      onWin: (replay) => ctx.finish({ status: 'won', replay }),
      onLose: (replay) => ctx.finish({ status: 'lost', replay }),
    });
  },

  mountReplay(host, ctx) {
    const level = startLevel(ctx.key);
    if (!level) return () => undefined;
    return mountCouteauxReplay(host, level, ctx.replay);
  },
};
