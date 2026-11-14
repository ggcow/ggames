// Génération des niveaux de Fioles : solveur, tirage des plateaux et difficulté de la campagne.
// Utilisé uniquement par `npm run levels` (qui écrit levels.ts) et par les tests : les joueurs et le serveur
// lisent les niveaux enregistrés, jamais générés à la volée.

import { createRandom, shuffle } from '../random.ts';
import {
  type Board,
  boardToString,
  CAP,
  type Color,
  canPour,
  cloneBoard,
  isSolved,
  isTubeDone,
  MAX_COLORS,
  pour,
  type ReadonlyBoard,
} from './rules.ts';

/* ---------- Solveur ---------- */

const stateKey = (board: ReadonlyBoard): string => boardToString(board).split('.').sort().join('|');

/**
 * Effort du solveur : nombre d'états explorés (recherche en profondeur avec mémorisation) avant de trouver
 * une solution. `null` si le plateau est impossible ou demande plus de `limit` états.
 * Sert à vérifier qu'un plateau est faisable et à estimer sa difficulté.
 */
export function solverEffort(start: ReadonlyBoard, limit: number): number | null {
  const seen = new Set<string>([stateKey(start)]);
  const stack: Board[] = [cloneBoard(start)];
  let explored = 0;
  for (let board = stack.pop(); board; board = stack.pop()) {
    if (isSolved(board)) return explored;
    if (++explored > limit) return null;
    const towardEmpty: Board[] = [];
    const towardColor: Board[] = [];
    board.forEach((source, from) => {
      if (source.length === 0 || isTubeDone(source)) return;
      const uniform = source.every((color) => color === source[0]);
      board.forEach((target, to) => {
        if (from === to || !canPour(source, target)) return;
        if (target.length === 0 && uniform) return; // déplacer une fiole unie vers une vide ne sert à rien
        const next = cloneBoard(board);
        pour(next, from, to);
        const key = stateKey(next);
        if (seen.has(key)) return;
        seen.add(key);
        (target.length > 0 ? towardColor : towardEmpty).push(next);
      });
    });
    stack.push(...towardEmpty, ...towardColor); // pile : les coups vers une même couleur sont explorés en premier
  }
  return null;
}

export const isSolvable = (start: ReadonlyBoard, limit: number): boolean => solverEffort(start, limit) !== null;

/* ---------- Tirage d'un plateau ---------- */

/** Paramètres d'un plateau généré. */
export interface BoardSpec {
  colors: number;
  empty: number;
  /** Refuser les plateaux dont une fiole commence avec deux boules identiques côte à côte. */
  noAdjacentPairs: boolean;
  /** Nombre de plateaux faisables à générer ; le plus difficile pour le solveur est retenu. */
  candidates: number;
}

const SOLVER_LIMIT = 30_000;
const MAX_ATTEMPTS = 400;

const hasAdjacentPair = (tube: readonly Color[]): boolean => tube.some((color, i) => i > 0 && tube[i - 1] === color);

function shuffledBoard(colors: number, empty: number, random: () => number): Board {
  const balls: Color[] = [];
  for (let color = 0; color < colors; color++) for (let k = 0; k < CAP; k++) balls.push(color);
  shuffle(balls, random);
  const board: Board = [];
  for (let i = 0; i < colors; i++) board.push(balls.slice(i * CAP, i * CAP + CAP));
  for (let i = 0; i < empty; i++) board.push([]);
  return board;
}

/** Plateau faisable respectant `spec`. Même résultat pour une même graine. */
export function generateBoard(spec: BoardSpec, seed: number): Board {
  let best: { board: Board; effort: number } | null = null;
  let last: Board = [];
  let found = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && found < spec.candidates; attempt++) {
    const board = shuffledBoard(spec.colors, spec.empty, createRandom(seed * 131 + attempt));
    last = board;
    if (board.some(isTubeDone)) continue;
    if (spec.noAdjacentPairs && board.some(hasAdjacentPair)) continue;
    const effort = solverEffort(board, SOLVER_LIMIT);
    if (effort === null) continue;
    found++;
    if (!best || effort > best.effort) best = { board, effort };
  }
  return best?.board ?? last;
}

/* ---------- Campagne ---------- */

/** Au-delà de ce niveau, toutes les couleurs sont en jeu : la difficulté vient du choix du plateau. */
const FULL_COLORS_LEVEL = MAX_COLORS - 2;

/** Plafond du nombre de plateaux candidats supplémentaires (coût de génération : quelques ms chacun). */
const MAX_EXTRA_CANDIDATES = 40;

/**
 * Difficulté du niveau `level` : une couleur de plus à chaque niveau (3 au niveau 1, toutes au niveau 10),
 * pas de paires collées à partir du niveau 3, puis un plateau candidat de plus par niveau (jusqu'à 41) pour garder
 * le plus dur pour le solveur.
 * Toujours 2 fioles vides.
 */
export function campaignSpec(level: number): BoardSpec {
  return {
    colors: Math.min(level + 2, MAX_COLORS),
    empty: 2,
    noAdjacentPairs: level >= 3,
    candidates: 1 + Math.min(Math.max(level - FULL_COLORS_LEVEL, 0), MAX_EXTRA_CANDIDATES),
  };
}

/**
 * Graines de remplacement, bien au-delà de celles des niveaux. Espacées de 4 : un tirage essaie au plus
 * MAX_ATTEMPTS graines consécutives (graine × 131 + essai), et 4 × 131 dépasse MAX_ATTEMPTS.
 */
const RETRY_SEED = 10_000;
const RETRY_SPACING = 4;

/**
 * Niveaux 1 à `count` de la campagne, encodés comme dans levels.ts. Les tirages de niveaux voisins se
 * chevauchent et peuvent donner le même plateau : un plateau déjà vu est retiré avec des graines de
 * remplacement jusqu'à en obtenir un inédit.
 */
export function generateLevels(count: number): string[] {
  const levels: string[] = [];
  const seen = new Set<string>();
  for (let level = 1; level <= count; level++) {
    const spec = campaignSpec(level);
    let text = boardToString(generateBoard(spec, level));
    for (let retry = 0; seen.has(text); retry++) {
      text = boardToString(generateBoard(spec, RETRY_SEED + RETRY_SPACING * (level * 100 + retry)));
    }
    seen.add(text);
    levels.push(text);
  }
  return levels;
}
