# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.4.5](https://github.com/ggcow/ggames/compare/v0.4.4...v0.4.5) (2026-11-14)

### Fonctionnalités

* **platform:** ajouter le salon global ([1b87020](https://github.com/ggcow/ggames/commit/1b87020f6748d14e265b9e00427b6b8f619788a2))

### Corrections

* **platform:** intégrer le salon aux pages ([caad1cc](https://github.com/ggcow/ggames/commit/caad1cc1361456b730ffc3ed1d7c9a6bc68b74dd))

## [0.4.4](https://github.com/ggcow/ggames/compare/v0.4.3...v0.4.4) (2026-11-14)

### Fonctionnalités

* **platform:** ajouter les réactions de course ([a3a6bae](https://github.com/ggcow/ggames/commit/a3a6bae65862678b0ca00b21e60350e33af198fb))

### Corrections

* **ci:** préciser la branche Pages au déploiement ([e227a29](https://github.com/ggcow/ggames/commit/e227a297ec797f0eed62cf970581028ba316b6ae))

### Documentation

* ajouter le suivi des tâches ([209d627](https://github.com/ggcow/ggames/commit/209d6275187821efaea8be86789c810c016f0754))
* noter l'environnement de test ([9c4cbdb](https://github.com/ggcow/ggames/commit/9c4cbdb64a5665a8de5a1bd04653a0a5c206e424))

## [0.4.3](///compare/v0.4.2...v0.4.3) (2026-11-14)

### Fonctionnalités

* **platform:** limiter les replays aux niveaux réussis 24dcb0c

## [0.4.2](///compare/v0.4.1...v0.4.2) (2026-11-14)

### Fonctionnalités

* **platform:** aperçus en direct plus compacts et indicateur d'avancement 26ee0f2

## [0.4.1](///compare/v0.4.0...v0.4.1) (2026-11-14)

### Fonctionnalités

* **platform:** réserver les replays aux parties gagnées d210180

## [0.4.0](///compare/v0.3.0...v0.4.0) (2026-11-14)

### ⚠ BREAKING CHANGES

* **platform:** GameDefinition.prerequisite est remplacée par isUnlocked(key,
  won), qui reçoit l'ensemble des clés gagnées par le joueur.

### Fonctionnalités

* **platform:** écran de partie compact pour la course sur téléphone 0d4fd44
* **platform:** rejoindre un ami sur son niveau, en course f63eb97

### Refactorisation

* **platform:** extraire la campagne de niveaux et le cadre de partie 1ef5b8e

## [0.3.0](///compare/v0.2.0...v0.3.0) (2026-11-13)

### ⚠ BREAKING CHANGES

* **fioles:** generateBoard prend un BoardSpec ; campaignColors est
  remplacée par campaignSpec. Les parties Fioles enregistrées sont supprimées.

### Fonctionnalités

* **fioles:** afficher de nouveau le nombre de coups 1c6a940
* **fioles:** ne compter que la réussite des niveaux f11d6c8
* **fioles:** nouvelle campagne qui monte plus vite en difficulté 3465d43
* **platform:** montrer où en est chaque joueur sur la grille des niveaux cefc9e5

### Corrections

* **fioles:** n'animer le bouchon que sur la fiole qui vient d'être terminée 98ca7d6

## [0.2.0](///compare/v0.1.0...v0.2.0) (2026-11-13)

### ⚠ BREAKING CHANGES

* **platform:** les routes /api/games/:game/contents sont supprimées et
  GameDefinition.parseKey/contentKey/isValidContent sont remplacées par isValidKey.

### Fonctionnalités

* **client:** refonte visuelle façon jeu mobile 919bc4e
* **platform:** grille de niveaux par pages avec déblocage progressif f63c826
* **platform:** retirer la création de niveaux par les joueurs ba008a4

### Documentation

* décrire le bouton de langue actuel 8ad75da

## 0.1.0 (2026-11-13)

### Fonctionnalités

* **platform:** plateforme de mini-jeux avec le jeu Fioles 9295104

### Documentation

* indiquer l'adresse de production et la mise en place Cloudflare 2526ff2
