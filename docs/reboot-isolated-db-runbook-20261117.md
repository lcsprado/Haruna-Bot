# Alpha Bot 2.0 — migração sem interferência (Runbook)
Data: 17/11/2026 · Branch: `feature/reboot-classes-only-20261117`
Estado: PROPOSTA — sem autorização de deploy, reset ou mudança de DB.

## Arquitetura escolhida para preparação
- **Ambiente A — produção atual**: código atual, banco atual, WhatsApp/Web atuais. Zero mudança de configuração ou dados durante desenvolvimento.
- **Ambiente B — homologação/reboot**: banco PostgreSQL/Neon **independente**, credenciais diferentes, sem qualquer conexão operacional a A. Inicialmente só GitHub CI e scripts locais; não subir segunda instância WhatsApp nem habilitar cron/schedulers/outbox.
- **Repositório**: branch `feature/reboot-classes-only-20261117`, PR #387 em draft, sem auto-merge e sem deploy automático.

## Restrições duras
1. **Um único consumidor da sessão WhatsApp real**. `src/neon/index.js` usa `SESSION_ID` (`alpha-primary` por padrão), lê autenticação em `auth_creds`/`auth_keys` e aciona inúmeros schedulers como GT/Guerra/Poço. `acquireRuntimeLock(sessionId)` protege uma instância por DB, NÃO protege duas instâncias conectadas a DBs distintos. Nunca ligar A e B ao WhatsApp simultaneamente.
2. **Não clonar uma produção operacional ligada**. Se for preciso copiar snapshot para testes, retirar/desabilitar no B qualquer inicialização de WhatsApp, Web real, schedulers, envios, tarefas pendentes, pagamentos, webhook, e consumidores de outbox. Dados de auth/sessão podem ser guardados em backup seguro, não expostos aos ambientes de teste.
3. **Proteger dados operacionais**: preservar as contas/JIDs autorizados, grupos, permissões, `group_licenses`, `subscription_orders`, pagamento real, `auth_creds`, `auth_keys`, dados de login Web, tokens e configurações administrativas. Não presumir que tabelas com `jid` são todas resetáveis.
4. **Segredos**: nunca commitar `DATABASE_URL`, certificados ou chaves. O `src/neon/web-api.js` usa `WEB_MEMBER_TOKEN_SECRET` com fallback para `DATABASE_URL`; definir segredo estável específico antes da migração e confirmar comportamento dos identificadores de membros, sem copiar credenciais para o GitHub.
5. **Nada de automatizar a produção**: não atualizar envs de Render/Koyeb/Vercel/Neon, não desligar A, não criar/alterar banco, não mudar DNS/links de jogadores sem janela e aprovação.

## Sequência proposta

### Fase 1: Desenvolvimento e auditoria (agora)
- Códigos e testes somente em branch.
- Inventariar todas as 117 tabelas detectadas estaticamente; tabela real será validada posteriormente em B.
- Projetar economia, drops, poderes, estruturas e dependências de collabs.
- Implementar cortes da collab em módulos/testes, sem chamar funções de produção.
- Confirmar identidades dos quatro jogadores antes do reset: NÃO inferir JID de apelidos.

### Fase 2: Criar B isolado (somente quando necessário)
- Preferir banco/projeto Neon separado ou isolamento equivalente com credenciais totalmente diferentes; evitar apenas uma nova branch do mesmo banco apontada de modo inadvertido pelos serviços ativos.
- Criar schema do zero via inicializações versionadas testadas, ou importação seletiva limpa. Não copiar objetos de temporada antiga apenas para que o serviço inicie.
- Levar somente as configurações operacionais validadas e quatro identidades, com autenticação artificial de teste; não carregar tokens WhatsApp reais para processos B.
- Gerar relatório automatizado do estado inicial: nível 1, EXP 0, saldo 0, sem ativos/equipamentos/buffs/XP/serviços vencidos, classes iniciais.
- Testar PvP, Boss, Raid, Poço, clãs, GT, carros, negócios, Web, receitas/despesas, leilões e cron sem efeito externo. Qualquer teste de mensagem deve usar gateway mock; grupo WhatsApp real somente após autorização específica.

### Fase 3: Virada controlada (etapa futura, aprovação separada)
1. Comunicar manutenção; bloquear novas ações/entradas econômicas, drenar filas, finalizar ou cancelar sessões e registrar transações pendentes.
2. Backup restaurável de A, schema + dados, snapshot imutável de código/config/versões e verificação de restore.
3. Desligar **com confirmação de parada** o serviço WhatsApp/Web que escreva em A e seus schedulers e consumidores; confirmar ausência de workers concorrentes.
4. Migrar para B somente identidade, licenças/assinaturas/direitos, grupos e autenticação necessária, via processo seguro e auditado, sem reintroduzir personagens, itens, economia ou sessões de collab.
5. Configurar serviços de produção para B e nova versão de código, com `SESSION_ID` e segredos controlados; testar reconexão WhatsApp, login Web, JID, licenças, grupos, menus e economia.
6. Abrir acesso aos quatro jogadores; verificar que nenhuma recompensa antiga se reativa.
7. Manter A como cópia histórica **desconectada e acessível só para rollback**. Não excluir/desativar definitivamente o banco até concluir verificação, backups e política de retenção.

### Rollback
- Antes da primeira ação dos jogadores em B: parar B, reverter app/config à versão A e reativar A após verificar ausência de concorrentes.
- Depois de qualquer ação real em B: rollback exige conciliação de transações, eventos e sessões; não prometer rollback instantâneo sem possível perda de progresso.
- Registrar checklist com data, SHA, identificador de DB e responsável por cada troca. Nunca executar por um aviso/chat genérico.

## Critérios de aceite para o novo banco
- Um único WhatsApp ativo com autenticação válida.
- Nenhuma referência operante à collab dos 7 Pecados (excluídos dados históricos offline).
- Quatro contas confirmadas e na mesma situação inicial, sem desativar licenças ou privilégios.
- Todos os sistemas não-collab disponíveis e regressões aprovadas.
- 7/30/60 dias simulados com economia equilibrada e lendárias relevantes.
- Conferência de saldos, itens, buffs, empréstimos, ratings, clãs, GT, rankings, outbox e agendamentos.
- Telemetria de erros, verificação de renda de negócios e mecanismo de correção sem editar produção às cegas.

## Condição atual
PR #387 apenas prepara auditoria e docs. A decisão de criar B é recomendada para futura homologação; **ainda não precisamos criá-lo**. Nenhum deploy, reset, cópia de credenciais ou troca de DATABASE_URL foi feito.


## Levantamento de projetos Neon existentes (somente leitura, 17/11/2026)
- Conta Neon principal: `jolly-glitter-58248440` (`conciliador-financeiro`), projeto antigo com cota de transferência excedida em 12/11. Continua existente. Branch `main` ARQUIVADA, tamanho lógico ~31,4 MB; branch `bot-wpp-test` ARQUIVADA, ~81,8 MB. `quota_reset_at=2026-12-01T00:00:00Z`. Não tentar restaurar/ativar branch ou reutilizar em produção sem avaliar limites, dependências do Conciliador e recuperação de acesso; a data de reset de quota não equivale a autorização de reutilização.
- `ancient-snow-09805670` (`ALPHA BOT`) existe na mesma conta, branch padrão `production` em estado READY, ~89,4 MB, atualizada em 17/11, mais várias branches de backup ARQUIVADAS. Não afirmar que está offline ou apagável: detectar consumidores/automação e confirmar origem do dado antes de eventual reaproveitamento.
- O banco real `alpha_prod_v2` no Aiven é o banco informado como produção; nenhuma conexão foi alterada.
- Resultado: a alternativa de reaproveitar banco antigo existe APENAS como hipótese condicionada à auditoria. Para homologação, preferir instância isolada que não dependa de restaurar banco arquivado, não compartilhe quota excedida e não seja usada pelo Conciliador.
- Este levantamento usou somente os metadados/listagens Neon e não abriu conexões SQL, não reiniciou compute e não executou alterações.
