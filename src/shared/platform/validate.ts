/** Garde de type pour un objet JSON simple (pas un tableau, pas null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Identifiant généré par le serveur : 6 à 20 caractères base 36. */
export const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{6,20}$/.test(value);

/** Nettoie un texte libre : espaces normalisés, coupé à `max` caractères. */
export const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? [...value.replace(/\s+/g, ' ').trim()].slice(0, max).join('') : '';

/** Parse du JSON sans lever d'exception. */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
