import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  couteaux,
  decodeThrows,
  encodeThrows,
  levelOf,
  playThrows,
  startLevel,
} from '../../src/shared/games/couteaux/definition.ts';
import { perfectThrows } from '../../src/shared/games/couteaux/generate.ts';
import { LEVELS } from '../../src/shared/games/couteaux/levels.ts';
import { LIVES, levelToString, parseLevel, THROW_TICKS } from '../../src/shared/games/couteaux/rules.ts';
import { couteauxLevel, couteauxLoss, couteauxWin, couteauxWinWithMiss } from '../support/couteaux.ts';

describe('niveaux enregistrés', () => {
  it('compte 100 niveaux valides et tous différents', () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL);
    expect(new Set(LEVELS).size).toBe(MAX_LEVEL);
    for (const text of LEVELS) {
      const level = parseLevel(text);
      expect(level).not.toBeNull();
      if (level) expect(levelToString(level)).toBe(text);
    }
  });

  it('se gagnent tous sans rebond', () => {
    LEVELS.forEach((_, index) => {
      expect(perfectThrows(couteauxLevel(index + 1))).not.toBeNull();
    });
  });

  it('trouve le niveau d’une clé de la campagne', () => {
    expect(startLevel('c:1')).toEqual(levelOf(1));
    expect(levelOf(0)).toBeNull();
    expect(levelOf(MAX_LEVEL + 1)).toBeNull();
    expect(startLevel('c:0')).toBeNull();
    expect(startLevel('x')).toBeNull();
  });
});

describe('replays', () => {
  it('écrit chaque lancer depuis le précédent, en base 36, et relit ce qu’il écrit', () => {
    expect(encodeThrows([])).toBe('');
    expect(encodeThrows([40, 46, 100])).toBe('14.6.1i');
    expect(decodeThrows('14.6.1i')).toEqual([40, 46, 100]);
    expect(decodeThrows('')).toEqual([]);
  });

  it('refuse un replay illisible', () => {
    for (const replay of ['.', '1..2', 'A', '12345', '1.', '-1']) expect(decodeThrows(replay)).toBeNull();
  });

  it('rejoue chaque lancer et s’arrête sur un lancer impossible', () => {
    const level = couteauxLevel(1);
    const win = couteauxWin(1);
    const states = playThrows(level, win);
    expect(states).toHaveLength(win.length + 1);
    expect(states?.[win.length]?.planted).toHaveLength(level.knives);
    const [first = 0] = win;
    expect(playThrows(level, [first, first + THROW_TICKS - 1])).toBeNull();
  });
});

describe('définition', () => {
  it('suit la campagne commune', () => {
    expect(couteaux.id).toBe('couteaux');
    expect(couteaux.scoreOrder).toBe('asc');
    expect(couteaux.isValidKey('c:1')).toBe(true);
    expect(couteaux.isValidKey('c:101')).toBe(false);
    expect(couteaux.isUnlocked('c:2', new Set(['c:1']))).toBe(true);
    expect(couteaux.isUnlocked('c:3', new Set(['c:1']))).toBe(false);
    expect(couteaux.compareKeys('c:2', 'c:10')).toBeLessThan(0);
  });

  it('compte une victoire sans rebond à zéro erreur, le meilleur score possible', () => {
    expect(couteaux.replay('c:1', encodeThrows(couteauxWin(1)))).toEqual({ finished: true, value: 0 });
    expect(couteaux.bestPossible('c:1')).toBe(0);
    expect(couteaux.bestPossible(`c:${MAX_LEVEL}`)).toBe(0);
    expect(couteaux.bestPossible('c:0')).toBeNull();
  });

  it('compte les rebonds d’une victoire', () => {
    expect(couteaux.replay('c:1', encodeThrows(couteauxWinWithMiss(1)))).toEqual({ finished: true, value: 1 });
  });

  it('perd au troisième rebond, sans victoire possible ensuite', () => {
    const loss = couteauxLoss(1);
    expect(couteaux.replay('c:1', encodeThrows(loss))).toEqual({ finished: false, value: LIVES });
    expect(couteaux.replay('c:1', encodeThrows([...loss, (loss[loss.length - 1] ?? 0) + 100]))).toBeNull();
  });

  it('refuse un replay illisible, impossible ou sur une clé inconnue', () => {
    expect(couteaux.replay('c:1', 'A')).toBeNull();
    expect(couteaux.replay('c:1', '0.1')).toBeNull();
    expect(couteaux.replay('c:0', '')).toBeNull();
    expect(couteaux.replay('c:1', '')).toEqual({ finished: false, value: 0 });
  });
});
