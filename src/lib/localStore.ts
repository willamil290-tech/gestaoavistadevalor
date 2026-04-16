// Fallback em memória quando localStorage falhar
const memoryStore = new Map<string, string>();
let localStorageAvailable = true;

// Verifica se localStorage está realmente disponível
function checkLocalStorage() {
  if (!localStorageAvailable) return false;
  try {
    const test = "__test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn("[LocalStore] localStorage não disponível:", e);
    localStorageAvailable = false;
    return false;
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    if (!checkLocalStorage()) {
      const raw = memoryStore.get(key);
      if (raw) {
        return JSON.parse(raw) as T;
      }
      return fallback;
    }

    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[LocalStore] Erro ao carregar '${key}':`, e);
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    const serialized = JSON.stringify(value);

    if (checkLocalStorage()) {
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch (e) {
        console.warn("[LocalStore] Erro ao salvar no localStorage, usando memória como fallback:", e);
      }
    }

    memoryStore.set(key, serialized);
  } catch (e) {
    console.error(`[LocalStore] Erro ao serializar '${key}':`, e);
  }
}

export function removeKey(key: string): void {
  try {
    if (checkLocalStorage()) {
      localStorage.removeItem(key);
    }
    memoryStore.delete(key);
  } catch (e) {
    console.error(`[LocalStore] Erro ao remover '${key}':`, e);
  }
}

export function isUsingMemoryStore(): boolean {
  return !localStorageAvailable;
}

export function getStorageStats() {
  let localStorageSize = 0;
  if (checkLocalStorage()) {
    try {
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          localStorageSize += localStorage[key].length + key.length;
        }
      }
    } catch (e) {
      console.error("[LocalStore] Erro ao calcular tamanho:", e);
    }
  }

  let memorySize = 0;
  for (const [key, value] of memoryStore) {
    memorySize += key.length + value.length;
  }

  return {
    localStorageSize,
    memorySize,
    totalSize: localStorageSize + memorySize,
    usingMemoryStore: isUsingMemoryStore(),
    localStorageAvailable: checkLocalStorage(),
  };
}

