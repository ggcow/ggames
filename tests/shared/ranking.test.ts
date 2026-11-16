import { describe, expect, it } from 'vitest';
import { competitionRanks } from '../../src/shared/platform/ranking.ts';

describe('classement', () => {
  const sameValue = (a: number, b: number) => a === b;

  it('donne le même rang aux ex æquo et saute les rangs suivants', () => {
    expect(competitionRanks([10, 10, 12, 15, 15, 15, 20], sameValue)).toEqual([1, 1, 3, 4, 4, 4, 7]);
  });

  it('numérote simplement une liste sans égalité, et rien pour une liste vide', () => {
    expect(competitionRanks([3, 5, 8], sameValue)).toEqual([1, 2, 3]);
    expect(competitionRanks([], sameValue)).toEqual([]);
  });
});
