import { defineStrings } from '../../platform/i18n.ts';

const FLOWERS_FR = [
  'pivoine',
  'hortensia',
  'tournesol',
  'rose',
  'marguerite',
  'lavande',
  'tulipe',
  'iris',
  'dahlia',
  'renoncule',
  'pensée',
  'muguet',
];
const FLOWERS_ZH = [
  '牡丹',
  '绣球',
  '向日葵',
  '玫瑰',
  '雏菊',
  '薰衣草',
  '郁金香',
  '鸢尾',
  '大丽花',
  '花毛茛',
  '三色堇',
  '铃兰',
];

export const BOUQUETS_STRINGS = defineStrings({
  fr: {
    name: 'Bouquets',
    tagline: 'Réunis trois fleurs pareilles pour faire un bouquet.',
    level: (n: number) => `Niveau ${n}`,
    moves: (n: number) => (n === 1 ? '1 coup' : `${n} coups`),
    undo: '↶ Annuler',
    restart: '⟲ Recommencer',
    flower: (kind: number) => FLOWERS_FR[kind] ?? '?',
    layers: (n: number) => (n === 1 ? '1 couche cachée' : `${n} couches cachées`),
    stuck: 'Plus aucun coup possible : annule ou recommence.',
  },
  zh: {
    name: '花束',
    tagline: '把三朵相同的花扎成一束。',
    level: (n: number) => `第 ${n} 关`,
    moves: (n: number) => `${n} 步`,
    undo: '↶ 撤销',
    restart: '⟲ 重来',
    flower: (kind: number) => FLOWERS_ZH[kind] ?? '?',
    layers: (n: number) => `还有 ${n} 层`,
    stuck: '没有可走的步了：撤销或重来。',
  },
});

export type BouquetsStrings = (typeof BOUQUETS_STRINGS)['fr'];
