# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
