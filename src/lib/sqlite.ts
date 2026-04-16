import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

// SQLite para persistência ultra-robusta
class SQLiteStore {
  private db: Database | null = null;
  private sql: SqlJsStatic | null = null;
  private initialized = false;

  async init(): Promise<boolean> {
    try {
      // Carregar sql.js
      this.sql = await initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
      });

      // Tentar carregar dados existentes do localStorage
      const savedData = localStorage.getItem('sqlite_db_backup');
      if (savedData) {
        const dbArray = new Uint8Array(JSON.parse(savedData));
        this.db = new this.sql.Database(dbArray);
        console.log('[SQLite] Banco carregado do backup');
      } else {
        this.db = new this.sql.Database();
        console.log('[SQLite] Novo banco criado');
      }

      // Criar tabelas se não existirem
      this.createTables();

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[SQLite] Erro ao inicializar:', error);
      return false;
    }
  }

  private createTables() {
    if (!this.db) return;

    // Tabela principal para dados JSON
    this.db.run(`
      CREATE TABLE IF NOT EXISTS data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para metadados
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Inserir versão do schema
    this.db.run(`
      INSERT OR REPLACE INTO metadata (key, value)
      VALUES ('schema_version', '1')
    `);
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    if (!this.initialized || !this.db) {
      console.warn('[SQLite] DB não inicializado');
      return fallback;
    }

    try {
      const stmt = this.db.prepare('SELECT value FROM data WHERE key = ?');
      const result = stmt.getAsObject([key]);
      stmt.free();

      if (result.value) {
        return JSON.parse(result.value as string);
      }
    } catch (error) {
      console.error(`[SQLite] Erro ao ler '${key}':`, error);
    }

    return fallback;
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.initialized || !this.db) {
      console.warn('[SQLite] DB não inicializado');
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO data (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run([key, JSON.stringify(value)]);
      stmt.free();

      // Backup automático para localStorage
      this.backupToLocalStorage();
    } catch (error) {
      console.error(`[SQLite] Erro ao salvar '${key}':`, error);
    }
  }

  async remove(key: string): Promise<void> {
    if (!this.initialized || !this.db) return;

    try {
      const stmt = this.db.prepare('DELETE FROM data WHERE key = ?');
      stmt.run([key]);
      stmt.free();
      this.backupToLocalStorage();
    } catch (error) {
      console.error(`[SQLite] Erro ao remover '${key}':`, error);
    }
  }

  async clear(): Promise<void> {
    if (!this.initialized || !this.db) return;

    try {
      this.db.run('DELETE FROM data');
      this.backupToLocalStorage();
    } catch (error) {
      console.error('[SQLite] Erro ao limpar:', error);
    }
  }

  private backupToLocalStorage() {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const buffer = data.buffer;
      const array = Array.from(new Uint8Array(buffer));
      localStorage.setItem('sqlite_db_backup', JSON.stringify(array));
    } catch (error) {
      console.warn('[SQLite] Erro no backup automático:', error);
    }
  }

  async getStats() {
    if (!this.initialized || !this.db) {
      return { available: false };
    }

    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM data');
      const result = stmt.getAsObject();
      stmt.free();

      const dbSize = this.db.export().length;

      return {
        available: true,
        recordCount: result.count,
        dbSize,
        schemaVersion: '1',
      };
    } catch (error) {
      console.error('[SQLite] Erro ao obter estatísticas:', error);
      return { available: false, error: String(error) };
    }
  }

  // Método para exportar dados como JSON
  async exportData(): Promise<Record<string, any>> {
    if (!this.initialized || !this.db) return {};

    try {
      const stmt = this.db.prepare('SELECT key, value FROM data');
      const data: Record<string, any> = {};

      while (stmt.step()) {
        const row = stmt.getAsObject();
        data[row.key as string] = JSON.parse(row.value as string);
      }
      stmt.free();

      return data;
    } catch (error) {
      console.error('[SQLite] Erro ao exportar:', error);
      return {};
    }
  }

  // Método para importar dados
  async importData(data: Record<string, any>): Promise<void> {
    if (!this.initialized || !this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO data (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);

      for (const [key, value] of Object.entries(data)) {
        stmt.run([key, JSON.stringify(value)]);
      }
      stmt.free();

      this.backupToLocalStorage();
    } catch (error) {
      console.error('[SQLite] Erro ao importar:', error);
    }
  }
}

// Instância singleton
const sqliteStore = new SQLiteStore();

// Inicializar SQLite
let sqliteReady = false;
sqliteStore.init().then(success => {
  sqliteReady = success;
  if (success) {
    console.log('[SQLite] Pronto para uso');
  } else {
    console.warn('[SQLite] Não disponível');
  }
});

// Funções públicas
export async function loadFromSQLite<T>(key: string, fallback: T): Promise<T> {
  if (sqliteReady) {
    return sqliteStore.get(key, fallback);
  } else {
    // Fallback para IndexedDB/localStorage
    const { loadFromDB } = await import('./indexedDB');
    return loadFromDB(key, fallback);
  }
}

export async function saveToSQLite(key: string, value: unknown): Promise<void> {
  if (sqliteReady) {
    return sqliteStore.set(key, value);
  } else {
    const { saveToDB } = await import('./indexedDB');
    return saveToDB(key, value);
  }
}

export async function removeFromSQLite(key: string): Promise<void> {
  if (sqliteReady) {
    return sqliteStore.remove(key);
  } else {
    const { removeFromDB } = await import('./indexedDB');
    return removeFromDB(key);
  }
}

export async function clearSQLite(): Promise<void> {
  return sqliteStore.clear();
}

export function isSQLiteAvailable(): boolean {
  return sqliteReady;
}

export async function getSQLiteStats() {
  return sqliteStore.getStats();
}

export async function exportSQLiteData() {
  return sqliteStore.exportData();
}

export async function importSQLiteData(data: Record<string, any>) {
  return sqliteStore.importData(data);
}