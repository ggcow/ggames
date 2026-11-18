import { defineStrings } from '../../platform/i18n.ts';

export const COUTEAUX_STRINGS = defineStrings({
  fr: {
    name: 'Couteaux',
    tagline: 'Plante tous tes couteaux dans la planète qui tourne, sans toucher les autres.',
    level: (n: number) => `Niveau ${n}`,
    misses: (n: number) => (n <= 1 ? `${n} erreur` : `${n} erreurs`),
    hint: "Touche l'écran pour lancer un couteau. S'il touche un couteau planté, il rebondit : trois rebonds et c'est perdu.",
    lives: (left: number) => (left === 1 ? '1 vie restante' : `${left} vies restantes`),
    left: (n: number) => (n === 1 ? '1 couteau à planter' : `${n} couteaux à planter`),
    restart: '⟲ Recommencer',
    target: 'Planète, toucher pour lancer un couteau',
  },
  zh: {
    name: '飞刀',
    tagline: '把飞刀全部扎进旋转的星球，别碰到已经扎着的刀。',
    level: (n: number) => `第 ${n} 关`,
    misses: (n: number) => `失误 ${n} 次`,
    hint: '点屏幕扔出飞刀。碰到已经扎着的刀会被弹开：弹开三次就输了。',
    lives: (left: number) => `剩余 ${left} 条命`,
    left: (n: number) => `还要扎 ${n} 把刀`,
    restart: '⟲ 重来',
    target: '星球，点一下扔出飞刀',
  },
});

export type CouteauxStrings = (typeof COUTEAUX_STRINGS)['fr'];
