import { describe, expect, it } from 'vitest';
import { competitionRanks, recordStanding } from '../../src/shared/platform/ranking.ts';

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

describe('place face au record', () => {
  const others = [
    { player: 'léa', value: 10 },
    { player: 'tom', value: 10 },
    { player: 'zoé', value: 12 },
  ];

  it('donne le record à un score meilleur que tous les autres, ou au seul gagnant', () => {
    expect(recordStanding(9, others, 'asc')).toEqual({ kind: 'record' });
    expect(recordStanding(13, [{ player: 'léa', value: 12 }], 'desc')).toEqual({ kind: 'record' });
    expect(recordStanding(30, [], 'asc')).toEqual({ kind: 'record' });
  });

  it('partage le record avec tous les ex æquo', () => {
    expect(recordStanding(10, others, 'asc')).toEqual({ kind: 'shared', with: ['léa', 'tom'] });
  });

  it('ne donne rien à un score en dessous du record, même à égalité avec un autre', () => {
    expect(recordStanding(12, others, 'asc')).toEqual({ kind: 'below' });
    expect(recordStanding(11, [{ player: 'léa', value: 12 }], 'desc')).toEqual({ kind: 'below' });
  });
});
