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

/** Case d'un niveau : réussi, jouable ou verrouillé, et les joueurs qui y ont le meilleur score possible. */
export function campaignTile(level: number, view: GameView, bestPossible: (key: string) => number | null): LevelTile {
  const key = campaignKey(level);
  const records = view.state.records[key] ?? [];
  const won = records.some((record) => record.player === view.me);
  const unlocked = campaignIsUnlocked(key, wonKeys(view.state, view.me));
  const possible = bestPossible(key);
  const perfectHolders = records
    .filter((record) => record.value === possible)
    .map((record) => ({ player: record.player, name: view.playerName(record.player) }));
  return {
    key,
    label: String(level),
    status: won ? 'done' : unlocked ? 'open' : 'locked',
    perfect: perfectHolders.some((holder) => holder.player === view.me),
    perfectHolders,
  };
}

/**
 * Les méthodes de `ClientGame` liées à la campagne, à partir du libellé d'un niveau, du format des scores et du
 * meilleur score possible de chaque clé (`GameDefinition.bestPossible`).
 */
export function campaignMethods(
  levelLabel: (level: number, lang: Lang) => string,
  formatValue: ((value: number, lang: Lang) => string) | null,
  bestPossible: (key: string) => number | null,
): Pick<ClientGame, 'keyLabel' | 'formatValue' | 'levelProgress' | 'levelOf' | 'levelTile' | 'nextKey'> {
  return {
    keyLabel(key, lang) {
      const level = parseCampaignKey(key);
      return level === null ? key : levelLabel(level, lang);
    },
    formatValue,
    levelProgress: campaignProgress,
    levelOf: parseCampaignKey,
    levelTile: (level, view) => campaignTile(level, view, bestPossible),
    nextKey(key) {
      const level = parseCampaignKey(key);
      return level === null || level >= MAX_LEVEL ? null : campaignKey(level + 1);
    },
  };
}
