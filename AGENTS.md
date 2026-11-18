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

- Chaque joueur a un compte (identifiant + mot de passe) et se connecte depuis n'importe quel appareil. Son pseudo
  affiché part de l'identifiant. Pseudo et identifiant se changent séparément depuis l'accueil (bouton Modifier) ;
  changer d'identifiant demande le mot de passe. L'identifiant n'est montré qu'à son propriétaire.
- L'accueil liste les jeux. Pour chaque jeu : la grille des 100 niveaux, 5 pages de 20 (réussis, jouable, verrouillés),
  la progression de chaque joueur (niveaux réussis, essais, temps), les classements, et le replay des parties
  gagnées sur les niveaux déjà réussis par le joueur.
- Égalités : partout où un record ou un score parfait est partagé, tous ses détenteurs ex æquo apparaissent
  (avatars serrés, résumés par « +n » au-delà de la place disponible, `avatarGroup()`). Classements : à égalité,
  même rang et le rang suivant vient juste après (1, 1, 2 : trois premiers ex æquo laissent les 2e et 3e places
  du podium) ; le classement d'un niveau (fin de partie, podium) réunit les ex æquo d'un même score sur une
  seule ligne. Le badge du record d'un niveau montre tous ses détenteurs ex æquo ; le
  toucher ouvre le podium du niveau (les trois premiers rangs). En fin de partie, une victoire qui atteint le
  record l'annonce : record du niveau, ou record partagé avec les ex æquo nommés (`recordStanding()`).
- Score parfait : quand le meilleur score possible d'un niveau est prouvé (`bestPossible()`), l'atteindre est
  marqué d'un 💎 (case du niveau, classements, record, fin de partie).
- La case d'un niveau montre son numéro, sans score. Réussie avec le score parfait : un 💎 seul. Réussie sans
  lui : les avatars des détenteurs du record (ex æquo compris), marqués d'un petit 💎 si ce record est
  parfait. La fiche d'un joueur donne par niveau le nombre d'essais, le temps de la première victoire et le
  nombre d'essais qu'il a fallu, le 💎 et la médaille du podium (or, argent, bronze ; ex æquo compris).
- Un replay ne révèle jamais une solution meilleure que la sienne : on ne voit le replay d'un autre joueur que sur
  un niveau qu'on a soi-même réussi avec un score au moins aussi bon. La fiche d'un joueur ne liste que les niveaux
  réussis par les deux ; les replays encore hors de portée y sont verrouillés.
- Un replay se regarde sans les coups annulés : on voit le chemin final de la partie.
- Progression individuelle : on joue le premier niveau pas encore gagné (et tous ceux d'avant).
- Rejoindre : un niveau verrouillé qu'un ami joue en direct peut être rejoint (course sur le même plateau, trois
  joueurs au plus, quatre aux Pandas). La victoire compte au classement mais ne fait pas avancer la
  progression. Le serveur accepte une partie sur un niveau débloqué par le joueur ou par n'importe quel autre
  joueur, et refuse le reste.
- Écran de partie pensé pour un téléphone : son plateau en grand en bas, au-dessus les aperçus des autres
  joueurs en petit, côte à côte sur deux colonnes (trois aux Pandas quand trois autres joueurs sont là, en
  cartes resserrées) ; à côté du nom, le score ou les vies ; record et compteur de coups en badges compacts.
- Pendant une course, chaque joueur envoie des réactions rapides (emojis ou phrases courtes traduites) aux
  joueurs du même niveau. Elles ne sont pas conservées et ne concernent que la course en cours.
- Un salon global est intégré à l'accueil et à la page d'un jeu : on échange des messages texte directement
  dans la page, sous le contenu sur un téléphone. Sur un écran large, l'accueil et la page d'un jeu
  remplissent la fenêtre : les panneaux gardent leurs proportions de téléphone, agrandis par paliers (`zoom`),
  le salon à droite sur toute la hauteur (`chatScreen()`). La page elle-même ne défile pas : le contenu défile
  dans sa colonne, le salon reste en place. Les panneaux d'une même `panelColumn()` restent empilés. L'accueil reste sur une colonne (En ligne sous les jeux) ; la page d'un jeu met sa colonne
  latérale (`sideColumn()` : En ligne puis Joueurs) à gauche de la grille ; sur une fenêtre moyenne, le salon
  s'affine pour lui laisser la place.
  L'écran de partie n'est pas concerné. L'historique est court (50 derniers messages, 7 jours) et les messages sont limités en
  longueur et en débit.
- Le salon accepte des notes vocales comme des messages normaux. Pendant une course, on peut aussi envoyer
  des messages vocaux courts : une note disparaît pour chaque destinataire après son écoute, reste visible
  pour ceux qui ne l'ont pas encore écoutée, et expire au bout de 30 secondes. Elle disparaît pour tous, auteur
  compris, dès que chaque destinataire l'a écoutée ou a quitté le niveau. Écouter une note enchaîne sur
  les notes des autres joueurs qui la suivent. Pendant une course, une croix retire une note de son seul
  écran.
- Avatar d'un joueur : un animal du catalogue (`shared/platform/avatars.ts`), que personne d'autre n'a, sur un
  fond neutre. Il en reçoit un à l'inscription et le change pour un animal encore libre depuis la fenêtre
  Modifier, qu'ouvre aussi sa pastille sur l'accueil.
- Le serveur rejoue chaque partie pour calculer le score : impossible d'envoyer un faux score.
- Score d'un jeu au tour par tour : le nombre de coups joués ; Annuler en retire un, Recommencer repart de zéro.
  En fin de partie, Rejouer relance le même niveau, même gagné, pour améliorer son score.
- Temps réel : on voit qui est en ligne, sur quel niveau, et son plateau en direct. Dans la liste En ligne, un
  joueur en partie porte « Rejoindre » et une aura qui pulse : le toucher rejoint son niveau. L'aperçu affiche
  « Impasse » dès que le joueur ne peut plus gagner, même s'il lui reste des coups qui tournent en rond.
- Interface en français et en chinois.
- Les niveaux de chaque jeu sont générés une fois pour toutes et enregistrés dans le projet, jamais à la volée.
- Premier jeu : **Fioles** (trier des couleurs dans des fioles), avec une campagne de 100 niveaux.
- Deuxième jeu : **Bouquets** (réunir trois fleurs pareilles devant un pot ; des couches cachées avancent quand
  un devant se vide), avec une campagne de 100 niveaux de difficulté croissante et des illustrations peintes.
- Troisième jeu : **Pandas** (un panda par ligne, par colonne et par bosquet coloré, sans que deux pandas se
  touchent, même en diagonale), avec une campagne de 100 grilles de 5 à 10 cases de côté, chacune à solution
  unique. Un toucher met ou enlève une croix (repère qui n'entre pas dans le replay), glisser le doigt en met
  sur chaque case parcourue, sans jamais en enlever ; un double toucher, un double clic ou un clic droit tente un panda. Un panda bien
  placé reste, une tentative ratée coûte une vie : trois vies, et la troisième erreur perd la partie (Rejouer
  la relance). Pas de score : seule la réussite compte (ni 💎, ni record, ni classement par score, ni Annuler) ;
  essais, temps et replay restent, et le nombre d'erreurs est gardé avec chaque partie. L'aperçu d'un autre
  joueur ne révèle rien de la solution : la grille part grise, chaque bosquet où il a trouvé le panda prend sa
  couleur, et ses vies s'affichent à côté de son nom ; l'état diffusé ne contient pas la case des pandas.
- Quatrième jeu : **Parking** (faire glisser voitures et camions le long de leur axe pour libérer la sortie de
  la voiture rouge, sur un parking de 6 × 6 cases), avec une campagne de 100 niveaux dont la solution la plus
  courte s'allonge de 6 à 45 coups. Un glissement compte pour un coup, quelle que soit sa longueur ; on glisse
  au doigt, ou aux flèches du clavier. Jamais d'impasse : chaque coup se défait.
- Cinquième jeu : **Couteaux** (une planète tourne ; on lance depuis le bas des couteaux qui s'y plantent, et un
  couteau qui touche un couteau déjà planté rebondit), avec une campagne de 100 niveaux : plus de couteaux,
  d'obstacles déjà plantés, une planète plus rapide qui change de vitesse puis de sens. Un toucher (ou Espace,
  Entrée, flèche haut) lance ; le couteau vole un tiers de seconde, pendant lequel la planète continue de
  tourner. Trois vies : chaque rebond en coûte une, le troisième perd la partie. Le score est le nombre de
  rebonds d'une victoire ; sans rebond, c'est le 💎. Le temps avance par pas fixes (60 par seconde) et le replay
  est le pas de chaque lancer : le serveur en déduit où chaque couteau s'est planté. L'aperçu d'un autre joueur
  montre sa planète et ses couteaux plantés, ses vies à côté de son nom, et « Impasse » quand la place libre ne
  suffit plus aux couteaux qui restent.

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
      moves.ts             score des jeux au tour par tour : coups joués, moins un par annulation
      fioles/              règles, replays, niveaux enregistrés (levels.ts), leur générateur (generate.ts)
                           et le meilleur score possible de chacun (optimal.ts)
      bouquets/            idem ; le générateur mesure la difficulté avec des parties simulées
      pandas/              règles, solveur, replays, grilles enregistrées et leur générateur (solution unique)
      parking/             règles, recherche de la solution la plus courte, replays, niveaux enregistrés,
                           leur générateur (escalade vers un parking aux solutions longues, puis position à la
                           distance voulue de la sortie) et leur meilleur score
      couteaux/            règles (rotation de la planète en entiers, lancers), replays, niveaux enregistrés et
                           leur générateur (vérifie qu'une partie sans rebond existe)
  worker/                  serveur Cloudflare
    index.ts               routeur HTTP -> Durable Object
    http.ts                réponses JSON, lecture du corps, jeton
    platform/              Durable Object World, stockage SQLite, migrations, mots de passe, quotas
  client/                  application navigateur (TypeScript compilé par esbuild en dist/app.js)
    main.ts                point d'entrée
    platform/              coquille : session, routeur, API, temps réel, salon, écrans communs, UI, i18n
    games/                 interface ClientGame + registre + un dossier par jeu
      campaign.ts          méthodes ClientGame d'une campagne (progression, cases, niveau suivant)
      puzzle-frame.ts      cadre de partie commun : plateau, pastille facultative (coups, vies), boutons du jeu
pages/                     projet Cloudflare Pages : relaie /api/* vers le Worker (service binding)
pages-staging/             même relais pour l'environnement de test
tests/                     Vitest : shared/ (node), client/ (happy-dom), worker/ (runtime Cloudflare réel)
scripts/build.ts           construction de dist/
scripts/levels.ts          écrit les niveaux enregistrés d'un jeu à partir de son generate.ts
scripts/optimal.ts         écrit le meilleur score possible de chaque niveau d'un jeu (recherche exhaustive)
```

### Plateforme et jeux

La plateforme ne connaît aucune règle de jeu. Un jeu fournit :

- côté partagé, une `GameDefinition` (`src/shared/games/game.ts`) : ordre des scores, validation des clés de
  partie, déblocage par la progression (`isUnlocked()`), `replay()` qui rejoue une partie et calcule son score,
  et `bestPossible()`, le meilleur score prouvé d'une clé (`null` s'il n'est pas connu) ;
- côté client, un `ClientGame` (`src/client/games/client-game.ts`) : nom, icône (emoji ou image servie par le
  site), libellés, avancement de chaque joueur
  et case de chaque niveau (`levelProgress()`, `levelOf()`, `levelTile()`), écrans de jeu et de replay, et `formatValue` pour afficher un score
  (`null` si seule la réussite compte : la plateforme masque alors scores et classements par score) ; pour les
  courses, `raceSize` (joueurs au plus, soi compris, selon la largeur de ses aperçus), l'aperçu
  (`renderLiveState()`) et l'indication à côté du nom (`liveTag()` : score, vies…).

La plateforme affiche la grille des niveaux (`src/client/platform/level-grid.ts`, 20 niveaux par page) à partir
de `levelProgress()` et `levelTile()`, avec la position de chaque joueur (niveau joué en direct, sinon plus haut
niveau débloqué). Un joueur qui n'a jamais joué à ce jeu n'y apparaît que s'il y joue en direct.

### Modèle de données (SQLite du Durable Object `World`)

| Table                   | Contenu                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `players`               | compte : id, pseudo et identifiant (uniques sans casse), animal (unique), hash PBKDF2 |
| `sessions`              | jetons de session (hash SHA-256), un par appareil connecté                            |
| `runs`                  | chaque partie : jeu, clé, joueur, statut, score, durée, replay, date                  |
| `chat_messages`         | messages du salon global : joueur, texte, date                                        |
| `voice_notes`           | notes vocales du salon : joueur, durée, type MIME, audio, date                        |
| `race_voices`           | notes vocales de course : jeu, niveau, joueur, audio, date                            |
| `race_voice_recipients` | destinataires d'une note de course                                                    |
| `race_voice_reads`      | lecture d'une note de course par un destinataire                                      |

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
   `scripts/levels.ts`). Si une recherche exhaustive le permet, `npm run optimal -- <jeu>` écrit le meilleur
   score possible de chaque niveau dans `optimal.ts` (recherche à déclarer dans `scripts/optimal.ts`).
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
- Pseudos, numéros et scores affichés passent par `noTranslate()` (`dom.ts`), et un pseudo dans une phrase par
  `withName()` (`ui.ts`) : la traduction automatique du navigateur ne doit ni traduire un pseudo ni écrire un
  chiffre en lettres.
- `erasableSyntaxOnly` : pas d'`enum`, de `namespace` ni de propriétés de paramètres de constructeur.
- Imports avec l'extension `.ts`.

## Commandes

| Commande                   | Rôle                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`              | serveur local complet (site + API + temps réel) sur http://localhost:8787    |
| `npm run check`            | lint + types + build + tous les tests : doit passer avant chaque commit      |
| `npm run test:watch`       | tests en continu                                                             |
| `npm run format`           | formatage et corrections automatiques Biome                                  |
| `npm run types`            | régénère `worker-configuration.d.ts` après un changement de `wrangler.jsonc` |
| `npm run levels -- <jeu>`  | écrit les niveaux enregistrés d'un nouveau jeu (jamais d'un jeu publié)      |
| `npm run optimal -- <jeu>` | écrit le meilleur score possible de chaque niveau d'un jeu                   |
| `npm run release`          | nouvelle version : CHANGELOG, numéro de version, commit et tag               |
| `npm run deploy`           | déploiement manuel de la production (normalement fait par la CI sur un tag)  |
| `npm run deploy:staging`   | déploiement de l'environnement de test (Worker + Pages staging)              |

## Git

- Branche principale `main`. Une branche par sujet (`feat/…`, `fix/…`), fusionnée une fois `npm run check` vert.
- Messages au format Conventional Commits, vérifiés par commitlint (hook `commit-msg`) :

  ```
  <type>(<portée>): <résumé à l'impératif, sans point final>

  <corps : pourquoi ce changement, ce qu'il implique, lignes de 100 caractères max>
  ```

  Types : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
  Portées : `platform`, `worker`, `client`, `shared`, `fioles`, `bouquets`, `pandas`, `parking`, `couteaux`, `ci`,
  `deps`, `release`.
- Un commit = un changement cohérent qui passe `npm run check`. Pas de commit « wip » ni « fix typo » isolé
  d'un changement qu'il corrige.
- Hook `pre-commit` : Biome sur les fichiers indexés + vérification des types.
- Environnement de test : chaque push sur `main` déploie `ggames-staging` via `staging.yml`, avec sa propre
  base Durable Object.
- Livraison : `npm run release` sur `main` (met à jour `CHANGELOG.md` et `package.json`, crée le tag `vX.Y.Z`),
  puis `git push origin main` et `git push origin vX.Y.Z`. Le tag est poussé séparément pour déclencher
  `deploy.yml`, qui déploie la production.
- Jamais de `--no-verify`, de réécriture d'historique publié ni de force push sur `main`.
