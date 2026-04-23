
Objetivo: corrigir o fluxo de importação de chamadas para que nenhuma ligação válida seja descartada, o total diário bata exatamente com o texto colado e o total mensal permaneça correto após salvar e recarregar.

1. Tornar a importação “lossless”
- Remover a deduplicação automática no fluxo de chamadas.
- Cada bloco reconhecido no texto colado será salvo como uma chamada distinta.
- Nenhuma chamada será descartada por ter mesmo número, mesmo minuto, mesmo status ou mesmo contato.
- Se o usuário colar o mesmo relatório duas vezes, isso não será “filtrado” silenciosamente; a prevenção de duplicidade passará a ser feita por ação explícita de substituição do período, não por descarte automático de linhas.

2. Reescrever o parser para não perder blocos silenciosamente
- Refatorar `src/lib/callsParse.ts` para processar o texto por blocos completos, em vez de avançar linha a linha com `continue` que pode desalinhar a leitura.
- Validar explicitamente os campos esperados de cada bloco: nome, telefone, direção, data, status e contato/empresa opcional.
- Tratar corretamente blocos com:
  - duração ausente
  - linha `-`
  - `Contato:` ou `Empresa:`
  - variações de status
  - datas relativas como `ontem`, `hoje`, `anteontem`
- Em vez de ignorar blocos problemáticos, retornar diagnóstico de importação com:
  - chamadas reconhecidas
  - blocos incompletos
  - linhas suspeitas
  - quantidade total esperada x quantidade efetivamente parseada

3. Trocar deduplicação por modos explícitos de gravação
- Ajustar `src/components/ChamadasView.tsx` para oferecer gravação sem descarte:
  - Adicionar ao mês atual
  - Substituir o dia importado
  - Substituir o mês importado
- O modo padrão para correção histórica será “substituir período”, porque ele evita acumular importações repetidas sem eliminar chamadas individuais legítimas.
- O salvamento deve acontecer como operação atômica: montar a nova coleção completa em memória e salvar o array final de uma vez.

4. Unificar persistência somente na base do Lovable Cloud
- Remover o caminho legado de `saveCallsMonth` em `src/lib/persistence.ts`, que ainda salva em Google Sheets.
- Fazer `ChamadasView` usar apenas `saveJson("calls:YYYY-MM", ...)`, aproveitando o espelhamento já existente para a tabela `app_data`.
- Garantir que recarregar a página restaure exatamente o mesmo conjunto de chamadas do mês, sem reinterpretação parcial.
- Manter `calls:` como chave de negócio sincronizada com a nuvem, sem caminho paralelo.

5. Mostrar transparência total antes de salvar
- Exibir no modal/área de importação um resumo obrigatório:
  - quantas chamadas foram encontradas no texto
  - quantas foram parseadas com sucesso
  - quantas ficaram pendentes por erro de leitura
  - quantas pertencem ao mês selecionado
  - contagem por colaborador e por dia
- Se houver qualquer bloco não reconhecido, o sistema não salva silenciosamente; ele alerta exatamente o que ficou pendente.
- Isso garante conferência visual para casos como “Vanessa dia 22 = 32”.

6. Criar caminho de reparo para o mês já afetado
- Implementar em `ChamadasView` um fluxo de reconstrução do mês via nova importação confiável.
- Ao usar “substituir mês”, o valor mensal será recalculado a partir do conteúdo recém-importado, corrigindo os totais históricos corrompidos pela lógica anterior.
- O total diário, o total mensal e o drill-down detalhado passarão a usar a mesma base persistida.

Arquivos principais
- `src/lib/callsParse.ts`
  - parser por blocos
  - diagnóstico de importação
  - zero descarte silencioso
- `src/components/ChamadasView.tsx`
  - remover dedupe automática
  - adicionar modos explícitos de gravação
  - resumo/validação antes do save
  - reparo por substituição de dia/mês
- `src/lib/persistence.ts`
  - remover uso legado de `saveCallsMonth` para chamadas
- `src/lib/localStore.ts`
  - manter espelhamento para nuvem sem alterar a regra de persistência
- opcionalmente um util novo para tipar resultado do parser e os diagnósticos de importação

Detalhes técnicos
- Regra central: uma chamada válida nunca poderá ser descartada automaticamente.
- Se houver ambiguidade ou erro de parsing, a chamada não será “sumida”; ela aparecerá como bloco pendente de revisão.
- A prevenção de contagem duplicada passará a ser feita por substituição explícita de período, não por heurística de igualdade entre chamadas.
- Resultado esperado:
  - o total diário confere com o texto colado
  - o total mensal da Vanessa deixa de ficar abaixo do esperado
  - os dados persistem após reload
  - o usuário enxerga exatamente o que entrou, o que está pendente e por quê
