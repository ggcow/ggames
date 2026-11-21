import { defineStrings } from '../../platform/i18n.ts';

export const PANDAS_STRINGS = defineStrings({
  fr: {
    name: 'Pandas',
    tagline: "Un panda par ligne, par colonne et par bosquet, sans qu'ils se touchent.",
    level: (n: number) => `Niveau ${n}`,
    hint: (minutes: number) =>
      `Toucher : mettre ou enlever une croix. Triple toucher : tenter un panda. Une erreur et c'est perdu : le niveau se bloque ${minutes} minutes.`,
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
    hint: (minutes: number) => `点一下：打叉或取消。连点三下：尝试放熊猫。错一次就输了，这一关会锁定 ${minutes} 分钟。`,
    restart: '⟲ 重来',
    cell: (row: number, col: number) => `第 ${row} 行，第 ${col} 列`,
    panda: '熊猫',
    mark: '已排除',
    miss: '错误',
  },
});

export type PandasStrings = (typeof PANDAS_STRINGS)['fr'];
