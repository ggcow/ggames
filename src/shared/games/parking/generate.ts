// Génération des niveaux de Parking : recherche d'un parking aux solutions longues, choix d'une position à la
// bonne distance de la sortie et difficulté de la campagne. Utilisé uniquement par `npm run levels` (qui écrit levels.ts) et par les
// tests : les joueurs et le serveur lisent les niveaux enregistrés, jamais générés à la volée.

import { MAX_LEVEL } from '../campaign.ts';
import { createRandom } from '../random.ts';
import {
  type Board,
  boardToString,
  CAR,
  EXIT_ROW,
  MAX_VEHICLES,
  occupancy,
  RED,
  SIZE,
  TRUCK,
  type Vehicle,
} from './rules.ts';

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

/* ---------- Véhicules ---------- */

/** Part des camions parmi les véhicules tirés. */
const TRUCK_SHARE = 0.3;

/** Essais de placement d'un véhicule avant d'y renoncer : le parking est peut-être déjà plein. */
const PLACE_ATTEMPTS = 60;

/** Véhicule tiré au hasard, voie et case de tête comprises. */
function randomVehicle(random: () => number): Vehicle {
  const horizontal = random() < 0.5;
  const length = random() < TRUCK_SHARE ? TRUCK : CAR;
  const lane = Math.floor(random() * SIZE);
  const head = Math.floor(random() * (SIZE - length + 1));
  return horizontal ? { horizontal, length, row: lane, col: head } : { horizontal, length, row: head, col: lane };
}

/**
 * `vehicle` tient dans le parking sans chevaucher `board`. Aucun véhicule horizontal sur la rangée de la sortie :
 * placé devant la voiture rouge, il la bloquerait pour toujours ; derrière elle, il ne servirait à rien.
 */
function fits(board: Board, vehicle: Vehicle): boolean {
  const end = (vehicle.horizontal ? vehicle.col : vehicle.row) + vehicle.length;
  const lane = vehicle.horizontal ? vehicle.row : vehicle.col;
  if (Math.min(vehicle.row, vehicle.col) < 0 || end > SIZE || lane >= SIZE) return false;
  if (vehicle.horizontal && vehicle.row === EXIT_ROW) return false;
  const cells = occupancy(board);
  return [...occupancy([vehicle])].every((index, cell) => index === -1 || cells[cell] === -1);
}

/** Ajoute à `board` un véhicule tiré au hasard, s'il en trouve un qui tient. */
function addVehicle(board: Vehicle[], random: () => number): void {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    const vehicle = randomVehicle(random);
    if (fits(board, vehicle)) {
      board.push(vehicle);
      return;
    }
  }
}

/** La voiture rouge sur la rangée de la sortie, et au plus `vehicles` autres véhicules tirés sans chevauchement. */
export function randomBoard(vehicles: number, random: () => number): Board {
  const board: Vehicle[] = [{ horizontal: true, length: CAR, row: EXIT_ROW, col: Math.floor(random() * 3) }];
  for (let attempt = 0; attempt < PLACE_ATTEMPTS && board.length <= vehicles; attempt++) addVehicle(board, random);
  return board;
}

/** `vehicle` décalé d'une case le long de sa voie ou en travers, changé de longueur ou tourné d'un quart de tour. */
function nudge(vehicle: Vehicle, random: () => number): Vehicle {
  const step = random() < 0.5 ? -1 : 1;
  switch (Math.floor(random() * 4)) {
    case 0:
      return vehicle.horizontal ? { ...vehicle, col: vehicle.col + step } : { ...vehicle, row: vehicle.row + step };
    case 1:
      return vehicle.horizontal ? { ...vehicle, row: vehicle.row + step } : { ...vehicle, col: vehicle.col + step };
    case 2:
      return { ...vehicle, length: vehicle.length === CAR ? TRUCK : CAR };
    default:
      return { ...vehicle, horizontal: !vehicle.horizontal, row: vehicle.col, col: vehicle.row };
  }
}

/**
 * Variante de `board` : un véhicule retouché (la moitié du temps), sinon un véhicule ajouté, après en avoir
 * retiré un deux fois sur trois ou quand le parking compte déjà MAX_VEHICLES véhicules. La voiture rouge reste.
 * `null` si la retouche tirée ne tient pas dans le parking.
 */
export function mutate(board: Board, random: () => number): Board | null {
  const others = board.length - 1;
  const pick = () => 1 + Math.floor(random() * others);
  if (others > 0 && random() < 0.5) {
    const index = pick();
    const rest = board.filter((_, i) => i !== index);
    const moved = nudge(board[index] as Vehicle, random);
    return fits(rest, moved) ? board.map((vehicle, i) => (i === index ? moved : vehicle)) : null;
  }
  const variant = [...board];
  if (others > 0 && (random() < 2 / 3 || board.length >= MAX_VEHICLES)) variant.splice(pick(), 1);
  addVehicle(variant, random);
  return variant;
}

/* ---------- Recherche d'un parking difficile ---------- */

/** Véhicules du parking de départ d'une escalade, en plus de la voiture rouge. */
const START_VEHICLES = 11;

/** Variantes essayées par escalade : au-delà, elle reste le plus souvent bloquée sur un parking. */
export const CLIMB_STEPS = 1500;

/** Escalades au plus pour un niveau, avant d'abandonner la génération. */
export const MAX_CLIMBS = 500;

/**
 * Positions explorées au plus par composante. Les composantes profondes restent en dessous ; explorer les plus
 * grandes ralentirait la recherche sans l'aider.
 */
const COMPONENT_LIMIT = 30_000;

/**
 * Parking dont la solution la plus courte fait exactement `moves` coups. Un tirage au hasard n'en donne presque
 * jamais au-delà de trente : on part d'un parking tiré au hasard, on essaie des variantes et on garde celles dont
 * la composante est au moins aussi profonde (escalade), jusqu'à pouvoir y choisir une position à la bonne
 * distance de la sortie. Une escalade qui stagne repart d'un autre tirage. `avoid` écarte des parkings déjà
 * retenus. Même résultat pour une même graine ; échoue après `climbs` escalades de `steps` variantes.
 */
export function generateBoard(
  moves: number,
  seed: number,
  avoid: ReadonlySet<string> = new Set(),
  climbs = MAX_CLIMBS,
  steps = CLIMB_STEPS,
): Board {
  const random = createRandom(seed);
  const choose = (component: Component | null): Board | undefined => {
    if (!component || component.depth < moves) return undefined;
    const candidates = component.at(moves).filter((candidate) => !avoid.has(boardToString(candidate)));
    return candidates[Math.floor(random() * candidates.length)];
  };
  for (let climb = 0; climb < climbs; climb++) {
    let board = randomBoard(START_VEHICLES, random);
    let component = exploreComponent(board, COMPONENT_LIMIT);
    let chosen = choose(component);
    for (let step = 0; !chosen && step < steps; step++) {
      const variant = mutate(board, random);
      const explored = variant && exploreComponent(variant, COMPONENT_LIMIT);
      if (!variant || !explored || explored.depth < (component?.depth ?? 0)) continue;
      board = variant;
      component = explored;
      chosen = choose(component);
    }
    if (chosen) return chosen;
  }
  throw new Error(`aucun parking de ${moves} coups après ${climbs} escalades`);
}

/* ---------- Campagne ---------- */

/** Coups de la solution la plus courte au premier niveau. */
export const EASIEST_MOVES = 6;

/**
 * Coups de la solution la plus courte au dernier niveau. Les parkings de 6 × 6 les plus difficiles en demandent
 * 51 ; l'escalade dépasse rarement 45 en quelques minutes.
 */
export const HARDEST_MOVES = 45;

/** Coups de la solution la plus courte du niveau `level` : de EASIEST_MOVES au niveau 1 à HARDEST_MOVES au dernier. */
export const campaignMoves = (level: number): number =>
  EASIEST_MOVES + Math.floor(((level - 1) * (HARDEST_MOVES - EASIEST_MOVES)) / (MAX_LEVEL - 1));

/** Parking enregistré du niveau `level`, à partir de sa propre graine. */
export const generateLevel = (level: number, avoid?: ReadonlySet<string>): Board =>
  generateBoard(campaignMoves(level), level, avoid);

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
