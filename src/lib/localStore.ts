import { loadFromDB, saveToDB, removeFromDB, isIndexedDBAvailable } from './indexedDB';
import { loadFromSQLite, saveToSQLite, removeFromSQLite, isSQLiteAvailable } from './sqlite';

// Fallback em memória quando tudo falhar
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

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    // Prioridade: SQLite > IndexedDB > localStorage > memória

    // Tenta SQLite primeiro (mais robusto)
    if (isSQLiteAvailable()) {
      return await loadFromSQLite(key, fallback);
    }

    // Fallback para IndexedDB
    if (isIndexedDBAvailable()) {
      return await loadFromDB(key, fallback);
    }

    // Fallback para localStorage
    if (checkLocalStorage()) {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T;
      }
    }

    // Último fallback: memória
    const raw = memoryStore.get(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }

    return fallback;
  } catch (e) {
    console.error(`[LocalStore] Erro ao carregar '${key}':`, e);
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    const serialized = JSON.stringify(value);

    // Tenta SQLite primeiro
    if (isSQLiteAvailable()) {
      await saveToSQLite(key, value);
      return;
    }

    // Fallback para IndexedDB
    if (isIndexedDBAvailable()) {
      await saveToDB(key, value);
      return;
    }

    // Fallback para localStorage
    if (checkLocalStorage()) {
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch (e) {
        if ((e as any).code === 'QuotaExceededError') {
          console.warn("[LocalStore] localStorage cheio, usando memória como fallback");
        } else {
          console.error("[LocalStore] Erro ao salvar no localStorage:", e);
        }
      }
    }

    // Último fallback: memória
    memoryStore.set(key, serialized);
  } catch (e) {
    console.error(`[LocalStore] Erro ao serializar '${key}':`, e);
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    // Remove de SQLite
    if (isSQLiteAvailable()) {
      await removeFromSQLite(key);
    }

    // Remove de IndexedDB
    if (isIndexedDBAvailable()) {
      await removeFromDB(key);
    }

    // Remove de localStorage
    if (checkLocalStorage()) {
      localStorage.removeItem(key);
    }

    // Remove da memória
    memoryStore.delete(key);
  } catch (e) {
    console.error(`[LocalStore] Erro ao remover '${key}':`, e);
  }
}

// Funções síncronas para compatibilidade (usam apenas localStorage/memória)
export function loadJsonSync<T>(key: string, fallback: T): T {
  try {
    if (checkLocalStorage()) {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
    const raw = memoryStore.get(key);
    if (raw) return JSON.parse(raw) as T;
    return fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveJsonSync(key: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    if (checkLocalStorage()) {
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch (e) {
        console.warn("[LocalStore] localStorage cheio, usando memória");
      }
    }
    memoryStore.set(key, serialized);
  } catch (e) {
    console.error(`[LocalStore] Erro ao salvar '${key}':`, e);
  }
}

export function removeKeySync(key: string) {
  try {
    if (checkLocalStorage()) {
      localStorage.removeItem(key);
    }
    memoryStore.delete(key);
  } catch (e) {
    console.error(`[LocalStore] Erro ao remover '${key}':`, e);
  }
}

// Debug: mostra se está usando memória
export function isUsingMemoryStore(): boolean {
  return !localStorageAvailable && !isIndexedDBAvailable() && !isSQLiteAvailable();
}

// Debug: retorna tamanho aproximado dos dados salvos
export async function getStorageStats() {
  let localStorageSize = 0;
  if (checkLocalStorage()) {
    try {
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
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

  const indexedDBStats = isIndexedDBAvailable() ? { available: true } : { available: false };
  const sqliteStats = await getSQLiteStats();

  return {
    localStorageSize,
    memorySize,
    totalSize: localStorageSize + memorySize,
    usingMemoryStore: isUsingMemoryStore(),
    localStorageAvailable: checkLocalStorage(),
    indexedDBAvailable: isIndexedDBAvailable(),
    sqliteAvailable: isSQLiteAvailable(),
    sqliteStats,
  };
}

// Importar funções do SQLite para debug
export { getSQLiteStats, exportSQLiteData, importSQLiteData } from './sqlite';
