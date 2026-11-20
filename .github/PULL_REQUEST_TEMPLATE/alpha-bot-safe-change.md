# Alteração Alpha Bot — PR com homologação controlada

> DRAFT até completar validação. NÃO MESCLE sem aprovação explícita, principalmente se a branch de destino tiver deploy automático.

## Incidente / mudança
- ID:
- Problema e reprodução:
- Componente e branch de produção afetados:
- SHA do último deploy em uso:
- Banco real afetado (se aplicável, apenas nome lógico):
- Risco e efeitos colaterais:

## Evidências e testes
- [ ] Reproduzi o problema ANTES da correção, sem alterar produção.
- [ ] Confirmei que a branch de origem vem do commit correto do componente.
- [ ] Revisei o diff por alterações não relacionadas e segredos.
- [ ] Executei testes de sintaxe/unitários e regressões do módulo afetado.
- [ ] Executei testes SQL somente em banco descartável ou homologação isolada.
- [ ] Verifiquei que o ambiente de testes não aponta para alpha_prod_v2 e não envia mensagens reais.
- [ ] Conferi os checks de CI: TODOS concluídos com sucesso (nenhum QUEUED/PENDING).
- [ ] Verifiquei Web e WhatsApp quando o comportamento deve ser igual.
- [ ] Testei concorrência, idempotência e restart quando há saldos, recompensas ou sessões.
- [ ] Documentei as evidências e a ligação para resultados/execuções.

## Aprovação de deploy
- [ ] Confirmei deploy-alvo, branch, SHA e ambiente exatos.
- [ ] Verifiquei o estado de Raid/Boss/eventos e impacto sobre jogadores.
- [ ] Confirmei backup/restauração e plano de rollback adequados.
- [ ] Documentei se há migração, variáveis de ambiente ou alteração de permissões.
- [ ] Obtive aprovação explícita para o merge/deploy de produção.

### Resultado da homologação
Descrever casos, resultados e links de logs expurgados de dados sensíveis.

### Plano de rollback
Descrever commit/deployment a restaurar e como lidar com dados já modificados.

### Aprovação
Responsável:
Data:
Escopo exato:

### Pós-release
Comportamento observado:
Sem regressões:
