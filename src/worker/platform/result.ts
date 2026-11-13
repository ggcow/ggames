// Résultat d'un appel RPC au Durable Object. Les exceptions perdent leur type en traversant RPC :
// les erreurs attendues sont donc renvoyées comme des valeurs.

export type FailureStatus = 400 | 401 | 403 | 404 | 409 | 429;

export type Result<T> = { ok: true; value: T } | { ok: false; status: FailureStatus; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (status: FailureStatus, error: string): Result<never> => ({ ok: false, status, error });
