# Alpha RPG Web isolado no Aiven — plano seguro

**Estado:** PR em rascunho; sem publicacao e sem alteracoes nos serviços Render WhatsApp.

## Recursos
- Aiven PostgreSQL Free: 1 GB; **máximo 20 conexões por instância**.
- Serviço Web em `ALPHA_RUNTIME=web-api-only` não importa `src/neon/index.js` e **não inicia WhatsApp**.
- `ALPHA_WEB_DB_POOL_MAX=3` por padrão, limite configurável de 1 a 5 apenas para Web; WhatsApp continua com seu pool original de 10.
- `ALPHA_WEB_BETA_JIDS` exige lista de JIDs autorizados, separada por vírgula. Vazia = **nenhuma autenticação no Web isolado**. Liberar inicialmente só um; depois expandir para até quatro.
- `WEB_ALLOWED_ORIGINS` deve ser o domínio exato da interface Vercel. **Nunca usar `*` para usuários reais.**
- Certificado CA Aiven deve ser configurado como certificado de confiança do Node; **não desativar TLS**.
- Só fazer leitura de catálogo e consultas leves em testes iniciais.

## Frequência
- Sincronização completa Web a cada **120 segundos** enquanto a página está visível.
- Ações voluntárias sincronizam imediatamente; botão de sincronizar força atualização.
- Ao exibir Boss ou Raid, consulta leve do HP/status a cada **25 segundos**, sem recarregar carteira, pets, inventário ou negócios. O progresso instantâneo das ações locais também usa a consulta leve.
- O navegador atualiza os contadores locais a cada segundo **sem requisição de rede**.
- Sessão é consultada em cada requisição; `last_seen_at` é persistido somente quando há 5 minutos de diferença.
- A rota de autoteste `/api/v1/health/auth` exige flag explícita e acesso local; em público responde 404.

## CRÍTICO: Neon produção e Aiven snapshot estão separados
O bot de WhatsApp em produção continua gravando **somente no Neon**, portanto:
- **Não publicar o Web para jogadores ainda:** Aiven ainda é uma cópia estática, não há sincronização contínua.
- Códigos `!web` gerados pelo WhatsApp são salvos no Neon. **Não existirão no Aiven** sem migração final/ponte explicitamente validada.
- Não criar contas fictícias, transferir saldos, forjar ou simular economia com dados reais.
- Nunca efetuar ações graváveis ao mesmo tempo em Neon e Aiven: isso bifurca saldos e inventários.
- Não trocar `DATABASE_URL` nem branch de qualquer serviço Render do WhatsApp enquanto Web não estiver aprovado.

## Gates para produção
1. Testar o código API-only **em executor temporário**, `PGOPTIONS=-c default_transaction_read_only=on`, com `ALPHA_AIVEN_URI` e CA.
2. Confirmar `GET /health`, `GET /api/v1/health`, `GET /api/v1/catalog`, 401 anônimo em rotas privadas e 404 no autoteste público.
3. Auditar contagens e checksums dos dados sem escrevê-los.
4. Antes de login real: janela de corte, **nova cópia de snapshot** do Neon, atualização de credenciais WhatsApp e API de modo coordenado, confirmação de que `!web` salva códigos no mesmo banco para ambos.
5. Reativar gradualmente: um jogador → quatro. Acompanhar conexões SQL, banda Render, CPU/RAM, respostas 5xx e velocidade de sync.
6. Reversão: voltar ao modo `whatsapp-only` já existente e revogar acesso Web, sem desfazer operações financeiras legítimas.

**Não alterar Render, Neon de produção ou domínio público nesta PR.**
