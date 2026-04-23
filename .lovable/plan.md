

## Plano: distribuir eventos Bitrix por data real + recuperar dias 13–20 sem reimportar

### Parte A — Correção estrutural (multi-data)

**1. `src/lib/bitrixLogs.ts`**
- Parser de data por linha do timeline:
  - `hoje, HH:MM` → data alvo
  - `ontem, HH:MM` → data alvo − 1
  - `anteontem` → data alvo − 2
  - `X dias atrás` / `há X dias` → data alvo − X
  - `DD/MM/AAAA HH:MM` ou `DD de <mês> de AAAA, HH:MM` → data exata
  - `HH:MM` puro sem data → data alvo (fallback)
- Cada `BitrixEvent` ganha `dateISO: "YYYY-MM-DD"`.
- Retorno passa a expor `eventsByDate: Record<string, BitrixEvent[]>` além do array atual.

**2. `src/pages/Index.tsx` — `applyBitrixReportToSite`**
- Para cada `dateISO` detectado:
  - Salvar `bitrixEvents:YYYY-MM-DD` com os eventos daquele dia.
  - Atualizar `acionGeral:YYYY-MM[DATA]` e `acionDet:YYYY-MM[DATA]` por data real (somando totais por dia, por colaborador).
- A "data de destino" da UI vira **fallback** apenas para eventos sem data explícita.
- Loop de `pushKeyToSheetsNow` para todas as chaves `bitrixEvents:` gravadas.

**3. `src/components/BitrixLogsAnalyzerView.tsx`**
- Antes de confirmar, mostrar resumo: "Datas detectadas: 13/04 (24), 14/04 (37)…".
- Texto explicativo: logs distribuídos automaticamente; data de destino só vale para entradas sem data.

### Parte B — Recuperar dias 13–20 SEM reimportar

A chave `bitrixEvents:2025-04-22` hoje contém TODOS os eventos da última colagem (multi-dia colapsado num só). Vamos redistribuí-la in-place:

**4. Migração automática única (`src/lib/bitrixBackfill.ts` novo)**
- Ao carregar `BitrixLogsAnalyzerView` ou `AcionamentoDetalhadoView` pela primeira vez após o deploy:
  - Ler todas as chaves `bitrixEvents:*` do mês atual e do mês anterior.
  - Para cada evento dentro delas, re-parsear a string original do log (campo `raw`/`timeText` já guardado em cada `BitrixEvent`) usando o novo parser de data da Parte A.
  - Reagrupar por `dateISO` real e regravar `bitrixEvents:YYYY-MM-DD` por dia.
  - Marcar flag `bitrixBackfill:v1:done` em `app_data` para não rodar de novo.
- Toast: "Logs Bitrix redistribuídos: 13/04 (24), 14/04 (37)…".

**Pré-requisito:** cada `BitrixEvent` precisa ter o texto bruto original preservado. Se hoje não tem, a migração lê o campo `timeText` (ex.: "ontem, 14:32", "há 9 dias, 10:05") que já existe e foi salvo na importação anterior — basta reaplicar o parser novo sobre ele.

Se algum evento não tiver texto suficiente para inferir a data (improvável), permanece no dia 22 como está hoje — sem perda.

### Parte C — Drill-down

**5. `AcionamentoDetalhadoView` e `AcionamentosView`**
- Manter fallback `pullKeyFromSheets("bitrixEvents:DATA")` já existente — passa a funcionar sozinho assim que a Parte B redistribuir.
- Sem mudança de lógica de UI.

### Arquivos

- `src/lib/bitrixLogs.ts` — parser de data por evento + `eventsByDate`.
- `src/lib/bitrixBackfill.ts` (novo) — migração única redistribuindo `bitrixEvents:*` antigos.
- `src/pages/Index.tsx` — `applyBitrixReportToSite` grava por data real.
- `src/components/BitrixLogsAnalyzerView.tsx` — resumo de datas + dispara backfill no mount.
- `src/components/AcionamentoDetalhadoView.tsx` — dispara backfill no mount (garantia).

### Resultado

- Clique em qualquer célula 13–23 abre os logs corretos sem reimportar nada.
- Próximas colagens Bitrix multi-dia preenchem cada dia automaticamente.
- Totais diários permanecem corretos.

