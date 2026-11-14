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
- L'accueil liste les jeux. Pour chaque jeu : la grille des 100 niveaux, 5 pages de 20 (réussis, jouable, verrouillés),
  la progression de chaque joueur (niveaux réussis, essais, temps), les classements, et le replay des parties
  gagnées sur les niveaux déjà réussis par le joueur.
- Un replay ne révèle jamais la solution d'un niveau : on ne voit que les replays des niveaux qu'on a
  soi-même réussis. La fiche d'un joueur ne liste que les niveaux réussis par les deux.
- Progression individuelle : on joue le premier niveau pas encore gagné (et tous ceux d'avant).
- Rejoindre : un niveau verrouillé qu'un ami joue en direct peut être rejoint (course sur le même plateau, trois
  joueurs au plus). La victoire compte au classement mais ne fait pas avancer la progression. Le serveur accepte
  une partie sur un niveau débloqué par le joueur ou par n'importe quel autre joueur, et refuse le reste.
- Écran de partie pensé pour un téléphone : son plateau en grand en bas, au-dessus au plus deux aperçus des
  autres joueurs en petit ; record et compteur de coups en badges compacts.
- Pendant une course, chaque joueur envoie des réactions rapides (emojis ou phrases courtes traduites) aux
  joueurs du même niveau. Elles ne sont pas conservées et ne concernent que la course en cours.
- Un salon global est intégré à l'accueil et à la page d'un jeu : on échange des messages texte directement
  dans la page. L'historique est court (50 derniers messages, 7 jours) et les messages sont limités en
  longueur et en débit.
- Le salon accepte des notes vocales comme des messages normaux. Pendant une course, on peut aussi envoyer
  des messages vocaux courts : une note disparaît pour chaque destinataire après son écoute, reste visible
  pour ceux qui ne l'ont pas encore écoutée, et expire au bout d'une heure.
- Le serveur rejoue chaque partie pour calculer le score : impossible d'envoyer un faux score.
- Temps réel : on voit qui est en ligne, sur quel niveau, et son plateau en direct.
- Interface en français et en chinois.
- Les niveaux de chaque jeu sont générés une fois pour toutes et enregistrés dans le projet, jamais à la volée.
- Premier jeu : **Fioles** (trier des couleurs dans des fioles), avec une campagne de 100 niveaux.
- Deuxième jeu : **Bouquets** (réunir trois fleurs pareilles devant un pot ; des couches cachées avancent quand
  un devant se vide), avec une campagne de 100 niveaux de difficulté croissante et des illustrations peintes.

## Contraintes à ne jamais casser

- **Accès depuis la Chine.** Aucune ressource externe (CDN, Google Fonts, analytics, API Google ou Firebase) :
  tout est servi par le projet. Les joueurs passent par `*.pages.dev` (Cloudflare Pages). `workers.dev` et
  `vercel.app` sont bloqués en Chine : le Worker n'est jamais exposé directement (`workers_dev: false`).
- **Navigateurs cibles** : WebView de WeChat (iOS 15+ et Chromium 100+), Safari iOS, Chrome Android. Écran de
  375 px de large. Cible de compilation définie dans `scripts/build.ts`.
- **Bilingue** : tout texte visible passe par un dictionnaire `defineStrings` (fr + zh). Le compilateur impose
  les mêmes clés dans les deux langues.
- **Données de production** : ne jamais modifier une migration existante (`src/worker/platform/schema.ts`).
  Modifier un niveau enregistré (`src/shared/games/<jeu>/levels.ts`) ou le format des replays rend les parties
  enregistrées invalides : à faire uniquement avec une migration qui supprime les parties concernées, et seulement
  si le propriétaire l'a demandé. Ne jamais regénérer les niveaux d'un jeu publié.

## Architecture

```
site/                      fichiers statiques (index.html, style.css), copiés dans dist/
  games/<jeu>/             illustrations d'un jeu (WebP), servies par le site
src/
  shared/                  code commun client + serveur, sans DOM ni Cloudflare
    platform/              protocole HTTP/WebSocket (types, routes, validation), catalogue de réactions
    games/                 interface GameDefinition + registre des jeux
      campaign.ts          campagne de niveaux commune : clés `c:<n>`, déblocage
      random.ts            hasard reproductible pour générer les niveaux (graine, mélange)
      fioles/              règles, replays, niveaux enregistrés (levels.ts) et leur générateur (generate.ts)
      bouquets/            idem ; le générateur mesure la difficulté avec des parties simulées
  worker/                  serveur Cloudflare
    index.ts               routeur HTTP -> Durable Object
    http.ts                réponses JSON, lecture du corps, jeton
    platform/              Durable Object World, stockage SQLite, migrations, mots de passe, quotas
  client/                  application navigateur (TypeScript compilé par esbuild en dist/app.js)
    main.ts                point d'entrée
    platform/              coquille : session, routeur, API, temps réel, salon, écrans communs, UI, i18n
    games/                 interface ClientGame + registre + un dossier par jeu
      campaign.ts          méthodes ClientGame d'une campagne (progression, cases, niveau suivant)
      puzzle-frame.ts      cadre de partie commun : compteur de coups, Annuler, Recommencer
pages/                     projet Cloudflare Pages : relaie /api/* vers le Worker (service binding)
pages-staging/             même relais pour l'environnement de test
tests/                     Vitest : shared/ (node), client/ (happy-dom), worker/ (runtime Cloudflare réel)
scripts/build.ts           construction de dist/
scripts/levels.ts          écrit les niveaux enregistrés d'un jeu à partir de son generate.ts
```

### Plateforme et jeux

La plateforme ne connaît aucune règle de jeu. Un jeu fournit :

- côté partagé, une `GameDefinition` (`src/shared/games/game.ts`) : ordre des scores, validation des clés de
  partie, déblocage par la progression (`isUnlocked()`), et `replay()` qui rejoue une partie et calcule son score ;
- côté client, un `ClientGame` (`src/client/games/client-game.ts`) : nom, icône (emoji ou image servie par le
  site), libellés, avancement de chaque joueur
  et case de chaque niveau (`levelProgress()`, `levelOf()`, `levelTile()`), écrans de jeu et de replay, et `formatValue` pour afficher un score
  (`null` si seule la réussite compte : la plateforme masque alors scores et classements par score).

La plateforme affiche la grille des niveaux (`src/client/platform/level-grid.ts`, 20 niveaux par page) à partir
de `levelProgress()` et `levelTile()`, avec la position de chaque joueur (niveau joué en direct, sinon plus haut
niveau débloqué).

### Modèle de données (SQLite du Durable Object `World`)

| Table                   | Contenu                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `players`               | compte : id, pseudo (unique sans casse), hash PBKDF2 du mot de passe |
| `sessions`              | jetons de session (hash SHA-256), un par appareil connecté           |
| `runs`                  | chaque partie : jeu, clé, joueur, statut, score, durée, replay, date |
| `chat_messages`         | messages du salon global : joueur, texte, date                       |
| `voice_notes`           | notes vocales du salon : joueur, durée, type MIME, audio, date       |
| `race_voices`           | notes vocales de course : jeu, niveau, joueur, audio, date           |
| `race_voice_recipients` | destinataires d'une note de course                                   |
| `race_voice_reads`      | lecture d'une note de course par un destinataire                     |

Progression, classements et statistiques sont calculés à partir de `runs` (requêtes dans `store.ts`).
La présence en temps réel vit dans les WebSockets en hibernation, pas en base.

### API

Routes dans `ROUTES` (`src/shared/platform/protocol.ts`) et `ROUTE_TABLE` (`src/worker/index.ts`).
Erreurs attendues : valeurs `Result` renvoyées par le Durable Object, converties en statut HTTP.

## Ajouter un jeu

1. `src/shared/games/<jeu>/` : règles pures + `definition.ts` qui exporte une `GameDefinition` ;
   l'enregistrer dans `src/shared/games/registry.ts`. Un jeu à niveaux utilise la campagne commune
   (`shared/games/campaign.ts`) et `campaignMethods()` côté client ; son `generate.ts` produit ses 100 niveaux,
   écrits une fois pour toutes dans `levels.ts` par `npm run levels -- <jeu>` (générateur à déclarer dans
   `scripts/levels.ts`).
2. `src/client/games/<jeu>/` : `index.ts` qui exporte un `ClientGame`, `strings.ts` (fr + zh), écrans ;
   l'enregistrer dans `src/client/games/registry.ts`. Ses images éventuelles vont dans `site/games/<jeu>/`.
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

| Commande                  | Rôle                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`             | serveur local complet (site + API + temps réel) sur http://localhost:8787    |
| `npm run check`           | lint + types + build + tous les tests : doit passer avant chaque commit      |
| `npm run test:watch`      | tests en continu                                                             |
| `npm run format`          | formatage et corrections automatiques Biome                                  |
| `npm run types`           | régénère `worker-configuration.d.ts` après un changement de `wrangler.jsonc` |
| `npm run levels -- <jeu>` | écrit les niveaux enregistrés d'un nouveau jeu (jamais d'un jeu publié)      |
| `npm run release`         | nouvelle version : CHANGELOG, numéro de version, commit et tag               |
| `npm run deploy`          | déploiement manuel de la production (normalement fait par la CI sur un tag)  |
| `npm run deploy:staging`  | déploiement de l'environnement de test (Worker + Pages staging)              |

## Git

- Branche principale `main`. Une branche par sujet (`feat/…`, `fix/…`), fusionnée une fois `npm run check` vert.
- Messages au format Conventional Commits, vérifiés par commitlint (hook `commit-msg`) :

  ```
  <type>(<portée>): <résumé à l'impératif, sans point final>

  <corps : pourquoi ce changement, ce qu'il implique, lignes de 100 caractères max>
  ```

  Types : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
  Portées : `platform`, `worker`, `client`, `shared`, `fioles`, `bouquets`, `ci`, `deps`, `release`.
- Un commit = un changement cohérent qui passe `npm run check`. Pas de commit « wip » ni « fix typo » isolé
  d'un changement qu'il corrige.
- Hook `pre-commit` : Biome sur les fichiers indexés + vérification des types.
- Environnement de test : chaque push sur `main` déploie `ggames-staging` via `staging.yml`, avec sa propre
  base Durable Object.
- Livraison : `npm run release` sur `main` (met à jour `CHANGELOG.md` et `package.json`, crée le tag `vX.Y.Z`),
  puis `git push origin main` et `git push origin vX.Y.Z`. Le tag est poussé séparément pour déclencher
  `deploy.yml`, qui déploie la production.
- Jamais de `--no-verify`, de réécriture d'historique publié ni de force push sur `main`.
