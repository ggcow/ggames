// Génération des niveaux de Parking : tirage des véhicules, recherche de la position la plus éloignée de la
// sortie et difficulté de la campagne. Utilisé uniquement par `npm run levels` (qui écrit levels.ts) et par les
// tests : les joueurs et le serveur lisent les niveaux enregistrés, jamais générés à la volée.

import { createRandom } from '../random.ts';
import { type Board, boardToString, CAR, EXIT_ROW, occupancy, RED, SIZE, TRUCK, type Vehicle } from './rules.ts';

/* ---------- Distances à la sortie ---------- */

// Une composante compte jusqu'à des centaines de milliers de positions : on l'explore sur une forme compacte.
// Seule la case de tête d'un véhicule change, et elle vaut au plus SIZE - CAR : une position tient dans un
// nombre, la tête de chaque véhicule étant un chiffre en base BASE.
const BASE = SIZE - CAR + 1;

/** Tête d'un véhicule sur sa voie : colonne d'un véhicule horizontal, rangée d'un vertical. */
const headOf = (vehicle: Vehicle): number => (vehicle.horizontal ? vehicle.col : vehicle.row);

const packBoard = (board: Board): number => board.reduce((key, vehicle, i) => key + headOf(vehicle) * BASE ** i, 0);

function unpackBoard(shape: Board, key: number): Board {
  return shape.map((vehicle, i) => {
    const head = Math.floor(key / BASE ** i) % BASE;
    return vehicle.horizontal ? { ...vehicle, col: head } : { ...vehicle, row: head };
  });
}

/** Positions voisines d'une position compactée : un glissement d'un véhicule, d'une ou plusieurs cases. */
function packedNeighbors(shape: Board, key: number, cells: Int8Array): number[] {
  const heads = shape.map((_, i) => Math.floor(key / BASE ** i) % BASE);
  cells.fill(-1);
  shape.forEach((vehicle, i) => {
    const step = vehicle.horizontal ? 1 : SIZE;
    const first = vehicle.horizontal ? vehicle.row * SIZE + (heads[i] ?? 0) : (heads[i] ?? 0) * SIZE + vehicle.col;
    for (let k = 0; k < vehicle.length; k++) cells[first + k * step] = i;
  });
  const next: number[] = [];
  shape.forEach((vehicle, i) => {
    const head = heads[i] ?? 0;
    const step = vehicle.horizontal ? 1 : SIZE;
    const first = vehicle.horizontal ? vehicle.row * SIZE + head : head * SIZE + vehicle.col;
    const unit = BASE ** i;
    for (let back = 1; head - back >= 0 && cells[first - back * step] === -1; back++) next.push(key - back * unit);
    for (
      let ahead = 1;
      head + vehicle.length - 1 + ahead < SIZE && cells[first + (vehicle.length - 1 + ahead) * step] === -1;
      ahead++
    ) {
      next.push(key + ahead * unit);
    }
  });
  return next;
}

/** Positions accessibles depuis un parking, rangées par nombre de coups minimal jusqu'à la sortie. */
export interface Component {
  /** Nombre de positions de la composante. */
  readonly size: number;
  /** Plus grand nombre de coups minimal d'une position de la composante. */
  readonly depth: number;
  /** Positions dont la solution la plus courte fait `distance` coups, dans un ordre stable. */
  at(distance: number): Board[];
}

/**
 * Composante de `start` : chaque coup se défait, on explore donc toutes les positions accessibles, puis on
 * remonte en largeur depuis les positions gagnées. `null` si la composante dépasse `limit` positions ou ne
 * contient aucune position gagnée.
 */
export function exploreComponent(start: Board, limit: number): Component | null {
  const cells = new Int8Array(SIZE * SIZE);
  const solved = (key: number) => Math.floor(key / BASE ** RED) % BASE === SIZE - CAR;
  const seen = new Set<number>([packBoard(start)]);
  const queue = [...seen];
  for (let i = 0; i < queue.length; i++) {
    for (const after of packedNeighbors(start, queue[i] ?? 0, cells)) {
      if (seen.has(after)) continue;
      if (seen.size >= limit) return null;
      seen.add(after);
      queue.push(after);
    }
  }
  let frontier = queue.filter(solved);
  if (frontier.length === 0) return null;
  const layers: number[][] = [];
  const reached = new Set<number>(frontier);
  while (frontier.length > 0) {
    layers.push(frontier);
    const next: number[] = [];
    for (const key of frontier) {
      for (const after of packedNeighbors(start, key, cells)) {
        if (reached.has(after)) continue;
        reached.add(after);
        next.push(after);
      }
    }
    frontier = next;
  }
  return {
    size: seen.size,
    depth: layers.length - 1,
    at: (distance) => (layers[distance] ?? []).map((key) => unpackBoard(start, key)),
  };
}

/* ---------- Tirage des véhicules ---------- */

/** Paramètres d'un parking généré. */
export interface LevelSpec {
  /** Véhicules en plus de la voiture rouge. */
  vehicles: number;
  /** Part des camions parmi ces véhicules. */
  trucks: number;
  /** Nombre de coups minimal de la solution. */
  moves: number;
}

/** Essais de placement d'un véhicule avant d'y renoncer : le parking est peut-être déjà plein. */
const PLACE_ATTEMPTS = 60;

/**
 * Véhicules tirés au hasard sans chevauchement. Aucun véhicule horizontal sur la rangée de la sortie : placé
 * devant la voiture rouge, il la bloquerait pour toujours ; derrière elle, il ne servirait à rien.
 */
export function randomBoard(spec: LevelSpec, random: () => number): Board {
  const board: Vehicle[] = [{ horizontal: true, length: CAR, row: EXIT_ROW, col: Math.floor(random() * 3) }];
  for (let attempt = 0; attempt < PLACE_ATTEMPTS && board.length <= spec.vehicles; attempt++) {
    const horizontal = random() < 0.5;
    const length = random() < spec.trucks ? TRUCK : CAR;
    const lane = Math.floor(random() * SIZE);
    const head = Math.floor(random() * (SIZE - length + 1));
    if (horizontal && lane === EXIT_ROW) continue;
    const vehicle: Vehicle = horizontal
      ? { horizontal, length, row: lane, col: head }
      : { horizontal, length, row: head, col: lane };
    const cells = occupancy(board);
    const fits = [...occupancy([vehicle])].every((index, cell) => index === -1 || cells[cell] === -1);
    if (fits) board.push(vehicle);
  }
  return board;
}

/** Positions explorées au plus pour un tirage : un parking de quinze véhicules en a rarement plus. */
const COMPONENT_LIMIT = 200_000;

/** Tirages au plus pour un niveau, avant d'abandonner la génération. */
export const MAX_DRAWS = 20_000;

/**
 * Parking dont la solution la plus courte fait exactement `spec.moves` coups. On tire des véhicules jusqu'à obtenir une composante assez profonde, puis on y choisit une
 * position à la bonne distance. `avoid` écarte des parkings déjà retenus. Même résultat pour une même graine ;
 * échoue après `draws` tirages sans succès.
 */
export function generateBoard(
  spec: LevelSpec,
  seed: number,
  avoid: ReadonlySet<string> = new Set(),
  draws = MAX_DRAWS,
): Board {
  const random = createRandom(seed);
  for (let draw = 0; draw < draws; draw++) {
    const component = exploreComponent(randomBoard(spec, random), COMPONENT_LIMIT);
    if (!component || component.depth < spec.moves) continue;
    const candidates = component.at(spec.moves).filter((candidate) => !avoid.has(boardToString(candidate)));
    const chosen = candidates[Math.floor(random() * candidates.length)];
    if (chosen) return chosen;
  }
  throw new Error(`aucun parking de ${spec.moves} coups après ${draws} tirages`);
}

/* ---------- Campagne ---------- */

/** Coups de la solution la plus courte au dernier niveau : au-delà, un tirage au hasard y parvient trop rarement. */
export const HARDEST_MOVES = 30;

/**
 * Difficulté du niveau `level` : la solution la plus courte s'allonge régulièrement, de 2 coups au niveau 1 à
 * HARDEST_MOVES au niveau 100, dans un parking de plus en plus rempli (5 véhicules au départ, 14 au plus) : seuls
 * les parkings serrés ont des solutions longues.
 */
export function campaignSpec(level: number): LevelSpec {
  return {
    vehicles: Math.min(4 + Math.ceil(level / 7), 14),
    trucks: 0.3,
    moves: 2 + Math.floor(((level - 1) * (HARDEST_MOVES - 2)) / 99),
  };
}

/** Parking enregistré du niveau `level`, à partir de sa propre graine. */
export const generateLevel = (level: number, avoid?: ReadonlySet<string>): Board =>
  generateBoard(campaignSpec(level), level, avoid);

/**
 * Niveaux 1 à `count` de la campagne, encodés comme dans levels.ts, tous différents. `progress` est appelé après
 * chaque niveau.
 */
export function generateLevels(count: number, progress?: (level: number) => void): string[] {
  const levels: string[] = [];
  const seen = new Set<string>();
  for (let level = 1; level <= count; level++) {
    const text = boardToString(generateLevel(level, seen));
    seen.add(text);
    levels.push(text);
    progress?.(level);
  }
  return levels;
}
