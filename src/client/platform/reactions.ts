// Traductions des réactions texte. Les emojis du catalogue n'ont pas de traduction : ils ne passent
// jamais par ce dictionnaire.

import { findReaction, type ReactionCode, type TextReactionCode } from '../../shared/platform/reactions.ts';
import { defineStrings, type Lang } from './i18n.ts';

export const REACTION_TEXTS = defineStrings<Record<TextReactionCode, string>>({
  fr: {
    nice: 'Bien joué',
    wait: 'Attends-moi',
    almost: 'Presque',
    bravo: 'Bravo',
    again: 'Encore',
    luck: 'Bonne chance',
  },
  zh: {
    nice: '干得好',
    wait: '等等我',
    almost: '差一点',
    bravo: '恭喜',
    again: '再来',
    luck: '祝你好运',
  },
});

/** Texte affiché pour une réaction : l'emoji tel quel, ou la phrase dans la langue du lecteur. */
export function reactionLabel(code: ReactionCode, lang: Lang): string {
  const reaction = findReaction(code);
  if (!reaction) return '';
  return reaction.kind === 'emoji' ? reaction.emoji : REACTION_TEXTS[lang][reaction.code];
}
