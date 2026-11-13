import type { Run } from '../../../shared/platform/protocol.ts';
import type { Unmount } from '../../games/client-game.ts';
import { findClientGame } from '../../games/registry.ts';
import { avatar } from '../avatar.ts';
import { type AppContext, createGameView, type ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDate, formatDuration } from '../i18n.ts';
import { chip, errorMessage, loading, screenHeader, toast } from '../ui.ts';

/** Revoir une partie enregistrée, action par action. */
export function mountRun(host: HTMLElement, ctx: AppContext, runId: string): ScreenHandle {
  const { t, api } = ctx;
  let unmountReplay: Unmount | null = null;

  const show = async (run: Run) => {
    const game = findClientGame(run.game);
    if (!game) return;
    const state = await api.game(run.game);
    const name = createGameView(state, ctx.me.id, ctx.lang).playerName(run.player);
    const replayHost = h('div', { class: 'play-host' });
    replaceChildren(
      host,
      screenHeader(
        game.keyLabel(run.key, ctx.lang),
        () => ctx.navigate({ name: 'player', game: run.game, player: run.player }),
        t,
      ),
      h(
        'div',
        { class: 'run-head' },
        avatar(run.player, name, 'sm'),
        h('strong', null, t.replayOf(name)),
        h(
          'span',
          { class: 'chips' },
          chip(t[`status_${run.status}`], run.status === 'won' ? 'good' : 'bad'),
          game.formatValue ? chip(game.formatValue(run.value, ctx.lang)) : null,
          chip(`⏱ ${formatDuration(run.durationMs, ctx.lang)}`),
          chip(formatDate(run.ended, ctx.lang)),
        ),
      ),
      replayHost,
    );
    unmountReplay = game.mountReplay(replayHost, { key: run.key, replay: run.replay, lang: ctx.lang });
  };

  loading(host, t);
  api
    .run(runId)
    .then(show)
    .catch((error: unknown) => toast(errorMessage(error, t)));
  return { dispose: () => unmountReplay?.() };
}
