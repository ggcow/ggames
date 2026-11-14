// Catalogue unique des réactions de course. Chaque entrée est soit un emoji, soit un texte traduit
// côté client : jamais les deux. Aucune réaction n'est conservée.

export const REACTIONS = [
  { kind: 'emoji', code: 'thumbs', emoji: '👍' },
  { kind: 'emoji', code: 'laugh', emoji: '😂' },
  { kind: 'emoji', code: 'fire', emoji: '🔥' },
  { kind: 'emoji', code: 'wow', emoji: '😮' },
  { kind: 'emoji', code: 'party', emoji: '🎉' },
  { kind: 'emoji', code: 'sweat', emoji: '😅' },
  { kind: 'text', code: 'nice' },
  { kind: 'text', code: 'wait' },
  { kind: 'text', code: 'almost' },
  { kind: 'text', code: 'bravo' },
  { kind: 'text', code: 'again' },
  { kind: 'text', code: 'luck' },
] as const;

export type Reaction = (typeof REACTIONS)[number];
export type ReactionCode = Reaction['code'];
export type TextReaction = Extract<Reaction, { kind: 'text' }>;
export type TextReactionCode = TextReaction['code'];

const BY_CODE = new Map<string, Reaction>(REACTIONS.map((reaction): [string, Reaction] => [reaction.code, reaction]));

/** Réaction associée à un code, ou null si le code n'est pas au catalogue. */
export const findReaction = (code: string): Reaction | null => BY_CODE.get(code) ?? null;

/** Vrai si `value` est un code du catalogue. */
export const isReactionCode = (value: unknown): value is ReactionCode =>
  typeof value === 'string' && BY_CODE.has(value);
