import { describe, expect, it } from 'vitest';
import { findReaction, isReactionCode, REACTIONS } from '../../src/shared/platform/reactions.ts';

describe('catalogue des réactions', () => {
  it('a des codes uniques et chaque entrée est soit un emoji, soit un texte', () => {
    expect(new Set(REACTIONS.map((reaction) => reaction.code)).size).toBe(REACTIONS.length);
    for (const reaction of REACTIONS) {
      if (reaction.kind === 'emoji') {
        expect(reaction.emoji.length).toBeGreaterThan(0);
        expect('text' in reaction).toBe(false);
      } else {
        expect('emoji' in reaction).toBe(false);
      }
    }
  });

  it('retrouve une réaction par son code, sinon null', () => {
    expect(findReaction('thumbs')).toEqual({ kind: 'emoji', code: 'thumbs', emoji: '👍' });
    expect(findReaction('nice')).toEqual({ kind: 'text', code: 'nice' });
    expect(findReaction('middle')).toEqual({ kind: 'emoji', code: 'middle', emoji: '🖕' });
    expect(findReaction('inconnu')).toBeNull();
    expect(isReactionCode('fire')).toBe(true);
    expect(isReactionCode('inconnu')).toBe(false);
    expect(isReactionCode(42)).toBe(false);
  });
});
