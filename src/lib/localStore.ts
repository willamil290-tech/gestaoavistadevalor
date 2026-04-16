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
    let raw: string | null = null;
    
    // Tenta localStorage primeiro
    if (checkLocalStorage()) {
      raw = localStorage.getItem(key);
    }
    
    // Se não achou no localStorage, tenta memoryStore
    if (!raw) {
      raw = memoryStore.get(key) ?? null;
    }
    
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[LocalStore] Erro ao carregar '${key}':`, e);
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    
    // Tenta salvar no localStorage
    if (checkLocalStorage()) {
      try {
        localStorage.setItem(key, serialized);
        // Se conseguiu, remove do memoryStore
        memoryStore.delete(key);
        return;
      } catch (e) {
        if ((e as any).code === 'QuotaExceededError') {
          console.warn("[LocalStore] localStorage cheio, usando memória como fallback");
        } else {
          console.error("[LocalStore] Erro ao salvar no localStorage:", e);
        }
      }
    }
    
    // Se localStorage falhou, salva em memória
    memoryStore.set(key, serialized);
  } catch (e) {
    console.error(`[LocalStore] Erro ao serializar '${key}':`, e);
  }
}

export function removeKey(key: string) {
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
  return !localStorageAvailable;
}

// Debug: retorna tamanho aproximado dos dados salvos
export function getStorageStats() {
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
  
  return {
    localStorageSize,
    memorySize,
    totalSize: localStorageSize + memorySize,
    usingMemoryStore: !localStorageAvailable,
    localStorageAvailable: checkLocalStorage(),
  };
}
