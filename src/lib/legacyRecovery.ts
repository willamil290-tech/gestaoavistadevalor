import { getArchivedLocalEntries } from "@/lib/migrateLocal";
import { isBusinessKey, pushKeyToSheetsNow } from "@/lib/cloudSync";

const RECOVERY_FLAG = "legacyRecovery:v1:done";

function hasLocalBusinessData(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isBusinessKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value && value !== "[]" && value !== "{}") return true;
    }
  } catch {
    return false;
  }
  return false;
}

function shouldRestoreKey(key: string, value: string) {
  if (!isBusinessKey(key)) return false;
  if (!value || value === "[]" || value === "{}") return false;
  return true;
}

export async function restoreLegacyArchiveOnce(): Promise<{ restored: number; pushed: number }> {
  if (typeof window === "undefined") return { restored: 0, pushed: 0 };
  if (sessionStorage.getItem(RECOVERY_FLAG)) return { restored: 0, pushed: 0 };
  if (hasLocalBusinessData()) {
    sessionStorage.setItem(RECOVERY_FLAG, "1");
    return { restored: 0, pushed: 0 };
  }

  const archived = await getArchivedLocalEntries();
  let restored = 0;
  const restoredKeys: string[] = [];

  for (const entry of archived) {
    if (!shouldRestoreKey(entry.key, entry.value)) continue;
    try {
      localStorage.setItem(entry.key, entry.value);
      restored++;
      restoredKeys.push(entry.key);
    } catch {
      // ignora quota/parse issues e segue
    }
  }

  let pushed = 0;
  for (const key of restoredKeys) {
    try {
      await pushKeyToSheetsNow(key);
      pushed++;
    } catch {
      // ignora falhas parciais no espelhamento
    }
  }

  sessionStorage.setItem(RECOVERY_FLAG, "1");
  return { restored, pushed };
}