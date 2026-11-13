import type { GameState, PlayerGameDetail, RunSummary } from '../../../shared/platform/protocol.ts';
import type { ClientGame, GameView } from '../../games/client-game.ts';
import { type AppContext, createGameView, type ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDate, formatDuration } from '../i18n.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';

/** Progression détaillée d'un joueur sur un jeu : niveaux, essais, meilleurs scores, replays. */
export function mountPlayer(host: HTMLElement, ctx: AppContext, game: ClientGame, playerId: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let data: { detail: PlayerGameDetail; view: GameView } | null = null;

  const runRow = (run: RunSummary, view: GameView) =>
    h(
      'button',
      { class: 'card run', on: { click: () => ctx.navigate({ name: 'run', run: run.id }) } },
      h('strong', { class: 'grow' }, game.keyLabel(run.key, ctx.lang, view)),
      h('small', { class: `status ${run.status}` }, t[`status_${run.status}`]),
      h(
        'small',
        { class: 'muted block' },
        `${game.formatValue(run.value, ctx.lang)} · ${formatDuration(run.durationMs, ctx.lang)} · ${formatDate(run.ended, ctx.lang)}`,
      ),
    );

  const render = () => {
    if (!data) return loading(host, t);
    const { detail, view } = data;
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
              h('strong', { class: 'grow' }, game.keyLabel(key.key, ctx.lang, view)),
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
      section(t.recent, h('div', { class: 'stack' }, ...detail.recent.map((run) => runRow(run, view)))),
    );
  };

  const load = () =>
    Promise.all([api.playerDetail(gameId, playerId), api.game(gameId)])
      .then(([detail, state]: [PlayerGameDetail, GameState]) => {
        data = { detail, view: createGameView(state, ctx.me.id, ctx.lang) };
        render();
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  render();
  void load();
  return { onDataChanged: () => void load() };
}

const stat = (label: string, value: string) =>
  h('div', { class: 'stat' }, h('strong', null, value), h('small', { class: 'muted' }, label));
