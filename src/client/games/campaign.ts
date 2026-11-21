// Affichage d'une campagne de niveaux côté client : progression des joueurs, cases de la grille,
// niveau suivant. Commun aux jeux dont les clés suivent `shared/games/campaign.ts`.

import { campaignFrontier, campaignKey, MAX_LEVEL, parseCampaignKey } from '../../shared/games/campaign.ts';
import type { GameDefinition } from '../../shared/games/game.ts';
import type { PlayerId } from '../../shared/platform/protocol.ts';
import { wonKeys } from '../platform/context.ts';
import type { Lang } from '../platform/i18n.ts';
import type { ClientGame, GameView, LevelProgress, LevelTile } from './client-game.ts';

/**
 * Avancement d'un joueur : le premier niveau qu'il n'a pas gagné, et le plus haut niveau que le déblocage du jeu
 * (`GameDefinition.isUnlocked`) lui ouvre, au même niveau ou plus loin.
 */
export function campaignProgress(
  view: GameView,
  player: PlayerId,
  definition: GameDefinition,
  size = MAX_LEVEL,
): LevelProgress {
  const won = wonKeys(view.state, player);
  const current = campaignFrontier(won, size);
  let unlocked = current;
  while (unlocked < size && definition.isUnlocked(campaignKey(unlocked + 1), won)) unlocked++;
  return { current, unlocked, total: size };
}

/**
 * Case d'un niveau : réussi, jouable ou verrouillé, son record et ses détenteurs ex æquo. Un jeu sans score
 * (`scored` faux) n'a pas de record : la case ne nomme aucun détenteur.
 */
export function campaignTile(level: number, view: GameView, definition: GameDefinition, scored: boolean): LevelTile {
  const key = campaignKey(level);
  const records = view.state.records[key] ?? [];
  const mine = records.find((record) => record.player === view.me);
  const unlocked = definition.isUnlocked(key, wonKeys(view.state, view.me));
  const possible = definition.bestPossible(key);
  const record = records[0];
  return {
    key,
    label: String(level),
    status: mine ? 'done' : unlocked ? 'open' : 'locked',
    perfect: mine !== undefined && mine.value === possible,
    holders: scored
      ? records
          .filter((entry) => entry.value === record?.value)
          .map((entry) => ({ player: entry.player, name: view.playerName(entry.player) }))
      : [],
    recordPerfect: record !== undefined && record.value === possible,
  };
}

/**
 * Les méthodes de `ClientGame` liées à la campagne, à partir du libellé d'un niveau, du format des scores et de la
 * définition du jeu (déblocage, meilleur score possible de chaque clé), pour une campagne de `size` niveaux.
 * L'indication d'un aperçu est son score.
 */
export function campaignMethods(
  levelLabel: (level: number, lang: Lang) => string,
  formatValue: ((value: number, lang: Lang) => string) | null,
  definition: GameDefinition,
  size = MAX_LEVEL,
): Pick<ClientGame, 'keyLabel' | 'formatValue' | 'levelProgress' | 'levelOf' | 'levelTile' | 'nextKey' | 'liveTag'> {
  return {
    keyLabel(key, lang) {
      const level = parseCampaignKey(key, size);
      return level === null ? key : levelLabel(level, lang);
    },
    formatValue,
    levelProgress: (view, player) => campaignProgress(view, player, definition, size),
    levelOf: (key) => parseCampaignKey(key, size),
    levelTile: (level, view) => campaignTile(level, view, definition, formatValue !== null),
    nextKey(key) {
      const level = parseCampaignKey(key, size);
      return level === null || level >= size ? null : campaignKey(level + 1);
    },
    // Le score de la partie en cours, pour un jeu qui en a un.
    liveTag: (_state, value, lang) => (formatValue ? formatValue(value, lang) : null),
  };
}
