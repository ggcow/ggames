# Directives pour les agents

Ce fichier fait foi pour tout agent (Claude Code, Codex, etc.) qui travaille sur ce dépôt.
Il décrit l'état actuel du projet et les règles à respecter. `CLAUDE.md` l'importe.

## Directives du propriétaire

1. **Code propre et professionnel.** TypeScript strict, typé précisément, sans `any`, sans contournement du
   compilateur ou du linter. Formatage et lint automatisés (Biome) : le code livré passe `npm run check` sans
   avertissement.
2. **Architecture générique, prête à grossir.** Une nouvelle fonctionnalité s'intègre dans l'architecture
   existante (plateforme + jeux branchés) ; elle ne s'ajoute jamais comme une verrue. Si l'architecture ne
   permet pas de l'ajouter proprement, on fait évoluer l'architecture d'abord.
3. **Beaucoup de tests unitaires**, avec Vitest. Toute règle, tout cas d'erreur et toute route a son test.
   Un bug corrigé reçoit un test qui l'aurait détecté.
4. **Tout est à jour, rien n'est vieux.** Une modification met à jour, dans le même commit, tout ce qu'elle
   touche : code, tests, types, configuration, `README.md`, ce fichier `AGENTS.md`. Aucun fichier, commentaire
   ou paragraphe ne doit décrire un état passé.
5. **Le code ne raconte pas son histoire ; git, si.** Interdit dans le code et la documentation : « ancien »,
   « nouveau », « désormais », « remplacé par », « avant on faisait », code commenté, code mort, fonctions
   gardées « au cas où ». L'historique se lit uniquement avec `git log`. Seule exception : les migrations
   SQL (`schema.ts`), qui forment par nature un journal d'étapes.
6. **Git propre.** Commits atomiques au format Conventional Commits, rédigés avec soin (voir plus bas).
   Version sémantique et tag à chaque livraison. CI qui vérifie tout sur chaque push.

## Le produit

Plateforme de mini-jeux pour téléphone, jouée entre amis, dont un en Chine continentale.

- Chaque joueur a un compte (pseudo + mot de passe) et se connecte depuis n'importe quel appareil.
- L'accueil liste les jeux. Pour chaque jeu : la grille des niveaux par pages (réussis, jouable, verrouillés),
  la progression de chaque joueur (niveaux réussis, essais, temps), les classements, et le replay de chaque
  partie.
- Un niveau se débloque en gagnant celui qui le précède ; le serveur refuse une partie sur un niveau verrouillé.
- Le serveur rejoue chaque partie pour calculer le score : impossible d'envoyer un faux score.
- Temps réel : on voit qui est en ligne, sur quel niveau, et son plateau en direct.
- Interface en français et en chinois.
- Premier jeu : **Fioles** (trier des couleurs dans des fioles), avec une campagne de niveaux infinie.

## Contraintes à ne jamais casser

- **Accès depuis la Chine.** Aucune ressource externe (CDN, Google Fonts, analytics, API Google ou Firebase) :
  tout est servi par le projet. Les joueurs passent par `*.pages.dev` (Cloudflare Pages). `workers.dev` et
  `vercel.app` sont bloqués en Chine : le Worker n'est jamais exposé directement (`workers_dev: false`).
- **Navigateurs cibles** : WebView de WeChat (iOS 15+ et Chromium 100+), Safari iOS, Chrome Android. Écran de
  375 px de large. Cible de compilation définie dans `scripts/build.ts`.
- **Bilingue** : tout texte visible passe par un dictionnaire `defineStrings` (fr + zh). Le compilateur impose
  les mêmes clés dans les deux langues.
- **Données de production** : ne jamais modifier une migration existante (`src/worker/platform/schema.ts`), ni
  la génération des niveaux de campagne (`createRandom`, `generateBoard`, `campaignColors`), ni le format des
  replays : les parties enregistrées deviendraient invalides.

## Architecture

```
site/                      fichiers statiques (index.html, style.css), copiés dans dist/
src/
  shared/                  code commun client + serveur, sans DOM ni Cloudflare
    platform/              protocole HTTP/WebSocket (types, routes, validation)
    games/                 interface GameDefinition + registre des jeux
      fioles/              règles, solveur, génération, clés, replays
  worker/                  serveur Cloudflare
    index.ts               routeur HTTP -> Durable Object
    http.ts                réponses JSON, lecture du corps, jeton
    platform/              Durable Object World, stockage SQLite, migrations, mots de passe, quotas
  client/                  application navigateur (TypeScript compilé par esbuild en dist/app.js)
    main.ts                point d'entrée
    platform/              coquille : session, routeur, API, temps réel, écrans communs, UI, i18n
    games/                 interface ClientGame + registre + un dossier par jeu
pages/                     projet Cloudflare Pages : relaie /api/* vers le Worker (service binding)
tests/                     Vitest : shared/ (node), client/ (happy-dom), worker/ (runtime Cloudflare réel)
scripts/build.ts           construction de dist/
```

### Plateforme et jeux

La plateforme ne connaît aucune règle de jeu. Un jeu fournit :

- côté partagé, une `GameDefinition` (`src/shared/games/game.ts`) : ordre des scores, validation des clés de
  partie, prérequis de déblocage (`prerequisite()`), et `replay()` qui rejoue une partie et calcule son score ;
- côté client, un `ClientGame` (`src/client/games/client-game.ts`) : nom, libellés, avancement et case de chaque
  niveau (`levelProgress()`, `levelTile()`), écrans de jeu et de replay, et `formatValue` pour afficher un score
  (`null` si seule la réussite compte : la plateforme masque alors scores et classements par score).

La plateforme affiche la grille des niveaux (`src/client/platform/level-grid.ts`, 20 niveaux par page) à partir
de `levelProgress()` et `levelTile()`.

### Modèle de données (SQLite du Durable Object `World`)

| Table      | Contenu                                                              |
| ---------- | -------------------------------------------------------------------- |
| `players`  | compte : id, pseudo (unique sans casse), hash PBKDF2 du mot de passe |
| `sessions` | jetons de session (hash SHA-256), un par appareil connecté           |
| `runs`     | chaque partie : jeu, clé, joueur, statut, score, durée, replay, date |

Progression, classements et statistiques sont calculés à partir de `runs` (requêtes dans `store.ts`).
La présence en temps réel vit dans les WebSockets en hibernation, pas en base.

### API

Routes dans `ROUTES` (`src/shared/platform/protocol.ts`) et `ROUTE_TABLE` (`src/worker/index.ts`).
Erreurs attendues : valeurs `Result` renvoyées par le Durable Object, converties en statut HTTP.

## Ajouter un jeu

1. `src/shared/games/<jeu>/` : règles pures + `definition.ts` qui exporte une `GameDefinition` ;
   l'enregistrer dans `src/shared/games/registry.ts`.
2. `src/client/games/<jeu>/` : `index.ts` qui exporte un `ClientGame`, `strings.ts` (fr + zh), écrans ;
   l'enregistrer dans `src/client/games/registry.ts`.
3. Tests : règles et replays dans `tests/shared/`, interface dans `tests/client/`, une partie complète via
   l'API dans `tests/worker/`.
4. Mettre à jour `README.md` (liste des jeux) et ce fichier.

Aucune modification de la plateforme ne doit être nécessaire. Si elle l'est, c'est que l'interface
`GameDefinition` ou `ClientGame` doit évoluer : la faire évoluer proprement, pour tous les jeux.

## Conventions de code

- Identifiants en anglais ; commentaires, documentation, messages de commit et textes d'interface en français
  (textes d'interface aussi en chinois).
- Un commentaire explique le pourquoi ou une contrainte, jamais ce que le code dit déjà.
- Code partagé (`src/shared`) : fonctions pures, sans effet de bord, sans DOM ni API Cloudflare.
- Toute donnée venant du réseau ou du stockage local est validée par une fonction `parse…`/`is…` avant usage.
- DOM construit avec `h()` (`src/client/platform/dom.ts`) ; jamais `innerHTML`.
- `erasableSyntaxOnly` : pas d'`enum`, de `namespace` ni de propriétés de paramètres de constructeur.
- Imports avec l'extension `.ts`.

## Commandes

| Commande             | Rôle                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`        | serveur local complet (site + API + temps réel) sur http://localhost:8787    |
| `npm run check`      | lint + types + build + tous les tests : doit passer avant chaque commit      |
| `npm run test:watch` | tests en continu                                                             |
| `npm run format`     | formatage et corrections automatiques Biome                                  |
| `npm run types`      | régénère `worker-configuration.d.ts` après un changement de `wrangler.jsonc` |
| `npm run release`    | nouvelle version : CHANGELOG, numéro de version, commit et tag               |
| `npm run deploy`     | déploiement manuel (normalement fait par la CI sur un tag)                   |

## Git

- Branche principale `main`. Une branche par sujet (`feat/…`, `fix/…`), fusionnée une fois `npm run check` vert.
- Messages au format Conventional Commits, vérifiés par commitlint (hook `commit-msg`) :

  ```
  <type>(<portée>): <résumé à l'impératif, sans point final>

  <corps : pourquoi ce changement, ce qu'il implique, lignes de 100 caractères max>
  ```

  Types : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
  Portées : `platform`, `worker`, `client`, `shared`, `fioles`, `ci`, `deps`, `release`.
- Un commit = un changement cohérent qui passe `npm run check`. Pas de commit « wip » ni « fix typo » isolé
  d'un changement qu'il corrige.
- Hook `pre-commit` : Biome sur les fichiers indexés + vérification des types.
- Livraison : `npm run release` sur `main` (met à jour `CHANGELOG.md` et `package.json`, crée le tag `vX.Y.Z`),
  puis `git push --follow-tags`. Le workflow `deploy.yml` déploie le tag.
- Jamais de `--no-verify`, de réécriture d'historique publié ni de force push sur `main`.
