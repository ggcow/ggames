# Mini-jeux

Plateforme de mini-jeux pour téléphone, à jouer entre amis, y compris depuis la Chine.
Rien à installer : on ouvre **https://ggames-cw2.pages.dev** dans le navigateur (ou dans WeChat).

## Pour les joueurs

- Crée un compte avec un pseudo et un mot de passe, puis connecte-toi sur n'importe quel appareil.
- L'accueil liste les jeux et les joueurs en ligne.
- Pour chaque jeu : une grille de niveaux par pages. Un niveau se débloque en gagnant le précédent.
- Sur la grille, chaque joueur apparaît sur son niveau (celui qu'il joue s'il est en ligne).
- La progression de chacun (niveaux réussis, parties, temps de jeu), les classements et le replay de chaque
  partie.
- Quand un ami joue, son plateau s'affiche en direct ; toucher son nom permet de jouer le même niveau.
- Interface en français et en chinois (bouton 中 / Fr en haut de l’écran).

### Jeux

| Jeu       | Principe                                                                 | Extras           |
| --------- | ------------------------------------------------------------------------ | ---------------- |
| 🧪 Fioles | Verser les couleurs jusqu'à ce que chaque fiole soit d'une seule couleur | campagne infinie |

## Fonctionnement technique

- **Hébergement** : Cloudflare, offre gratuite.
  - Cloudflare Pages (projet `ggames`) sert le site sur `https://ggames-cw2.pages.dev`, une adresse
    accessible depuis la Chine.
  - Un Worker Cloudflare répond à l'API ; Pages lui relaie les requêtes `/api/*`.
  - Un Durable Object stocke toutes les données (SQLite) et gère le temps réel (WebSocket).
- **Anti-triche** : chaque partie est envoyée avec son replay ; le serveur la rejoue et calcule le score.
- **Langage** : TypeScript strict partout (client, serveur, code partagé).

Détails d'architecture et règles de contribution : [AGENTS.md](AGENTS.md).

## Développement

Prérequis : Node.js 24 (voir `.nvmrc`).

```sh
npm install          # installe aussi les hooks git
npm run dev          # site + API sur http://localhost:8787
npm run check        # lint, types, build et tests
```

Pour tester sur un téléphone du même réseau wifi : `http://<adresse-IP-du-PC>:8787`.

## Mise en place sur un compte Cloudflare

Déjà fait pour le compte actuel ; à refaire uniquement sur un nouveau compte.

1. Vérifier l'adresse e-mail du compte et ouvrir une fois le menu « Workers & Pages » du tableau de bord
   (crée le sous-domaine `workers.dev` exigé par Cloudflare, même s'il n'est pas utilisé).
2. `npx wrangler login` (ouvre le navigateur pour autoriser l'accès au compte Cloudflare).
3. `npm run build && npx wrangler deploy` : crée le Worker `ggames-api` et sa base.
4. `cd pages && npx wrangler pages project create ggames --production-branch main` : crée le projet Pages
   et affiche son adresse `*.pages.dev`.
5. `npm run deploy` : publie le site et l'API.

## Livraisons

```sh
npm run release            # calcule la version, met à jour CHANGELOG.md, crée le commit et le tag
git push --follow-tags     # la CI vérifie puis déploie le tag
```

Le déploiement automatique demande deux secrets dans le dépôt GitHub : `CLOUDFLARE_API_TOKEN` et
`CLOUDFLARE_ACCOUNT_ID`.
