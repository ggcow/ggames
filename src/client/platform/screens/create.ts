import type { ClientGame, Unmount } from '../../games/client-game.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { screenHeader, toast } from '../ui.ts';

/** Création de contenu : l'écran vient du jeu, la publication de la plateforme. */
export function mountCreate(host: HTMLElement, ctx: AppContext, game: ClientGame): ScreenHandle {
  const gameId = game.definition.id;
  const back = () => ctx.navigate({ name: 'game', game: gameId });
  if (!game.mountCreator) {
    back();
    return {};
  }
  const creatorHost = h('div', { class: 'play-host' });
  replaceChildren(host, screenHeader(ctx.t.create, back), creatorHost);
  const unmount: Unmount = game.mountCreator(creatorHost, {
    lang: ctx.lang,
    publish: async (draft) => {
      const { content } = await ctx.api.createContent(gameId, draft);
      toast(ctx.t.published);
      ctx.navigate({ name: 'play', game: gameId, key: game.definition.contentKey(content.id) });
    },
  });
  return { dispose: unmount };
}
