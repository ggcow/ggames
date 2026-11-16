# Mini-jeux

Plateforme de mini-jeux pour téléphone, à jouer entre amis, y compris depuis la Chine.
Rien à installer : on ouvre **https://ggames-cw2.pages.dev** dans le navigateur (ou dans WeChat).

## Pour les joueurs

- Crée un compte avec un identifiant et un mot de passe, puis connecte-toi sur n'importe quel appareil. Ton
  pseudo affiché part de l'identifiant ; le bouton Modifier de l'accueil change l'un ou l'autre (ton mot de
  passe est demandé pour changer d'identifiant).
- L'accueil liste les jeux et les joueurs en ligne.
- Pour chaque jeu : une grille de 100 niveaux sur 5 pages. Chacun avance à son rythme : un niveau se débloque
  quand tous les précédents sont gagnés.
- Si un ami joue un niveau que tu n'as pas encore débloqué, tu peux le rejoindre et faire la course avec lui
  (trois joueurs au plus). La victoire compte au classement, mais ta progression reste la tienne.
- En partie, ton plateau occupe le bas de l'écran ; au-dessus, les plateaux des deux autres joueurs en petit.
- Sur la grille, chaque joueur apparaît sur son niveau (celui qu'il joue s'il est en ligne).
- La progression de chacun (niveaux réussis, parties, temps de jeu), les classements et le replay des parties
  gagnées sur les niveaux que tu as toi-même réussis. À égalité, même rang ; toucher le 🏆 d'un niveau en
  partie montre son podium.
- Fioles : chaque niveau a un meilleur score possible, calculé une fois pour toutes. L'atteindre vaut un 💎.
- La fiche d'un ami ne liste que les niveaux que vous avez tous les deux réussis, et son replay ne s'ouvre que si
  tu as fait aussi bien ou mieux que lui : un replay ne révèle jamais une solution meilleure que la tienne.
- Un replay montre le chemin final de la partie, sans les coups annulés.
- Quand un ami joue, son plateau s'affiche en direct ; toucher son nom permet de jouer le même niveau.
  « Impasse » s'affiche dès qu'il ne peut plus gagner, même s'il lui reste quelques coups.
- Pendant une course, envoie des réactions rapides (emojis ou phrases) aux joueurs du même niveau. Elles
  disparaissent après quelques secondes et ne sont pas conservées.
- Un salon global est intégré à l'accueil et à la page d'un jeu : sous le contenu sur un téléphone. Sur un
  écran large, l'accueil et la page d'un jeu remplissent la fenêtre : les panneaux gardent leurs proportions
  et s'agrandissent, le salon à droite sur toute la hauteur. Les 50 derniers messages sont conservés 7 jours.
- Le salon accepte des notes vocales normales, conservées avec l'historique. Pendant une course, on peut
  envoyer des messages vocaux : ils disparaissent pour chaque joueur après écoute, restent pour ceux qui
  ne les ont pas écoutés, et expirent au bout de 30 secondes. Une note disparaît pour tous, auteur compris,
  dès que chaque destinataire l'a écoutée ou a quitté le niveau. L'enregistrement dépend du navigateur.
- Écouter une note vocale enchaîne sur les notes des autres joueurs qui la suivent. Pendant une course, une
  croix retire une note de son propre écran.
- Chaque joueur a un avatar : un animal qui se choisit en touchant sa pastille sur l'accueil (ou par
  Modifier), parmi ceux qu'aucun autre joueur n'a déjà.
- Interface en français et en chinois (bouton 中 / Fr en haut de l’écran).

### Jeux

| Jeu         | Principe                                                                         | Extras      |
| ----------- | -------------------------------------------------------------------------------- | ----------- |
| 🧪 Fioles   | Verser les couleurs jusqu'à ce que chaque fiole soit d'une seule couleur         | 100 niveaux |
| 💐 Bouquets | Glisser les fleurs de pot en pot : trois pareilles devant un pot font un bouquet | 100 niveaux |

## Fonctionnement technique

- **Hébergement** : Cloudflare, offre gratuite.
  - Cloudflare Pages (projet `ggames`) sert le site sur `https://ggames-cw2.pages.dev`, une adresse
    accessible depuis la Chine.
  - Un Worker Cloudflare répond à l'API ; Pages lui relaie les requêtes `/api/*`.
  - Un Durable Object stocke toutes les données (SQLite) et gère le temps réel (WebSocket).
  - Environnement de test séparé : Worker `ggames-api-staging` + site `https://ggames-staging.pages.dev`,
    avec sa propre base. Rien n'est partagé avec la production.
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

### Test avant production

```sh
npm run deploy:staging
```

Déploie le Worker `ggames-api-staging` et le site `https://ggames-staging.pages.dev`. Cet environnement a
sa propre base Durable Object : les comptes et les parties de test ne touchent jamais la production.
Le workflow `staging.yml` fait ce déploiement à chaque push sur `main` ; la production reste réservée aux
tags de version.

## Mise en place sur un compte Cloudflare

Déjà fait pour le compte actuel ; à refaire uniquement sur un nouveau compte.

1. Vérifier l'adresse e-mail du compte et ouvrir une fois le menu « Workers & Pages » du tableau de bord
   (crée le sous-domaine `workers.dev` exigé par Cloudflare, même s'il n'est pas utilisé).
2. `npx wrangler login` (ouvre le navigateur pour autoriser l'accès au compte Cloudflare).
3. `npm run build && npx wrangler deploy` : crée le Worker `ggames-api` et sa base.
4. `cd pages && npx wrangler pages project create ggames --production-branch main` : crée le projet Pages
   et affiche son adresse `*.pages.dev`.
5. `cd pages-staging && npx wrangler pages project create ggames-staging --production-branch main` : crée
   le projet Pages de test.
6. `npm run deploy` : publie la production ; `npm run deploy:staging` publie l'environnement de test.

## Livraisons

```sh
npm run release            # calcule la version, met à jour CHANGELOG.md, crée le commit et le tag
git push origin main       # pousse le commit de release
git push origin vX.Y.Z     # pousse le tag : déclenche le déploiement en production
```

Le tag est poussé séparément du commit pour déclencher le workflow `Deploy`. Chaque push sur `main`
déploie aussi l'environnement de test. Le déploiement automatique demande deux secrets dans le dépôt
GitHub : `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.
