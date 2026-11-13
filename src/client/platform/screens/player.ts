import type { KeyProgress, PlayerGameDetail, RunSummary } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDate, formatDuration } from '../i18n.ts';
import { chip, errorMessage, loading, screenHeader, section, toast } from '../ui.ts';

/** Fiche d'un joueur sur un jeu : statistiques, niveaux joués, meilleurs scores, dernières parties. */
export function mountPlayer(host: HTMLElement, ctx: AppContext, game: ClientGame, playerId: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let detail: PlayerGameDetail | null = null;

  const openRun = (run: RunSummary) => ctx.navigate({ name: 'run', run: run.id });

  const keyRow = (key: KeyProgress) =>
    h(
      'div',
      { class: 'list-row' },
      h(
        'span',
        { class: 'list-text' },
        h('strong', null, game.keyLabel(key.key, ctx.lang)),
        h('small', null, `${t.attempts} ${key.attempts} · ${t.wins} ${key.wins}`),
      ),
      key.best
        ? h(
            'button',
            { class: 'btn small', on: { click: () => key.best && openRun(key.best) } },
            `▶ ${game.formatValue(key.best.value, ctx.lang)}`,
          )
        : chip(t.status_abandoned, 'bad'),
    );

  const runRow = (run: RunSummary) =>
    h(
      'button',
      { class: 'list-row', on: { click: () => openRun(run) } },
      h(
        'span',
        { class: 'list-text' },
        h('strong', null, game.keyLabel(run.key, ctx.lang)),
        h(
          'small',
          null,
          `${game.formatValue(run.value, ctx.lang)} · ${formatDuration(run.durationMs, ctx.lang)} · ${formatDate(run.ended, ctx.lang)}`,
        ),
      ),
      chip(t[`status_${run.status}`], run.status === 'won' ? 'good' : 'bad'),
    );

  const render = () => {
    if (!detail) return loading(host, t);
    const { player, progress } = detail;
    replaceChildren(
      host,
      screenHeader(game.name[ctx.lang], () => ctx.navigate({ name: 'game', game: gameId }), t),
      h('div', { class: 'profile' }, avatar(player.id, player.name, 'lg'), h('h2', null, player.name)),
      h(
        'div',
        { class: 'stats' },
        stat(t.completed, String(progress?.completed ?? 0)),
        stat(t.runs, String(progress?.runs ?? 0)),
        stat(t.playTime, formatDuration(progress?.playTimeMs ?? 0, ctx.lang)),
      ),
      detail.keys.length > 0
        ? section(t.levels, h('div', { class: 'list' }, ...detail.keys.map(keyRow)))
        : h('p', { class: 'muted empty-line' }, t.noRuns),
      detail.recent.length > 0 ? section(t.recent, h('div', { class: 'list' }, ...detail.recent.map(runRow))) : null,
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
