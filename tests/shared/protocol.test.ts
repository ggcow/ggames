import { describe, expect, it } from 'vitest';
import { findGame, GAMES } from '../../src/shared/games/registry.ts';
import {
  cleanName,
  isGameId,
  isRunStatus,
  isValidPassword,
  LIMITS,
  parseClientMessage,
  parseDuration,
  parseServerMessage,
  ROUTES,
} from '../../src/shared/platform/protocol.ts';
import { cleanText, isId, isRecord, parseJson } from '../../src/shared/platform/validate.ts';

describe('validation de base', () => {
  it('isRecord', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it('isId', () => {
    expect(isId('abc123')).toBe(true);
    expect(isId('ABC123')).toBe(false);
    expect(isId('abc')).toBe(false);
  });

  it('cleanText normalise les espaces et coupe sans casser les caractères', () => {
    expect(cleanText('  a   b  ', 10)).toBe('a b');
    expect(cleanText('😀😀😀', 2)).toBe('😀😀');
    expect(cleanText(5, 10)).toBe('');
  });

  it('parseJson ne lève jamais', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('{')).toBeUndefined();
  });
});

describe('champs du protocole', () => {
  it('cleanName', () => {
    expect(cleanName('  小明  ')).toBe('小明');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(40))).toHaveLength(LIMITS.name);
  });

  it('isValidPassword', () => {
    expect(isValidPassword('abcd')).toBe(true);
    expect(isValidPassword('abc')).toBe(false);
    expect(isValidPassword('a'.repeat(LIMITS.passwordMax + 1))).toBe(false);
  });

  it('isRunStatus, parseDuration, isGameId', () => {
    expect(isRunStatus('won')).toBe(true);
    expect(isRunStatus('draw')).toBe(false);
    expect(parseDuration(0)).toBe(0);
    expect(parseDuration(-1)).toBeNull();
    expect(parseDuration(1.5)).toBeNull();
    expect(isGameId('fioles')).toBe(true);
    expect(isGameId('Fioles')).toBe(false);
  });

  it('construit les routes', () => {
    expect(ROUTES.playerDetail('fioles', 'abc123')).toBe('/api/games/fioles/players/abc123');
    expect(ROUTES.run('abc123')).toBe('/api/runs/abc123');
  });
});

describe('messages temps réel', () => {
  it('parse une activité valide', () => {
    const msg = { type: 'activity', game: 'fioles', key: 'c:1', state: 'ab', value: 3 };
    expect(parseClientMessage(JSON.stringify(msg))).toEqual(msg);
    expect(parseClientMessage('{"type":"idle"}')).toEqual({ type: 'idle' });
  });

  it.each([
    'pas du json',
    '[]',
    '{"type":"activity","game":"fioles","key":"c:1","state":"ab","value":-1}',
    '{"type":"activity","game":"Fioles","key":"c:1","state":"ab","value":1}',
    `{"type":"activity","game":"fioles","key":"${'k'.repeat(41)}","state":"","value":1}`,
    '{"type":"autre"}',
  ])('rejette %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it('parse une réaction valide et rejette les codes inconnus', () => {
    const msg = { type: 'reaction', game: 'fioles', key: 'c:1', code: 'thumbs' };
    expect(parseClientMessage(JSON.stringify(msg))).toEqual(msg);
    expect(parseClientMessage('{"type":"reaction","game":"fioles","key":"c:1","code":"inconnu"}')).toBeNull();
    expect(parseClientMessage('{"type":"reaction","game":"fioles","code":"thumbs"}')).toBeNull();
  });

  it('parse les messages serveur et filtre les présences invalides', () => {
    expect(parseServerMessage('{"type":"changed","game":null}')).toEqual({ type: 'changed', game: null });
    const good = { player: 'abc123', name: 'Léa', game: null, key: null, state: null, value: 0 };
    const raw = JSON.stringify({ type: 'presence', online: [good, { player: 'X' }] });
    expect(parseServerMessage(raw)).toEqual({ type: 'presence', online: [good] });
    expect(parseServerMessage('{"type":"changed","game":"BAD"}')).toBeNull();
  });

  it('parse une réaction serveur et rejette ses champs invalides', () => {
    const reaction = { game: 'fioles', key: 'c:1', player: 'abc123', name: 'Léa', code: 'nice', at: 123 };
    expect(parseServerMessage(JSON.stringify({ type: 'reaction', reaction }))).toEqual({ type: 'reaction', reaction });
    expect(
      parseServerMessage(JSON.stringify({ type: 'reaction', reaction: { ...reaction, code: 'inconnu' } })),
    ).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'reaction', reaction: { ...reaction, at: 0 } }))).toBeNull();
    expect(parseServerMessage('{"type":"reaction"}')).toBeNull();
  });
});

describe('registre des jeux', () => {
  it('contient fioles et ignore les identifiants inconnus', () => {
    expect([...GAMES.keys()]).toEqual(['fioles']);
    expect(findGame('fioles')?.id).toBe('fioles');
    expect(findGame('autre')).toBeNull();
    expect(findGame(42)).toBeNull();
  });
});
