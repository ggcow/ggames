// Langues de l'interface. Chaque dictionnaire de textes est défini pour toutes les langues ;
// le compilateur vérifie que les clés sont identiques.

export const LANGS = ['fr', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

/** Valeur traduite dans chaque langue. */
export type Localized<T> = Record<Lang, T>;

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);

export function detectLang(languages: readonly string[]): Lang {
  return languages.some((l) => l.toLowerCase().startsWith('zh')) ? 'zh' : 'fr';
}

/** Texte simple ou texte à paramètres. */
type Entry = string | ((...args: never[]) => string);
export type Dictionary = Record<string, Entry>;

/**
 * Déclare un dictionnaire : la version française fixe les clés et leurs signatures,
 * les autres langues doivent avoir exactement les mêmes.
 */
export const defineStrings = <D extends Dictionary>(strings: { fr: D } & Record<Exclude<Lang, 'fr'>, D>) => strings;

export function formatDuration(ms: number, lang: Lang): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (lang === 'zh') {
    if (hours > 0) return `${hours}小时${minutes}分`;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  }
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
}

export function formatDate(timestamp: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}
