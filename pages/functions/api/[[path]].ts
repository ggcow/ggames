// Relaie toutes les requêtes /api/* (HTTP et WebSocket) vers le Worker ggames-api.
interface PagesEnv {
  API: Fetcher;
}

export const onRequest: PagesFunction<PagesEnv> = (context) => context.env.API.fetch(context.request);
