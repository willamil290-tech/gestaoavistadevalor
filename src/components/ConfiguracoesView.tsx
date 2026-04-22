import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CloudUpload, CloudDownload, RefreshCw, Database, AlertTriangle } from "lucide-react";
import {
  humanBytes,
  listArchivedKeys,
  listLocalKeys,
  migrateLocalToSheets,
  restoreArchiveToLocal,
  type LocalKeyPreview,
} from "@/lib/migrateLocal";

export function ConfiguracoesView() {
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [overwriteOnRestore, setOverwriteOnRestore] = useState(false);

  const [localKeys, setLocalKeys] = useState<LocalKeyPreview[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState<{ key: string; size: number; updated_at: string }[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [busy, setBusy] = useState<null | "migrate" | "restore" | "update-existing" | "update-selected">(null);
  const [progress, setProgress] = useState<{ done: number; total: number; key: string } | null>(null);

  function refreshLocal() {
    try {
      // Verificar se estamos no navegador e localStorage está disponível
      if (typeof window === 'undefined' || !window.localStorage) {
        console.warn('localStorage não disponível');
        setLocalKeys([]);
        setSelectedKeys(new Set());
        return;
      }
      const keys = listLocalKeys(includeUnknown);
      setLocalKeys(keys);
      setSelectedKeys(new Set(keys.map((k) => k.key)));
    } catch (e) {
      console.error('Erro em refreshLocal:', e);
      setLocalKeys([]);
      setSelectedKeys(new Set());
    }
  }

  function toggleKeySelection(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedKeys.size === localKeys.length) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(localKeys.map((k) => k.key)));
  }

  async function refreshArchive() {
    setLoadingArchive(true);
    try {
      setArchived(await listArchivedKeys());
    } catch (e: any) {
      console.error('Erro em refreshArchive:', e);
      setArchived([]);
    } finally {
      setLoadingArchive(false);
    }
  }

  useEffect(() => {
    try {
      refreshLocal();
    } catch (e) {
      console.error('Erro ao carregar chaves locais:', e);
    }
  }, [includeUnknown]);

  useEffect(() => {
    try {
      refreshArchive();
    } catch (e) {
      console.error('Erro ao carregar arquivos:', e);
    }
  }, []);

  const totalLocalBytes = localKeys.reduce((acc, k) => acc + k.size, 0);
  const totalArchivedBytes = archived.reduce((acc, k) => acc + k.size, 0);

  async function handleMigrate() {
    if (localKeys.length === 0) {
      toast.info("Nada para migrar — localStorage não tem dados de negócio.");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.info("Selecione ao menos uma chave para migrar.");
      return;
    }
    setBusy("migrate");
    setProgress({ done: 0, total: selectedKeys.size, key: "" });
    try {
      const res = await migrateLocalToSheets({
        includeUnknown,
        selectedKeys: Array.from(selectedKeys),
        incremental: false, // Para chaves selecionadas, sempre migrar (não incremental)
        forceUpdate: false, // Não limpar toda a aba, apenas adicionar/atualizar as selecionadas
        delayMs: 600,
        onProgress: (done, total, key) => setProgress({ done, total, key }),
      });
      toast.success(`✅ ${res.count} chaves enviadas (${humanBytes(res.bytes)}) para o Google Sheets`);
      await refreshArchive();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao migrar");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function handleUpdateSelected() {
    if (selectedKeys.size === 0) {
      toast.info("Selecione ao menos uma chave para atualizar.");
      return;
    }
    setBusy("update-selected");
    setProgress({ done: 0, total: selectedKeys.size, key: "" });

    try {
      const res = await migrateLocalToSheets({
        includeUnknown,
        selectedKeys: Array.from(selectedKeys),
        incremental: true,
        forceUpdate: true, // Atualizar apenas as chaves selecionadas
        delayMs: 2000,
        onProgress: (done, total, key) => setProgress({ done, total, key }),
      });
      toast.success(`✅ Chaves atualizadas: ${res.count} (${humanBytes(res.bytes)}) no Google Sheets`);
      await refreshArchive();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar chaves");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function handleRestore() {
    if (archived.length === 0) {
      toast.info("Nada para restaurar — Sheets não tem arquivos.");
      return;
    }
    setBusy("restore");
    setProgress({ done: 0, total: archived.length, key: "" });
    try {
      const res = await restoreArchiveToLocal({
        overwrite: overwriteOnRestore,
        onProgress: (done, total, key) => setProgress({ done, total, key }),
      });
      toast.success(`✅ Restaurado: ${res.restored} • Ignorado: ${res.skipped}`);
      refreshLocal();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao restaurar");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configurações & Backup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Migre os dados antigos do navegador (localStorage) para o Google Sheets. Assim, mesmo que o histórico do navegador seja apagado, eles continuam salvos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* === MIGRAR === */}
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CloudUpload className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-foreground">Enviar para o Sheets</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Migração automática:</strong> Migra apenas dados novos, sem apagar existentes.<br/>
                <strong>Atualizar dados existentes:</strong> Sobrescreve todos os dados no Sheets com versões atuais.<br/>
                Use "Atualizar dados existentes" quando importar dados atualizados de dias já migrados.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {localKeys.length} chaves • {humanBytes(totalLocalBytes)}
            </Badge>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={includeUnknown}
              onCheckedChange={(v) => setIncludeUnknown(v === true)}
            />
            Incluir chaves desconhecidas (qualquer coisa que não seja sessão/UI)
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{selectedKeys.size} de {localKeys.length} chaves selecionadas</span>
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={toggleSelectAll}
            >
              {selectedKeys.size === localKeys.length ? "Desmarcar todas" : "Selecionar todas"}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30">
            {localKeys.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Nenhuma chave de negócio encontrada no localStorage.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Chave</th>
                    <th className="px-3 py-2 font-medium text-right">Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {localKeys.map((k) => (
                    <tr key={k.key} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-mono">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedKeys.has(k.key)}
                            onCheckedChange={() => toggleKeySelection(k.key)}
                          />
                          <span>{k.key}</span>
                        </label>
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{humanBytes(k.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleMigrate}
            disabled={busy !== null || localKeys.length === 0}
          >
            <CloudUpload className="w-4 h-4 mr-2" />
            {busy === "migrate" ? `Enviando ${progress?.done}/${progress?.total}...` : "Migrar selecionadas (incremental)"}
          </Button>

          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={handleUpdateSelected}
            disabled={busy !== null || selectedKeys.size === 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {busy === "update-selected"
              ? `Atualizando ${progress?.done}/${progress?.total}...`
              : "Atualizar selecionadas"}
          </Button>
        </Card>

        {/* === RESTAURAR === */}
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CloudDownload className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-foreground">Restaurar do Sheets</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Lê a aba <code className="bg-muted px-1 rounded">local_archive</code> e restaura no localStorage deste navegador.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {archived.length} chaves • {humanBytes(totalArchivedBytes)}
              </Badge>
              <Button size="icon" variant="ghost" onClick={refreshArchive} disabled={loadingArchive} title="Recarregar">
                <RefreshCw className={`w-4 h-4 ${loadingArchive ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={overwriteOnRestore}
              onCheckedChange={(v) => setOverwriteOnRestore(v === true)}
            />
            <span>
              Sobrescrever chaves que já existem localmente
              {overwriteOnRestore && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  pode apagar dados locais mais novos
                </span>
              )}
            </span>
          </label>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30">
            {archived.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Nada arquivado no Sheets ainda.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Chave</th>
                    <th className="px-3 py-2 font-medium text-right">Tamanho</th>
                    <th className="px-3 py-2 font-medium text-right">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map((k) => (
                    <tr key={k.key} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-mono">{k.key}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{humanBytes(k.size)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {k.updated_at ? new Date(k.updated_at).toLocaleString("pt-BR") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Button
            className="w-full rounded-xl"
            variant="outline"
            onClick={handleRestore}
            disabled={busy !== null || archived.length === 0}
          >
            <CloudDownload className="w-4 h-4 mr-2" />
            {busy === "restore" ? `Restaurando ${progress?.done}/${progress?.total}...` : "Restaurar para este navegador"}
          </Button>
        </Card>
      </div>

      <Card className="p-4 bg-muted/30 border-dashed">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p><strong className="text-foreground">Como funciona:</strong> Os dados das abas <em>Acionamentos, Detalhado, Tendência e Chamadas</em> ficavam só no navegador. Agora vão para uma aba chamada <code className="bg-muted px-1 rounded">local_archive</code> na sua planilha do Google.</p>
            <p><strong className="text-foreground">Quando rodar:</strong> uma vez agora (para salvar o que já existe). Depois, sempre que quiser fazer um backup manual de novos dados.</p>
            <p>Configurações principais (metas, colaboradores, eventos) <strong className="text-foreground">já são salvas automaticamente</strong> no Sheets em tempo real.</p>
          </div>
        </div>
      </Card>

      {progress && (
        <div className="text-xs text-muted-foreground text-center">
          {progress.done}/{progress.total} — {progress.key}
        </div>
      )}
    </div>
  );
}
