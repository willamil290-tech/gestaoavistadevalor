import { loadJson, saveJson, removeKey } from "@/lib/localStore";

// IndexedDB para persistência robusta
class IndexedDBStore {
  private db: IDBDatabase | null = null;
  private dbName = 'gestao_avista_db';
  private version = 1;

  async init(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao abrir banco:', request.error);
        resolve(false);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Banco aberto com sucesso');
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data');
        }
      };
    });
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    if (!this.db) {
      console.warn('[IndexedDB] DB não inicializado, usando localStorage');
      return loadJson(key, fallback);
    }

    return new Promise((resolve) => {
      const transaction = this.db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result !== undefined) {
          try {
            resolve(JSON.parse(request.result));
          } catch {
            resolve(fallback);
          }
        } else {
          resolve(fallback);
        }
      };

      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao ler:', request.error);
        resolve(loadJson(key, fallback)); // Fallback para localStorage
      };
    });
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.db) {
      console.warn('[IndexedDB] DB não inicializado, usando localStorage');
      saveJson(key, value);
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.put(JSON.stringify(value), key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao salvar:', request.error);
        saveJson(key, value); // Fallback para localStorage
        resolve();
      };
    });
  }

  async remove(key: string): Promise<void> {
    if (!this.db) {
      removeKey(key);
      return;
    }

    return new Promise((resolve) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao remover:', request.error);
        removeKey(key);
        resolve();
      };
    });
  }

  async clear(): Promise<void> {
    if (!this.db) {
      // Limpar localStorage keys que começam com nossos prefixos
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('acion') || key.startsWith('teamMembers') || key.startsWith('bitrix') || key.startsWith('tv')) {
          localStorage.removeItem(key);
        }
      });
      return;
    }

    return new Promise((resolve) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[IndexedDB] Erro ao limpar:', request.error);
        resolve();
      };
    });
  }
}

// Instância singleton
const indexedDBStore = new IndexedDBStore();

// Inicializar IndexedDB
let indexedDBReady = false;
indexedDBStore.init().then(success => {
  indexedDBReady = success;
  if (success) {
    console.log('[IndexedDB] Pronto para uso');
  } else {
    console.warn('[IndexedDB] Não disponível, usando localStorage como fallback');
  }
});

// Funções públicas com fallback automático
export async function loadFromDB<T>(key: string, fallback: T): Promise<T> {
  if (indexedDBReady) {
    return indexedDBStore.get(key, fallback);
  } else {
    return loadJson(key, fallback);
  }
}

export async function saveToDB(key: string, value: unknown): Promise<void> {
  if (indexedDBReady) {
    return indexedDBStore.set(key, value);
  } else {
    saveJson(key, value);
  }
}

export async function removeFromDB(key: string): Promise<void> {
  if (indexedDBReady) {
    return indexedDBStore.remove(key);
  } else {
    removeKey(key);
  }
}

export async function clearDB(): Promise<void> {
  return indexedDBStore.clear();
}

export function isIndexedDBAvailable(): boolean {
  return indexedDBReady;
}

// Estatísticas de uso
export async function getDBStats() {
  const localStorageStats = getStorageStats();
  const indexedDBStats = {
    available: indexedDBReady,
    dbName: indexedDBStore.dbName,
    version: indexedDBStore.version,
  };

  return {
    ...localStorageStats,
    indexedDB: indexedDBStats,
  };
}

// Importar getStorageStats do localStore
export { getStorageStats } from './localStore';