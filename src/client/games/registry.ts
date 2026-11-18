// Jeux disponibles côté client. Ajouter un jeu = l'ajouter ici et dans shared/games/registry.ts.

import { bouquetsClient } from './bouquets/index.ts';
import type { ClientGame } from './client-game.ts';
import { couteauxClient } from './couteaux/index.ts';
import { fiolesClient } from './fioles/index.ts';
import { pandasClient } from './pandas/index.ts';
import { parkingClient } from './parking/index.ts';

export const CLIENT_GAMES: ReadonlyMap<string, ClientGame> = new Map(
  [fiolesClient, bouquetsClient, pandasClient, parkingClient, couteauxClient].map((game) => [game.definition.id, game]),
);

export const findClientGame = (id: string): ClientGame | null => CLIENT_GAMES.get(id) ?? null;
