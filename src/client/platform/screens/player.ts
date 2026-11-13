import type { PlayerGameDetail, RunSummary } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDate, formatDuration } from '../i18n.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';

/** Progression détaillée d'un joueur sur un jeu : niveaux, essais, meilleurs scores, replays. */
export function mountPlayer(host: HTMLElement, ctx: AppContext, game: ClientGame, playerId: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let detail: PlayerGameDetail | null = null;

  const runRow = (run: RunSummary) =>
    h(
      'button',
      { class: 'card run', on: { click: () => ctx.navigate({ name: 'run', run: run.id }) } },
      h('strong', { class: 'grow' }, game.keyLabel(run.key, ctx.lang)),
      h('small', { class: `status ${run.status}` }, t[`status_${run.status}`]),
      h(
        'small',
        { class: 'muted block' },
        `${game.formatValue(run.value, ctx.lang)} · ${formatDuration(run.durationMs, ctx.lang)} · ${formatDate(run.ended, ctx.lang)}`,
      ),
    );

  const render = () => {
    if (!detail) return loading(host, t);
    const progress = detail.progress;
    replaceChildren(
      host,
      screenHeader(`${detail.player.name} · ${game.name[ctx.lang]}`, () =>
        ctx.navigate({ name: 'game', game: gameId }),
      ),
      progress
        ? h(
            'div',
            { class: 'stats' },
            stat(t.completed, String(progress.completed)),
            stat(t.runs, String(progress.runs)),
            stat(t.playTime, formatDuration(progress.playTimeMs, ctx.lang)),
          )
        : h('p', { class: 'muted' }, t.noRuns),
      section(
        t.levels,
        h(
          'div',
          { class: 'stack' },
          ...detail.keys.map((key) =>
            h(
              'div',
              { class: 'card key-row' },
              h('strong', { class: 'grow' }, game.keyLabel(key.key, ctx.lang)),
              h('small', { class: 'muted' }, `${t.attempts} ${key.attempts} · ${t.wins} ${key.wins}`),
              key.best
                ? h(
                    'button',
                    {
                      class: 'ghost small',
                      on: { click: () => key.best && ctx.navigate({ name: 'run', run: key.best.id }) },
                    },
                    `${t.best} ${game.formatValue(key.best.value, ctx.lang)} ${t.watchReplay}`,
                  )
                : null,
            ),
          ),
        ),
      ),
      section(t.recent, h('div', { class: 'stack' }, ...detail.recent.map(runRow))),
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
  h('div', { class: 'stat' }, h('strong', null, value), h('small', { class: 'muted' }, label));
