import { describe, expect, it } from 'vitest';
import { AVATARS, derivedAvatar, hashId, isAvatar, pickAvatar } from '../../src/shared/platform/avatars.ts';

describe('catalogue des avatars', () => {
  it('ne contient que des emojis distincts d’un seul caractère', () => {
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    for (const avatar of AVATARS) expect([...avatar]).toHaveLength(1);
  });

  it('reconnaît un animal du catalogue, et rien d’autre', () => {
    expect(isAvatar('🐶')).toBe(true);
    expect(isAvatar('🚗')).toBe(false);
    expect(isAvatar(1)).toBe(false);
    expect(isAvatar(null)).toBe(false);
  });

  it('tire toujours le même animal d’un identifiant', () => {
    expect(hashId('abc123')).toBe(hashId('abc123'));
    expect(derivedAvatar('abc123')).toBe(derivedAvatar('abc123'));
    expect(AVATARS).toContain(derivedAvatar('abc123'));
  });

  it('propose l’animal tiré de l’identifiant, sinon le premier libre, sinon rien', () => {
    const preferred = derivedAvatar('abc123');
    expect(pickAvatar('abc123', new Set())).toBe(preferred);
    const first = AVATARS.find((avatar) => avatar !== preferred);
    expect(pickAvatar('abc123', new Set([preferred]))).toBe(first);
    expect(pickAvatar('abc123', new Set(AVATARS))).toBeNull();
  });
});
