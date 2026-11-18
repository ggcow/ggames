// Liste des jeux de la plateforme. Ajouter un jeu = ajouter sa définition ici.

import { bouquets } from './bouquets/definition.ts';
import { couteaux } from './couteaux/definition.ts';
import { fioles } from './fioles/definition.ts';
import type { GameDefinition } from './game.ts';
import { pandas } from './pandas/definition.ts';
import { parking } from './parking/definition.ts';

export const GAMES: ReadonlyMap<string, GameDefinition> = new Map(
  [fioles, bouquets, pandas, parking, couteaux].map((game) => [game.id, game]),
);

export function findGame(id: unknown): GameDefinition | null {
  return typeof id === 'string' ? (GAMES.get(id) ?? null) : null;
}
