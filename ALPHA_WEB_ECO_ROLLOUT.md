# ALPHA BOT — implantação gradual Web Eco (21/10/2026)

## Escopo e isolamento

Branch de preparação: `alpha-web-eco-canary-20261021`.
Branch atual no serviço Render: `whatsapp-only` (autoDeploy desabilitado).
Nenhuma alteração em inventários, saldos, forja, encantamentos, pets, Raids, pagamentos ou tabelas de dados faz parte desta entrega.
**Esta branch não deve ser promovida sem validação e sem as credenciais do Redis seguro.**

## Implementado nesta branch

1. O navegador NÃO executa mais `/api/v1/me/bootstrap` a cada 15 segundos.
   Continua sincronizando após ações, ao retornar à aba visível e manualmente.
2. `GET /api/v1/me/live` consulta somente o estado de dois Bosses
   do grupo autorizado. A tela do Boss com Boss ativo atualiza a cada 60 segundos;
   as demais páginas não geram polling periódico.
3. Sessão Web: token é validado em cada requisição, mas `last_seen_at` somente
   é atualizado se o valor estiver atrasado 15 minutos. O `expires_at` permanece intacto.
4. A Web só é exposta no serviço WhatsApp-only quando
   `ALPHA_WEB_ENABLED=1`. Sem isso, endpoints Web estão fechados.
   A API e o comando `!web` também exigem JID autorizado via
   `ALPHA_WEB_CANARY_JIDS`, lista separada por vírgulas.
5. Imagens do PWA são cache-first; uma nova versão da arte exige incrementar
   o identificador `CACHE` em `web/sw.js`.
6. Controle da instância WhatsApp: `ALPHA_RUNTIME_LOCK_MODE` permite
   `postgres` (padrão), `dual` (PostgreSQL + Upstash Redis) e `redis` (somente Redis).
   Redis utiliza chave com TTL de 60s e renovação atômica a cada 15s;
   falhas de renovação encerram o processo para não operar sem exclusividade.

## Pré-requisitos e segurança

- Criar conta Redis Upstash persistente, sob controle do administrador, e
  configurar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` como
  variáveis de ambiente secretas no Render. Nunca versionar credenciais.
- Executar testes de sintaxe e regressão no GitHub Actions desta branch.
- Confirmar backup independente do Neon e conferir estado das atividades.
- Não habilitar mais de uma instância do bot nem criar novo SESSION_ID para a mesma conta.
- Documentar a configuração atual do serviço para rollback.
- Monitores HTTP devem acessar `/health`; o endpoint não faz SELECT no banco.

## Transição de lock (dois deploys obrigatórios)

1. Implantar o código atualizado com
   `ALPHA_WEB_ENABLED=0`, `ALPHA_RUNTIME_LOCK_MODE=postgres`.
   Confirmar login, /health e ausência de duplicidade de sessão.
2. Após configurar Redis, alterar apenas para `ALPHA_RUNTIME_LOCK_MODE=dual`,
   disparar um deploy e confirmar aquisição da trava PostgreSQL **e**
   da trava Redis. O Neon ainda ficará acordado nesta etapa.
3. Em outro deploy, mudar para `ALPHA_RUNTIME_LOCK_MODE=redis`.
   A instância antiga em modo dual segura a trava Redis até desligar.
   A nova aguarda liberação (máximo esperado cerca de 60s após encerramento).
   Verificar que `trevo-runtime-lock` deixou de existir no pg_stat_activity.
4. Aguardar janela realmente sem operações por mais de cinco minutos e
   conferir se o Neon entrou em Idle e o WhatsApp continuou conectado.
   O bot pode gerar consultas por outras rotinas; essa mudança não garante Idle.

**Rollback seguro:** de `redis` para `dual`, validar, depois de `dual`
para `postgres`. Não pular etapas durante deploy com sobreposição.

## Liberação canário

5. Configurar `ALPHA_WEB_ENABLED=1` e `ALPHA_WEB_CANARY_JIDS` com apenas
   um JID do jogador escolhido. Fazer deploy. `!web` deve criar o vínculo;
   o navegador abre `/rpg` no mesmo Render. Não usar créditos ou fusões reais
   nos testes.
6. Validar: autenticação, logout, leitura de perfil/inventário/pets,
   Boss leve, atualização após ação não financeira, sesssão expirando,
   nenhuma escrita de inventário ou negócio ao navegar.
7. Comparar métricas de tráfego Render, `/health?metrics=1`,
   utilização Neon (CU-h), logs de conexão, memória e erros.
   Acompanhar pelo menos um dia com 1 jogador antes de ampliar.
8. Ampliar a allowlist para 4 JIDs e repetir as métricas.
   A ampliação de JIDs não altera a configuração do bot WhatsApp.

## Voltar à versão WhatsApp-only

- `ALPHA_WEB_ENABLED=0` imediatamente fecha as rotas Web e o fluxo `!web`.
- Preservar `ALPHA_RUNTIME_LOCK_MODE=redis` se estiver íntegro; o desligamento
  da Web não exige voltar a usar a trava do Neon.
- Se Redis falhar, aplicar o rollback de lock em etapas antes de retornar ao
  `whatsapp-only` antigo. Deploy de código antigo sem a sequência pode
  violar a exclusividade durante a transição.

## Limitações / aceite

- Redis ainda não provisionado nesta entrega; a trava não foi testada
  contra um servidor externo real.
- Não houve deploy do canário neste momento.
- Polling do Boss de 60s enquanto realmente ativo ainda mantém o Neon acordado
  durante a luta, o que é necessário para apresentar progresso quase em tempo real.
- O banco pode permanecer ativo por autenticação WhatsApp, eventos ou Raids;
  medir após a mudança antes de prometer um limite mensal fixo.
