// Affichage d'une campagne de niveaux côté client : progression des joueurs, cases de la grille,
// niveau suivant. Commun aux jeux dont les clés suivent `shared/games/campaign.ts`.

import {
  campaignFrontier,
  campaignIsUnlocked,
  campaignKey,
  MAX_LEVEL,
  parseCampaignKey,
} from '../../shared/games/campaign.ts';
import type { PlayerId } from '../../shared/platform/protocol.ts';
import { wonKeys } from '../platform/context.ts';
import type { Lang } from '../platform/i18n.ts';
import type { ClientGame, GameView, LevelProgress, LevelTile } from './client-game.ts';

export const campaignProgress = (view: GameView, player: PlayerId): LevelProgress => ({
  unlocked: campaignFrontier(wonKeys(view.state, player)),
  total: MAX_LEVEL,
});

/** Case d'un niveau : réussi (avec le meilleur score formaté), jouable, ou verrouillé. */
export function campaignTile(
  level: number,
  view: GameView,
  formatValue: ((value: number, lang: Lang) => string) | null,
): LevelTile {
  const key = campaignKey(level);
  const best = view.state.records[key]?.find((r) => r.player === view.me)?.value;
  const unlocked = campaignIsUnlocked(key, wonKeys(view.state, view.me));
  const status = best !== undefined ? 'done' : unlocked ? 'open' : 'locked';
  return {
    key,
    label: String(level),
    status,
    best: best !== undefined && formatValue ? formatValue(best, view.lang) : null,
  };
}

/** Les méthodes de `ClientGame` liées à la campagne, à partir du libellé d'un niveau et du format des scores. */
export function campaignMethods(
  levelLabel: (level: number, lang: Lang) => string,
  formatValue: ((value: number, lang: Lang) => string) | null,
): Pick<ClientGame, 'keyLabel' | 'formatValue' | 'levelProgress' | 'levelOf' | 'levelTile' | 'nextKey'> {
  return {
    keyLabel(key, lang) {
      const level = parseCampaignKey(key);
      return level === null ? key : levelLabel(level, lang);
    },
    formatValue,
    levelProgress: campaignProgress,
    levelOf: parseCampaignKey,
    levelTile: (level, view) => campaignTile(level, view, formatValue),
    nextKey(key) {
      const level = parseCampaignKey(key);
      return level === null || level >= MAX_LEVEL ? null : campaignKey(level + 1);
    },
  };
}
