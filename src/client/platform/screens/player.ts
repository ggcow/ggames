import type { KeyProgress, PlayerGameDetail, RunSummary } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { type Child, h, noTranslate, replaceChildren } from '../dom.ts';
import { formatDuration } from '../i18n.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';

/** Médailles du podium, du premier au troisième rang. */
const MEDALS = ['🥇', '🥈', '🥉'] as const;

/** Fiche d'un joueur sur un jeu : statistiques, niveaux joués et meilleurs scores. */
export function mountPlayer(host: HTMLElement, ctx: AppContext, game: ClientGame, playerId: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let detail: PlayerGameDetail | null = null;

  const openRun = (run: RunSummary) => ctx.navigate({ name: 'run', run: run.id });

  /** Essais jusqu'à la première victoire et au total, puis temps de cette première victoire. */
  const keyStats = (key: KeyProgress): string => {
    if (key.firstWinAttempts === null || key.firstWinDurationMs === null) return `${t.attempts} ${key.attempts}`;
    const time = formatDuration(key.firstWinDurationMs, ctx.lang);
    return `${t.attemptsDetail(key.firstWinAttempts, key.attempts)} · ${t.firstWinTime(time)}`;
  };

  /** Score parfait et place au podium du niveau, en badges discrets. */
  const keyBadges = (key: KeyProgress): Child[] => {
    const badges: Child[] = [];
    if (key.best && game.definition.bestPossible(key.key) === key.best.value) {
      badges.push(h('span', { class: 'key-badge', attrs: { title: t.perfectScore } }, '💎'));
    }
    if (key.rank !== null) {
      const medal = MEDALS[key.rank - 1];
      if (medal) {
        const title = t.podiumPlace(key.rank);
        badges.push(h('span', { class: 'key-badge', attrs: { title, 'aria-label': title } }, medal));
      }
    }
    return badges;
  };

  const keyRow = (key: KeyProgress) =>
    h(
      'div',
      { class: 'list-row' },
      h(
        'span',
        { class: 'list-text' },
        h('strong', null, game.keyLabel(key.key, ctx.lang), ...keyBadges(key)),
        h('small', null, keyStats(key)),
      ),
      key.best ? replayButton(key.best, key.replayVisible) : null,
    );

  /** Bouton du meilleur replay ; verrouillé tant que le demandeur n'a pas fait aussi bien sur ce niveau. */
  const replayButton = (best: RunSummary, visible: boolean) => {
    const score = game.formatValue?.(best.value, ctx.lang) ?? null;
    if (visible) {
      return h(
        'button',
        { class: 'btn small', on: { click: () => openRun(best) } },
        score ? `▶ ${score}` : t.watchReplay,
      );
    }
    // Sur un téléphone, un bouton désactivé ne dit rien : toucher le cadenas explique ce qu'il faut faire.
    const hint = t.replayLocked(score ?? '');
    return h(
      'button',
      { class: 'btn small locked', attrs: { 'aria-label': hint }, on: { click: () => toast(hint) } },
      score ? `🔒 ${score}` : '🔒',
    );
  };

  const render = () => {
    if (!detail) return loading(host, t);
    const { player, progress } = detail;
    replaceChildren(
      host,
      screenHeader(game.name[ctx.lang], () => ctx.navigate({ name: 'game', game: gameId }), t),
      h('div', { class: 'profile' }, avatar(player.id, player.name, 'lg'), noTranslate(h('h2', null, player.name))),
      h(
        'div',
        { class: 'stats' },
        stat(t.completed, String(progress?.completed ?? 0)),
        stat(t.runs, String(progress?.runs ?? 0)),
        stat(t.playTime, formatDuration(progress?.playTimeMs ?? 0, ctx.lang)),
      ),
      detail.keys.length > 0
        ? section(t.levels, h('div', { class: 'list' }, ...detail.keys.map(keyRow)))
        : h(
            'p',
            { class: 'muted empty-line' },
            detail.player.id === ctx.me.id || !detail.progress ? t.noRuns : t.noSharedReplays,
          ),
    );
  };

  const load = () =>
    api
      .playerDetail(gameId, playerId)
      .then((loaded) => {
        detail = loaded;
        render();
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  render();
  void load();
  return { onDataChanged: () => void load() };
}

const stat = (label: string, value: string) =>
  h('div', { class: 'stat' }, h('strong', null, value), h('small', null, label));
