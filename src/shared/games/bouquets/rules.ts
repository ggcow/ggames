// Règles du jeu Bouquets : déplacer des fleurs d'un pot à l'autre. Trois fleurs pareilles devant un pot forment un
// bouquet qui s'en va ; quand le devant d'un pot est vide, la couche suivante avance.
// Code pur, sans DOM ni Cloudflare : utilisé par le client, le serveur et les tests.
// La génération des niveaux est dans generate.ts.

/** Places d'une couche. */
export const SLOTS = 3;
/** Espèces de fleurs (index 0 à FLOWER_KINDS - 1). */
export const FLOWER_KINDS = 12;
export const MAX_POTS = 12;
/** Couches d'un pot au plus, devant compris. */
export const MAX_LAYERS = 6;

/** Une espèce de fleur, de 0 à FLOWER_KINDS - 1. */
export type Flower = number;
/** Une place : une fleur ou rien. */
export type Slot = Flower | null;
/** Une couche : SLOTS places. */
export type Layer = Slot[];
/** Un pot : ses couches, du devant (index 0) vers le fond. Seul le devant d'un pot vide peut être vide. */
export type Pot = Layer[];
export type Board = Pot[];
export type ReadonlyBoard = readonly (readonly (readonly Slot[])[])[];

/** Déplacer la fleur de la place `slot` du pot `from` vers la place libre `place` du pot `to`. */
export interface Move {
  from: number;
  slot: number;
  to: number;
  place: number;
}

/** Effets d'un coup, pour les animations. */
export interface MoveEffect {
  /** Le pot d'arrivée a formé un bouquet. */
  bouquet: boolean;
  /** Pots dont la couche suivante a avancé. */
  revealed: number[];
}

/* ---------- Utilitaires ---------- */

export const cloneBoard = (board: ReadonlyBoard): Board => board.map((pot) => pot.map((layer) => [...layer]));

export const isLayerEmpty = (layer: readonly Slot[]): boolean => layer.every((slot) => slot === null);

/** Devant d'un pot. */
export const frontOf = (pot: readonly (readonly Slot[])[]): readonly Slot[] => pot[0] ?? [];

export const isPotEmpty = (pot: readonly (readonly Slot[])[]): boolean => pot.length <= 1 && isLayerEmpty(frontOf(pot));

export const isSolved = (board: ReadonlyBoard): boolean => board.every(isPotEmpty);

/** Fleurs restantes sur le plateau, couches cachées comprises. */
export const flowerCount = (board: ReadonlyBoard): number =>
  board.reduce((total, pot) => total + pot.reduce((n, layer) => n + layer.filter((s) => s !== null).length, 0), 0);

/* ---------- Règles ---------- */

export function canMove(board: ReadonlyBoard, move: Move): boolean {
  if (move.from === move.to) return false;
  const flower = board[move.from]?.[0]?.[move.slot];
  return flower !== undefined && flower !== null && board[move.to]?.[0]?.[move.place] === null;
}

/** Fait avancer les couches d'un pot (modifié) tant que son devant est vide. Vrai si une couche a avancé. */
export function advance(pot: Pot): boolean {
  let advanced = false;
  while (pot.length > 1 && isLayerEmpty(pot[0] ?? [])) {
    pot.shift();
    advanced = true;
  }
  return advanced;
}

/** Joue un coup (modifie `board`). `null` si le coup est impossible. */
export function applyMove(board: Board, move: Move): MoveEffect | null {
  const source = board[move.from]?.[0];
  const target = board[move.to]?.[0];
  if (!source || !target || !canMove(board, move)) return null;
  target[move.place] = source[move.slot] ?? null;
  source[move.slot] = null;
  const bouquet = target.every((slot) => slot === target[move.place]);
  if (bouquet) target.fill(null);
  const revealed = [move.from, move.to].filter((index) => {
    const pot = board[index];
    return pot !== undefined && advance(pot);
  });
  return { bouquet, revealed };
}

/** Vrai si au moins un coup est possible : une fleur au devant d'un pot et une place libre dans un autre. */
export function hasMove(board: ReadonlyBoard): boolean {
  const withFlower = board.map((pot) => frontOf(pot).some((slot) => slot !== null));
  const withRoom = board.map((pot) => frontOf(pot).some((slot) => slot === null));
  return withFlower.some((has, from) => has && withRoom.some((room, to) => room && to !== from));
}

/* ---------- Encodage texte ---------- */

/** Une lettre par espèce (index = espèce). */
const LETTERS = 'abcdefghijkl';

const slotLetter = (slot: Slot): string => (slot === null ? '-' : (LETTERS[slot] ?? '?'));

/** Vrai si les trois places d'une couche portent la même fleur. */
const isTriple = (layer: readonly Slot[]): boolean => layer[0] !== null && layer.every((slot) => slot === layer[0]);

/**
 * Plateau -> texte, ex. "ab-/ccd.---" : pour chaque pot, ses couches du devant vers le fond séparées par `/`,
 * une lettre par fleur et `-` pour une place libre ; les pots séparés par `.`.
 */
export const boardToString = (board: ReadonlyBoard): string =>
  board.map((pot) => pot.map((layer) => layer.map(slotLetter).join('')).join('/')).join('.');

/**
 * Texte -> plateau. `null` si ce n'est pas un plateau de départ valide : 1 à MAX_POTS pots de 1 à MAX_LAYERS
 * couches, aucune couche cachée vide (et un devant vide seulement sans couche cachée), aucune couche de trois fleurs
 * pareilles, et chaque espèce présente par trois.
 */
export function parseBoard(text: string): Board | null {
  const pots = text.split('.');
  if (pots.length > MAX_POTS) return null;
  const counts = new Map<Flower, number>();
  const board: Board = [];
  for (const part of pots) {
    const layers = part.split('/');
    if (layers.length > MAX_LAYERS || !layers.every((layer) => /^[a-l-]{3}$/.test(layer))) return null;
    const pot: Pot = layers.map((layer) =>
      [...layer].map((letter) => (letter === '-' ? null : LETTERS.indexOf(letter))),
    );
    if (pot.some(isTriple) || pot.slice(pot.length > 1 ? 0 : 1).some(isLayerEmpty)) return null;
    for (const slot of pot.flat()) if (slot !== null) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    board.push(pot);
  }
  return [...counts.values()].every((count) => count % SLOTS === 0) ? board : null;
}

/* ---------- État diffusé en direct ---------- */

/** Ce que voient les autres joueurs d'un pot : son devant et le nombre de couches cachées. */
export interface LivePot {
  front: Slot[];
  hidden: number;
}

/** Plateau -> texte, ex. "ab-2.ccc0" : le devant de chaque pot (`-` = place libre) puis ses couches cachées. */
export const liveState = (board: ReadonlyBoard): string =>
  board.map((pot) => frontOf(pot).map(slotLetter).join('') + String(pot.length - 1)).join('.');

/**
 * Vrai si, d'après ce qu'on voit des pots, la partie ne peut plus être gagnée, même s'il reste des coups.
 * Un coup ne fait que déplacer une fleur vers une place libre : le nombre de places libres ne change qu'en
 * formant un bouquet ou en faisant avancer une couche. Avec au moins une place libre, trois fleurs pareilles
 * visibles peuvent toujours être réunies ; avec trois places libres, un devant peut toujours être vidé pour
 * faire avancer sa couche cachée. Sans l'un ou l'autre, les déplacements tournent en rond. Sans couche
 * cachée, chaque espèce restante est visible par trois : seul le premier cas se présente.
 */
export function isDeadEnd(pots: readonly LivePot[]): boolean {
  if (pots.every((pot) => pot.hidden === 0 && isLayerEmpty(pot.front))) return false;
  if (!hasMove(pots.map((pot) => [pot.front]))) return true;
  const counts = new Map<Flower, number>();
  for (const pot of pots) {
    for (const slot of pot.front) if (slot !== null) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  if ([...counts.values()].some((count) => count >= SLOTS)) return false;
  const free = pots.reduce((n, pot) => n + pot.front.filter((slot) => slot === null).length, 0);
  return free < SLOTS;
}

/** Texte -> pots vus de l'extérieur. `null` si ce n'est pas un état valide. */
export function parseLiveState(text: string): LivePot[] | null {
  const parts = text.split('.');
  if (parts.length > MAX_POTS) return null;
  const pots: LivePot[] = [];
  for (const part of parts) {
    const match = /^([a-l-]{3})(\d)$/.exec(part);
    if (!match?.[1] || !match[2]) return null;
    const front = [...match[1]].map((letter) => (letter === '-' ? null : LETTERS.indexOf(letter)));
    const hidden = Number(match[2]);
    if (hidden > MAX_LAYERS - 1 || (hidden > 0 && isLayerEmpty(front))) return null;
    pots.push({ front, hidden });
  }
  return pots;
}
