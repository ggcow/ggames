import { defineStrings } from '../../platform/i18n.ts';

export const PANDAS_STRINGS = defineStrings({
  fr: {
    name: 'Pandas',
    tagline: "Un panda par ligne, par colonne et par bosquet, sans qu'ils se touchent.",
    level: (n: number) => `Niveau ${n}`,
    hint: "Toucher : mettre ou enlever une croix. Double toucher ou clic droit : tenter un panda. Trois erreurs et c'est perdu.",
    lives: (left: number) => (left === 1 ? '1 vie restante' : `${left} vies restantes`),
    restart: '⟲ Recommencer',
    cell: (row: number, col: number) => `Ligne ${row}, colonne ${col}`,
    panda: 'panda',
    mark: 'écartée',
    miss: 'erreur',
  },
  zh: {
    name: '熊猫',
    tagline: '每行、每列、每片竹林各放一只熊猫，熊猫互不相邻。',
    level: (n: number) => `第 ${n} 关`,
    hint: '点一下：打叉或取消。双击或右键：尝试放熊猫。错三次就输了。',
    lives: (left: number) => `剩余 ${left} 条命`,
    restart: '⟲ 重来',
    cell: (row: number, col: number) => `第 ${row} 行，第 ${col} 列`,
    panda: '熊猫',
    mark: '已排除',
    miss: '错误',
  },
});

export type PandasStrings = (typeof PANDAS_STRINGS)['fr'];
