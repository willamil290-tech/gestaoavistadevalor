Vou corrigir a importação de chamadas para impedir que uma gravação sobrescreva a outra no mesmo dia.

Plano:

1. Tornar o salvamento de chamadas atômico no Lovable Cloud
   - Hoje as chamadas do mês inteiro são salvas em uma única chave (`calls:AAAA-MM`).
   - O problema acontece quando uma tela salva uma versão local desatualizada do mês inteiro, sobrescrevendo dados já existentes no banco.
   - Vou alterar o fluxo para, na hora de confirmar a importação, buscar novamente a versão mais recente do banco, mesclar com o que foi colado e só então gravar.

2. Gravar imediatamente após mesclar
   - Em vez de depender apenas do `saveJson`, que salva no localStorage e depois faz envio com debounce, o botão “Confirmar gravação” vai enviar o resultado final diretamente para o Lovable Cloud.
   - Isso reduz a chance de outro pull/polling ou outro computador substituir o resultado antes do envio terminar.

3. Impedir overwrite vazio ou antigo durante importação
   - A rotina de chamadas vai evitar que dados locais vazios ou incompletos substituam uma chave remota que já tem conteúdo.
   - Se houver conflito, sempre será preservado o conjunto mais completo: banco mais recente + dados importados agora.

4. Ajustar os modos de gravação
   - “Adicionar”: continuará preservando todos os colaboradores do mesmo dia e ignorando duplicatas exatas.
   - “Substituir pessoa/dia”: removerá apenas as chamadas da pessoa e dia presentes no texto importado, mantendo as outras pessoas do mesmo dia.
   - “Substituir mês inteiro”: continuará existindo, mas vou deixar seu comportamento isolado e explícito, pois esse modo realmente apaga o mês e grava só o texto colado.

5. Sincronizar a tela após salvar
   - Depois do salvamento direto no banco, a tela será atualizada com o resultado final gravado.
   - Também vou disparar o evento de atualização local para que as outras visões que dependem de chamadas recarreguem corretamente.

Arquivos previstos:
- `src/lib/cloudSync.ts`: adicionar uma função segura para gravar uma chave com valor explícito no Lovable Cloud, sem depender apenas do conteúdo atual do localStorage.
- `src/components/ChamadasView.tsx`: usar essa gravação direta e reforçar a mesclagem antes de salvar.

Resultado esperado:
- Colar chamadas de uma pessoa em um dia não vai mais apagar as chamadas de outra pessoa no mesmo dia.
- O comportamento será consistente entre computadores diferentes.
- O banco continuará sendo a fonte principal; nada volta a depender do Google Sheets.