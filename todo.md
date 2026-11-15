# TODO

- [x] Ordonner les replays de la fiche d'un joueur : l'ordre actuel par dernière partie jouée est
  illisible. Les classer par niveau croissant, avec un ordre stable pour les clés hors campagne.
- [ ] Séparer l'identifiant de connexion du nom affiché : le pseudo actuel sert aux deux. Le login
  doit rester unique et stable, le nom affiché doit pouvoir changer sans changer la connexion.

## Infrastructure

- [x] Environnement de test séparé : site `ggames-staging.pages.dev`, Worker `ggames-api-staging`,
  base Durable Object dédiée.

## Communication

- [x] Étape 1 — réactions de course : un seul catalogue, chaque entrée étant soit un emoji, soit un
  texte (jamais les deux) ; le dictionnaire `defineStrings` ne contient que les textes (fr + zh,
  rendus dans la langue de chacun). Envoi en un clic, sans texte libre ni historique.
- [x] Étape 2 — salon texte global : intégré à l'accueil et à la page d'un jeu, historique court
  (50 derniers messages, 7 jours), texte libre limité.
- [x] Étape 3 — notes vocales : normales dans le salon ; messages vocaux éphémères pendant une course,
  avec disparition par destinataire après écoute et expiration. À valider sur le WebView de WeChat.
