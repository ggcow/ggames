// Génération des niveaux de Bouquets : solveur, tirage des plateaux, mesure de la difficulté et progression de
// la campagne. Utilisé uniquement par `npm run levels` (qui écrit levels.ts) et par les tests : les joueurs et le
// serveur lisent les niveaux enregistrés, jamais générés à la volée.

import { createRandom, shuffle } from '../random.ts';
import {
  advance,
  applyMove,
  type Board,
  boardToString,
  cloneBoard,
  FLOWER_KINDS,
  type Flower,
  flowerCount,
  frontOf,
  isLayerEmpty,
  isSolved,
  type Move,
  type ReadonlyBoard,
  SLOTS,
  type Slot,
} from './rules.ts';

/* ---------- Coups ---------- */

/** Coups possibles : une fleur de chaque espèce de chaque devant, vers la première place libre des autres pots. */
function movesOf(board: ReadonlyBoard): { move: Move; same: number }[] {
  const moves: { move: Move; same: number }[] = [];
  board.forEach((sourcePot, from) => {
    const seen = new Set<Flower>();
    frontOf(sourcePot).forEach((flower, slot) => {
      if (flower === null || seen.has(flower)) return;
      seen.add(flower);
      board.forEach((targetPot, to) => {
        const front = frontOf(targetPot);
        const place = front.indexOf(null);
        if (to === from || place === -1) return;
        moves.push({ move: { from, slot, to, place }, same: front.filter((s) => s === flower).length });
      });
    });
  });
  return moves;
}

/* ---------- Solveur ---------- */

/**
 * Clé d'un état pour le solveur. Seul compte le contenu de chaque couche (pas l'ordre des places, ni l'ordre des
 * pots) : deux états de même clé ont exactement les mêmes suites de coups.
 */
const stateKey = (board: ReadonlyBoard): string =>
  board
    .map((pot) =>
      pot
        .map((layer) =>
          layer
            .filter((slot) => slot !== null)
            .sort((a, b) => a - b)
            .join(','),
        )
        .join('/'),
    )
    .sort()
    .join('|');

/**
 * Coups à essayer, les plus prometteurs d'abord : rejoindre des fleurs pareilles, puis le reste. Former un
 * bouquet n'est jamais un mauvais coup (il libère des places sans en prendre) : s'il y en a un, c'est le seul.
 */
function solverMoves(board: ReadonlyBoard): Move[] {
  const moves = movesOf(board);
  const bouquet = moves.find(({ same }) => same === SLOTS - 1);
  if (bouquet) return [bouquet.move];
  return moves.sort((a, b) => b.same - a.same).map(({ move }) => move);
}

/**
 * Recherche une solution en profondeur, avec mémorisation des états déjà vus ; seul le chemin en cours est gardé
 * en mémoire. Renvoie les coups, ou `null` si le plateau est impossible ou demande d'explorer plus de `limit`
 * états.
 */
export function solve(start: ReadonlyBoard, limit: number): Move[] | null {
  const root = cloneBoard(start);
  if (isSolved(root)) return [];
  const seen = new Set<string>([stateKey(root)]);
  const path: Move[] = [];
  const frames: { board: Board; moves: Move[]; next: number }[] = [{ board: root, moves: solverMoves(root), next: 0 }];
  let explored = 0;
  for (let frame = frames.at(-1); frame; frame = frames.at(-1)) {
    const move = frame.moves[frame.next++];
    if (!move) {
      frames.pop();
      path.pop();
      continue;
    }
    const next = cloneBoard(frame.board);
    applyMove(next, move);
    const key = stateKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    path.push(move);
    if (isSolved(next)) return path;
    if (++explored > limit) return null;
    frames.push({ board: next, moves: solverMoves(next), next: 0 });
  }
  return null;
}

/* ---------- Difficulté ---------- */

/** Probabilité qu'un joueur naïf préfère rapprocher des fleurs pareilles plutôt que jouer au hasard. */
const NAIVE_FOCUS = 0.7;
/** Coups au plus d'une partie naïve, par fleur du plateau : au-delà, le joueur tourne en rond. */
const NAIVE_MOVES_PER_FLOWER = 8;

/**
 * Partie d'un joueur naïf, qui ne regarde que les devants : il forme un bouquet dès qu'il le peut, rapproche
 * souvent des fleurs pareilles, sinon joue au hasard, sans jamais renvoyer aussitôt une fleur d'où elle vient.
 * Vrai s'il vide le plateau.
 */
function naivePlay(start: ReadonlyBoard, random: () => number): boolean {
  const board = cloneBoard(start);
  const limit = NAIVE_MOVES_PER_FLOWER * flowerCount(board);
  let last: Move | null = null;
  for (let turn = 0; turn < limit; turn++) {
    if (isSolved(board)) return true;
    const moves = movesOf(board).filter(({ move }) => !(last && move.from === last.to && move.to === last.from));
    if (moves.length === 0) return false;
    const bouquets = moves.filter(({ same }) => same === SLOTS - 1);
    const joins = moves.filter(({ same }) => same > 0);
    const pool = bouquets.length > 0 ? bouquets : joins.length > 0 && random() < NAIVE_FOCUS ? joins : moves;
    const choice = pool[Math.floor(random() * pool.length)];
    if (!choice) return false;
    applyMove(board, choice.move);
    last = choice.move;
  }
  return isSolved(board);
}

/** Part des parties gagnées par le joueur naïf sur `trials` essais : 1 = trivial, proche de 0 = très difficile. */
export function naiveWinRate(board: ReadonlyBoard, seed: number, trials: number): number {
  const random = createRandom(seed);
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) if (naivePlay(board, random)) wins++;
  return wins / trials;
}

/* ---------- Tirage d'un plateau ---------- */

/** Paramètres d'un plateau généré. */
export interface BoardSpec {
  pots: number;
  /** Espèces de fleurs en jeu (chacune au moins une fois trois). */
  kinds: number;
  /** Couches cachées au plus derrière le devant d'un pot. */
  depth: number;
  /** Places libres au devant des pots au départ. */
  free: number;
}

/** Plateau tiré au hasard, avant toute vérification. */
export function randomBoard(spec: BoardSpec, random: () => number): Board {
  const layers = Array.from({ length: spec.pots }, () => 1 + Math.floor(random() * (spec.depth + 1)));
  const capacity = SLOTS * layers.reduce((a, b) => a + b, 0);
  const triples = Math.floor((capacity - spec.free) / SLOTS);
  const kinds = Math.min(spec.kinds, triples);
  const flowers: Flower[] = [];
  for (let t = 0; t < triples; t++) {
    const kind = t < kinds ? t : Math.floor(random() * kinds);
    flowers.push(kind, kind, kind);
  }
  shuffle(flowers, random);

  // Places libres : `free` au devant des pots, le reste (0 à 2) n'importe où.
  const positions = layers.flatMap((count, pot) =>
    Array.from({ length: count * SLOTS }, (_, i) => ({ pot, layer: Math.floor(i / SLOTS), place: i % SLOTS })),
  );
  const fronts = shuffle(
    positions.filter((p) => p.layer === 0),
    random,
  );
  const others = shuffle(
    positions.filter((p) => p.layer > 0),
    random,
  );
  const empty = new Set([...fronts.slice(0, spec.free), ...others.slice(0, capacity - flowers.length - spec.free)]);

  const board: Board = layers.map((count) => Array.from({ length: count }, () => Array<Slot>(SLOTS).fill(null)));
  let next = 0;
  for (const position of positions) {
    if (empty.has(position)) continue;
    const layer = board[position.pot]?.[position.layer];
    if (layer) layer[position.place] = flowers[next++] ?? null;
  }
  for (const pot of board) advance(pot);
  return board;
}

/**
 * Vrai si le plateau peut servir de départ : aucune couche de trois fleurs pareilles (un bouquet tout fait, ou qui
 * apparaîtrait tout fait en avançant), aucune couche cachée vide.
 */
export function isPlayableStart(board: ReadonlyBoard): boolean {
  return board.every((pot) =>
    pot.every(
      (layer, index) =>
        !(layer[0] !== null && layer.every((slot) => slot === layer[0])) && (index === 0 || !isLayerEmpty(layer)),
    ),
  );
}

/* ---------- Campagne ---------- */

/** Pots au plus : rangées de trois, trois, deux sur un téléphone. */
const MAX_CAMPAIGN_POTS = 8;
/** Début de la phase où l'on serre : moins de pots, plus de couches cachées, deux places libres. */
const TIGHT_LEVEL = 40;
/** Début de la phase de maîtrise : encore moins de pots, encore plus de couches. */
const MASTER_LEVEL = 70;

/**
 * Paramètres du niveau `level`. La difficulté vient surtout du manque de place : peu de pots pour beaucoup de
 * couches. Apprentissage jusqu'au niveau 39 (une espèce et un pot de plus tous les trois niveaux, première couche
 * cachée au niveau 3, deux au niveau 15), puis 7 pots à trois couches cachées et deux places libres, puis à
 * partir du niveau 70, 6 pots à quatre couches cachées. Toutes les espèces sont en jeu dès le niveau 29.
 */
export function campaignSpec(level: number): BoardSpec {
  const kinds = Math.min(2 + Math.floor((level + 1) / 3), FLOWER_KINDS);
  if (level >= MASTER_LEVEL) return { kinds, pots: 6, depth: 4, free: 2 };
  if (level >= TIGHT_LEVEL) return { kinds, pots: 7, depth: 3, free: 2 };
  return {
    kinds,
    pots: Math.min(3 + Math.floor(level / 3), MAX_CAMPAIGN_POTS),
    depth: level < 3 ? 0 : level < 15 ? 1 : 2,
    free: 3,
  };
}

/**
 * Réussite visée du joueur naïf au niveau `level` : de 95 % au niveau 1 à 20 % au niveau 100, avec un niveau plus
 * dur tous les dix niveaux et un niveau de répit juste après.
 */
export function targetWinRate(level: number): number {
  const base = 0.95 - 0.75 * ((level - 1) / 99) ** 0.8;
  const step = level % 10 === 0 ? -0.15 : level % 10 === 1 && level > 1 ? 0.12 : 0;
  return Math.min(0.98, Math.max(0.05, base + step));
}

/** Plateaux faisables tirés par niveau ; le plus proche de la difficulté visée est retenu. */
const CANDIDATES = 60;
/** Parties naïves jouées pour mesurer la difficulté d'un plateau. */
const TRIALS = 150;
/** États explorés au plus pour prouver qu'un plateau est faisable. */
const SOLVER_LIMIT = 60_000;

export interface GeneratedLevel {
  board: Board;
  winRate: number;
}

/**
 * Niveau `level` : parmi CANDIDATES plateaux faisables et jouables, inédits (absents de `taken`), celui dont la
 * réussite du joueur naïf est la plus proche de la difficulté visée. Les paramètres de la campagne permettent
 * toujours d'en trouver.
 */
export function generateLevel(level: number, taken: ReadonlySet<string>): GeneratedLevel {
  const spec = campaignSpec(level);
  const target = targetWinRate(level);
  let best: (GeneratedLevel & { gap: number }) | null = null;
  let found = 0;
  for (let attempt = 0; ; attempt++) {
    const seed = level * 100_000 + attempt;
    const board = randomBoard(spec, createRandom(seed));
    if (!isPlayableStart(board) || taken.has(boardToString(board)) || !solve(board, SOLVER_LIMIT)) continue;
    found++;
    const winRate = naiveWinRate(board, seed, TRIALS);
    const gap = Math.abs(winRate - target);
    if (!best || gap < best.gap) best = { board, winRate, gap };
    if (found >= CANDIDATES) return { board: best.board, winRate: best.winRate };
  }
}

/**
 * Niveaux 1 à `count` de la campagne, encodés comme dans levels.ts. `progress` est appelé après chaque niveau
 * (la génération complète prend plusieurs minutes).
 */
export function generateLevels(count: number, progress?: (level: number, generated: GeneratedLevel) => void): string[] {
  const levels: string[] = [];
  const taken = new Set<string>();
  for (let level = 1; level <= count; level++) {
    const generated = generateLevel(level, taken);
    const text = boardToString(generated.board);
    taken.add(text);
    levels.push(text);
    progress?.(level, generated);
  }
  return levels;
}
