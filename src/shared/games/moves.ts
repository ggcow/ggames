// Jeux au tour par tour : une annulation efface le dernier coup restant. Le score compte les coups qui restent, et
// un replay se regarde sur ces seuls coups, le chemin final.

/** Coups qui restent d'une suite d'actions où `undo` efface le dernier coup restant, dans l'ordre joué. */
export function keptMoves<A extends { type: string }>(actions: readonly A[]): A[] {
  const kept: A[] = [];
  for (const action of actions) {
    if (action.type === 'undo') kept.pop();
    else kept.push(action);
  }
  return kept;
}

/** Nombre de coups d'une partie : chaque coup en ajoute un, chaque annulation en retire un. */
export const countMoves = (actions: readonly { type: string }[]): number => keptMoves(actions).length;
