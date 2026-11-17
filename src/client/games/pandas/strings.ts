import { defineStrings } from '../../platform/i18n.ts';

export const PANDAS_STRINGS = defineStrings({
  fr: {
    name: 'Pandas',
    tagline: "Un panda par ligne, par colonne et par bosquet, sans qu'ils se touchent.",
    level: (n: number) => `Niveau ${n}`,
    moves: (n: number) => (n === 1 ? '1 coup' : `${n} coups`),
    hint: "Touche une case : une croix pour l'écarter, puis un panda, puis rien.",
    undo: '↶ Annuler',
    restart: '⟲ Recommencer',
    cell: (row: number, col: number) => `Ligne ${row}, colonne ${col}`,
    panda: 'panda',
    mark: 'écartée',
  },
  zh: {
    name: '熊猫',
    tagline: '每行、每列、每片竹林各放一只熊猫，熊猫互不相邻。',
    level: (n: number) => `第 ${n} 关`,
    moves: (n: number) => `${n} 步`,
    hint: '点一下格子：先打叉排除，再放熊猫，再点清空。',
    undo: '↶ 撤销',
    restart: '⟲ 重来',
    cell: (row: number, col: number) => `第 ${row} 行，第 ${col} 列`,
    panda: '熊猫',
    mark: '已排除',
  },
});

export type PandasStrings = (typeof PANDAS_STRINGS)['fr'];
