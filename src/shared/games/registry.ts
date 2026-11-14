// Liste des jeux de la plateforme. Ajouter un jeu = ajouter sa définition ici.

import { bouquets } from './bouquets/definition.ts';
import { fioles } from './fioles/definition.ts';
import type { GameDefinition } from './game.ts';

export const GAMES: ReadonlyMap<string, GameDefinition> = new Map([fioles, bouquets].map((game) => [game.id, game]));

export function findGame(id: unknown): GameDefinition | null {
  return typeof id === 'string' ? (GAMES.get(id) ?? null) : null;
}
