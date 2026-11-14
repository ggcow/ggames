// Relaie toutes les requêtes /api/* (HTTP et WebSocket) vers le Worker de test.
interface PagesEnv {
  API: Fetcher;
}

export const onRequest: PagesFunction<PagesEnv> = (context) => context.env.API.fetch(context.request);
