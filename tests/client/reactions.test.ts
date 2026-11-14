import { describe, expect, it } from 'vitest';
import { REACTION_TEXTS, reactionLabel } from '../../src/client/platform/reactions.ts';
import { REACTIONS } from '../../src/shared/platform/reactions.ts';

const textCodes = REACTIONS.filter((reaction) => reaction.kind === 'text')
  .map((reaction) => reaction.code)
  .sort();

describe('libellés des réactions', () => {
  it('traduit chaque réaction texte en français et en chinois', () => {
    expect(Object.keys(REACTION_TEXTS.fr).sort()).toEqual(textCodes);
    expect(Object.keys(REACTION_TEXTS.zh).sort()).toEqual(textCodes);
  });

  it('rend les emojis tels quels et les textes dans la langue demandée', () => {
    expect(reactionLabel('thumbs', 'fr')).toBe('👍');
    expect(reactionLabel('nice', 'fr')).toBe('Bien joué');
    expect(reactionLabel('nice', 'zh')).toBe('干得好');
  });
});
