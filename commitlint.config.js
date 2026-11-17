// Messages de commit : Conventional Commits (https://www.conventionalcommits.org).
// Format : <type>(<portée>): <résumé à l'impératif>
// La portée est facultative ; si elle est présente, elle doit faire partie de la liste.

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['platform', 'worker', 'client', 'shared', 'fioles', 'bouquets', 'pandas', 'ci', 'deps', 'release'],
    ],
    'subject-case': [0],
    'body-max-line-length': [2, 'always', 100],
  },
};
