import { describe, expect, it } from 'vitest';
import {
  campaignBoard,
  campaignColors,
  campaignKey,
  customKey,
  decodeActions,
  encodeActions,
  type FiolesAction,
  fioles,
  parseFiolesKey,
  playActions,
  startBoard,
} from '../../src/shared/games/fioles/definition.ts';
import { boardToString, isSolvable, isSolved, MAX_COLORS, parseBoard } from '../../src/shared/games/fioles/rules.ts';
import { solve } from '../support/fioles-solver.ts';

describe('campagne', () => {
  it('augmente les couleurs tous les 3 niveaux jusqu’au maximum', () => {
    expect([1, 3, 4, 6, 7].map(campaignColors)).toEqual([3, 3, 4, 4, 5]);
    expect(campaignColors(500)).toBe(MAX_COLORS);
  });

  it('génère les niveaux 1 à 40 valides, faisables et identiques à chaque appel', () => {
    for (let level = 1; level <= 40; level++) {
      const board = campaignBoard(level);
      expect(board).toHaveLength(campaignColors(level) + 2);
      expect(parseBoard(boardToString(board))).not.toBeNull();
      expect(isSolved(board)).toBe(false);
      expect(isSolvable(board, 500_000)).toBe(true);
      expect(campaignBoard(level)).toEqual(board);
    }
  });

  it('renvoie une copie : modifier le plateau ne change pas le niveau', () => {
    const board = campaignBoard(2);
    board[0]?.pop();
    expect(campaignBoard(2)).not.toEqual(board);
  });
});

describe('clés', () => {
  it('reconnaît campagne et niveaux créés', () => {
    expect(parseFiolesKey(campaignKey(12))).toEqual({ kind: 'campaign', level: 12 });
    expect(parseFiolesKey(customKey('abc123'))).toEqual({ kind: 'custom', contentId: 'abc123' });
    expect(fioles.parseKey('c:3')).toEqual({ kind: 'builtin' });
    expect(fioles.parseKey('l:abc123')).toEqual({ kind: 'content', contentId: 'abc123' });
  });

  it.each(['c:0', 'c:01', 'c:10000', 'l:ABC', 'l:abc', 'x:1', ''])('rejette %s', (key) => {
    expect(parseFiolesKey(key)).toBeNull();
    expect(fioles.parseKey(key)).toBeNull();
  });
});

describe('replays', () => {
  const actions: FiolesAction[] = [
    { type: 'pour', from: 0, to: 15 },
    { type: 'undo' },
    { type: 'pour', from: 10, to: 2 },
  ];

  it('encode et décode les actions', () => {
    expect(encodeActions(actions)).toBe('0fua2');
    expect(decodeActions('0fua2')).toEqual(actions);
    expect(decodeActions('')).toEqual([]);
  });

  it.each(['0', 'zz', '0g', 'U'])('rejette un replay mal formé : %s', (replay) => {
    expect(decodeActions(replay)).toBeNull();
  });

  it('rejoue les états et gère l’annulation', () => {
    const start = [[0, 1], [1], []];
    const states = playActions(start, [
      { type: 'pour', from: 0, to: 1 },
      { type: 'undo' },
      { type: 'pour', from: 0, to: 2 },
    ]);
    expect(states).toEqual([start, [[0], [1, 1], []], start, [[0], [1], [1]]]);
  });

  it('refuse une action impossible ou une annulation sans historique', () => {
    expect(playActions([[0], [1], []], [{ type: 'pour', from: 0, to: 1 }])).toBeNull();
    expect(playActions([[0], []], [{ type: 'undo' }])).toBeNull();
  });

  it('valide une victoire et compte chaque action comme un coup', () => {
    const board = campaignBoard(1);
    const win = solve(board);
    if (!win) throw new Error('pas de solution');
    const withUndo: FiolesAction[] = [win[0] as FiolesAction, { type: 'undo' }, ...win];
    expect(fioles.replay('c:1', null, encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(fioles.replay('c:1', null, encodeActions(withUndo))).toEqual({ finished: true, value: win.length + 2 });
    expect(fioles.replay('c:1', null, encodeActions(win.slice(0, 1)))).toEqual({ finished: false, value: 1 });
  });

  it('refuse des actions après la victoire', () => {
    const data = 'aaab.bbba..';
    const win = solve(parseBoard(data) ?? []);
    if (!win) throw new Error('pas de solution');
    const extra = encodeActions([...win, { type: 'undo' }]);
    expect(fioles.replay('l:abcdef', data, extra)).toBeNull();
  });

  it('exige les données du contenu pour un niveau créé', () => {
    expect(startBoard('l:abcdef', null)).toBeNull();
    expect(fioles.replay('l:abcdef', null, '')).toBeNull();
  });
});

describe('contenus', () => {
  it('accepte un plateau valide non résolu', () => {
    expect(fioles.isValidContent('abab.baba..')).toBe(true);
  });

  it('refuse un plateau résolu ou invalide', () => {
    expect(fioles.isValidContent('aaaa.bbbb..')).toBe(false);
    expect(fioles.isValidContent('aab.bba..')).toBe(false);
  });

  it('donne la clé de partie d’un contenu', () => {
    expect(fioles.contentKey('abc123')).toBe('l:abc123');
  });
});
