import { defineStrings } from '../../platform/i18n.ts';

export const FIOLES_STRINGS = defineStrings({
  fr: {
    name: 'Fioles',
    tagline: 'Trie les couleurs dans les fioles.',
    level: (n: number) => `Niveau ${n}`,
    moves: (n: number) => (n === 1 ? '1 coup' : `${n} coups`),
    undo: '↶ Annuler',
    restart: '⟲ Recommencer',
  },
  zh: {
    name: '试管排序',
    tagline: '把颜色分到各个试管里。',
    level: (n: number) => `第 ${n} 关`,
    moves: (n: number) => `${n} 步`,
    undo: '↶ 撤销',
    restart: '⟲ 重来',
  },
});

export type FiolesStrings = (typeof FIOLES_STRINGS)['fr'];
