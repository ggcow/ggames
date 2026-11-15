// Score des jeux au tour par tour : on compte les coups qui restent sur le plateau. Chaque coup en ajoute un,
// chaque annulation en retire un.

/** Nombre de coups d'une suite d'actions où `undo` annule le coup précédent. */
export const countMoves = (actions: readonly { type: string }[]): number =>
  actions.reduce((moves, action) => moves + (action.type === 'undo' ? -1 : 1), 0);
