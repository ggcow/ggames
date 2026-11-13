// Types du module principal du Worker, utilisés par `ctx.exports` et par les tests
// (`import { exports } from 'cloudflare:workers'`). `wrangler types` ne les génère pas pour ce projet.

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index.ts');
    durableNamespaces: 'World';
  }
}
