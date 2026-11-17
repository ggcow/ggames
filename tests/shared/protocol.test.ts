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
    expect(ROUTES.chat).toBe('/api/chat');
    expect(ROUTES.meAvatar).toBe('/api/me/avatar');
    expect(ROUTES.players).toBe('/api/players');
    expect(ROUTES.voices).toBe('/api/voices');
    expect(ROUTES.voice('abc123')).toBe('/api/voices/abc123');
    expect(ROUTES.raceVoices('fioles', 'c:1')).toBe('/api/games/fioles/voices?key=c%3A1');
    expect(ROUTES.raceVoice('abc123')).toBe('/api/race-voices/abc123');
    expect(ROUTES.raceVoiceRead('abc123')).toBe('/api/race-voices/abc123/read');
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

  it('nettoie et borne un message de salon, et rejette le vide', () => {
    expect(parseClientMessage('{"type":"chat","text":"  bonjour   à tous  "}')).toEqual({
      type: 'chat',
      text: 'bonjour à tous',
    });
    expect(parseClientMessage('{"type":"chat","text":"   "}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'chat', text: 'x'.repeat(600) }))).toEqual({
      type: 'chat',
      text: 'x'.repeat(LIMITS.chat),
    });
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

  it('parse un message de salon et rejette ses champs invalides', () => {
    const message = { id: 'abc123', player: 'def456', name: 'Léa', text: 'bonjour', at: 123 };
    expect(parseServerMessage(JSON.stringify({ type: 'chat', message }))).toEqual({ type: 'chat', message });
    expect(parseServerMessage(JSON.stringify({ type: 'chat', message: { ...message, text: '' } }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'chat', message: { ...message, id: 'X' } }))).toBeNull();
    expect(parseServerMessage('{"type":"chat"}')).toBeNull();
  });

  it('parse une note vocale de salon et une note de course', () => {
    const note = { id: 'abc123', player: 'def456', name: 'Léa', durationMs: 1200, mime: 'audio/webm', at: 123 };
    expect(parseServerMessage(JSON.stringify({ type: 'voice', note }))).toEqual({ type: 'voice', note });
    expect(parseServerMessage(JSON.stringify({ type: 'voice', note: { ...note, mime: 'text/plain' } }))).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ type: 'voice', note: { ...note, durationMs: LIMITS.voiceDurationMs + 1 } })),
    ).toBeNull();

    const race = { ...note, game: 'fioles', key: 'c:1', readCount: 0, total: 2, read: false };
    expect(parseServerMessage(JSON.stringify({ type: 'race_voice', note: race }))).toEqual({
      type: 'race_voice',
      note: race,
    });
    expect(parseServerMessage(JSON.stringify({ type: 'race_voice', note: { ...race, read: 'oui' } }))).toBeNull();

    const read = { id: 'abc123', player: 'def456', readCount: 1, total: 2 };
    expect(parseServerMessage(JSON.stringify({ type: 'race_voice_read', read }))).toEqual({
      type: 'race_voice_read',
      read,
    });
    expect(parseServerMessage(JSON.stringify({ type: 'race_voice_read', read: { ...read, total: -1 } }))).toBeNull();

    expect(parseServerMessage(JSON.stringify({ type: 'race_voice_gone', id: 'abc123' }))).toEqual({
      type: 'race_voice_gone',
      id: 'abc123',
    });
    expect(parseServerMessage(JSON.stringify({ type: 'race_voice_gone', id: 12 }))).toBeNull();
  });
});

describe('registre des jeux', () => {
  it('contient fioles, bouquets et pandas, et ignore les identifiants inconnus', () => {
    expect([...GAMES.keys()]).toEqual(['fioles', 'bouquets', 'pandas']);
    expect(findGame('pandas')?.id).toBe('pandas');
    expect(findGame('bouquets')?.id).toBe('bouquets');
    expect(findGame('fioles')?.id).toBe('fioles');
    expect(findGame('autre')).toBeNull();
    expect(findGame(42)).toBeNull();
  });
});
