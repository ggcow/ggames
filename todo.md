# TODO

- [ ] Ordonner les replays de la fiche d'un joueur : l'ordre actuel par dernière partie jouée est
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
- [x] Étape 3 — notes vocales : enregistrement court, lecture au clic ; la bulle disparaît pour chaque
  destinataire après écoute, reste pour ceux qui n'ont pas écouté, suppression après expiration.
  À valider d'abord sur le WebView de WeChat.
