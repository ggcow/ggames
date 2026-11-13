// Préférences locales de l'appareil. localStorage peut être bloqué ou vidé : chaque accès est protégé,
// et une valeur illisible est traitée comme absente.

const PREFIX = 'ggames.';

export interface LocalStore {
  get<T>(key: string, parse: (raw: unknown) => T | null): T | null;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export function createLocalStore(storage: Storage | null): LocalStore {
  return {
    get(key, parse) {
      try {
        const raw = storage?.getItem(PREFIX + key);
        return raw == null ? null : parse(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage?.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Stockage plein ou interdit : la préférence ne sera pas mémorisée.
      }
    },
    remove(key) {
      try {
        storage?.removeItem(PREFIX + key);
      } catch {
        // Idem.
      }
    },
  };
}

/** localStorage, ou null si son accès lève une exception (navigation privée stricte). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
