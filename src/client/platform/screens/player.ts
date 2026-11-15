import type { KeyProgress, PlayerGameDetail, RunSummary } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, noTranslate, replaceChildren } from '../dom.ts';
import { formatDuration } from '../i18n.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';

/** Fiche d'un joueur sur un jeu : statistiques, niveaux joués et meilleurs scores. */
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
