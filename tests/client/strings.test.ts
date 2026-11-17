import { describe, expect, it } from 'vitest';
import { BOUQUETS_STRINGS } from '../../src/client/games/bouquets/strings.ts';
import { FIOLES_STRINGS } from '../../src/client/games/fioles/strings.ts';
import { PANDAS_STRINGS } from '../../src/client/games/pandas/strings.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';

const DICTIONARIES = { PLATFORM_STRINGS, FIOLES_STRINGS, BOUQUETS_STRINGS, PANDAS_STRINGS };

/** Chaque texte d'un dictionnaire, les phrases à trous remplies avec des valeurs d'exemple. */
function texts(dictionary: Record<string, Record<string, unknown>>): string[] {
  return Object.values(dictionary).flatMap((strings) =>
    Object.values(strings).map((value) =>
      typeof value === 'function' ? String((value as (...args: unknown[]) => unknown)(1, 1, 1)) : String(value),
    ),
  );
}

describe('textes d’interface', () => {
  it.each(Object.entries(DICTIONARIES))('%s n’utilise que l’apostrophe droite', (_, dictionary) => {
    // La police arrondie du site laisse un blanc après l'apostrophe typographique (« l’ écarter »).
    expect(texts(dictionary).filter((text) => text.includes('’'))).toEqual([]);
  });
});
