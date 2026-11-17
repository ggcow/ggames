import { defineStrings } from '../../platform/i18n.ts';

export const PARKING_STRINGS = defineStrings({
  fr: {
    name: 'Parking',
    tagline: 'Fais glisser les voitures pour libérer la sortie de la rouge.',
    level: (n: number) => `Niveau ${n}`,
    moves: (n: number) => (n === 1 ? '1 coup' : `${n} coups`),
    hint: 'Glisse les véhicules le long de leur axe. La voiture rouge sort à droite.',
    undo: '↶ Annuler',
    restart: '⟲ Recommencer',
    vehicle: (red: boolean, horizontal: boolean) =>
      `${red ? 'Voiture rouge' : 'Véhicule'}, ${horizontal ? 'gauche-droite' : 'haut-bas'}`,
  },
  zh: {
    name: '停车场',
    tagline: '挪开其他车辆，让红色小车开出停车场。',
    level: (n: number) => `第 ${n} 关`,
    moves: (n: number) => `${n} 步`,
    hint: '沿车身方向拖动车辆。红色小车从右边出口开出。',
    undo: '↶ 撤销',
    restart: '⟲ 重来',
    vehicle: (red: boolean, horizontal: boolean) =>
      `${red ? '红色小车' : '车辆'}，${horizontal ? '左右移动' : '上下移动'}`,
  },
});

export type ParkingStrings = (typeof PARKING_STRINGS)['fr'];
