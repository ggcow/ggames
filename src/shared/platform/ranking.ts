// Classements : à égalité, même rang, et le rang suivant saute d'autant (« 1, 1, 3 »).

/** Rang de chaque élément d'une liste déjà triée ; `tied` dit si deux voisins sont à égalité. */
export function competitionRanks<T>(sorted: readonly T[], tied: (a: T, b: T) => boolean): number[] {
  const ranks: number[] = [];
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    const previousRank = ranks[index - 1];
    ranks.push(previous !== undefined && previousRank !== undefined && tied(previous, item) ? previousRank : index + 1);
  });
  return ranks;
}
