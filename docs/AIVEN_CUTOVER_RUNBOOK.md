# ALPHA BOT — Migração protegida Neon → Aiven

Status de 21/10/2026: **PREPARADA, NÃO EXECUTADA EM PRODUÇÃO.**

## Ambiente confirmado
- WhatsApp em operação: Render `alpha-bot-whatsapp-m3lc` (serviço `srv-db7qb38u01pc739nlvpg`), branch `whatsapp-only`, `autoDeploy=no`. NÃO alterar outros serviços.
- Outros dois serviços Render conhecidos estão suspensos.
- Neon `neondb` é a única fonte de dados atual; há novas transações a cada atividade.
- Aiven Free PostgreSQL `alphabot` projeto `lcsh-3393` oferece 20 conexões simultâneas no serviço todo.
- Bancos Aiven `defaultdb` (snapshot antigo com 1.040 transações) e `alpha_homolog` (snapshot de testes com 1.078 transações ao copiar) **NÃO são produção**.
- O banco anterior `alpha_prod` foi criado durante a tentativa abortada e deve permanecer intocado. O novo destino definitivo `alpha_prod_v2` só pode ser criado pelo workflow final, depois de pausar o WhatsApp. Não confundir com os snapshots.
- PR Web em rascunho: https://github.com/lcsprado/Haruna-Bot/pull/45
- PR driver WhatsApp/Aiven em rascunho: https://github.com/lcsprado/Haruna-Bot/pull/47
- Testes API, autenticação fictícia, TLS e driver aprovados (GitHub Actions). Nenhum teste iniciou o WhatsApp fora do Render.

## Preparação — sem interrupção
1. Combinar a janela de manutenção; não cortar durante Raid, leilão, pagamentos ou Boss. Comunicar que transações e comandos ficarão temporariamente indisponíveis.
2. Manter o serviço Render do WhatsApp apontando ao Neon até o momento do corte. **Não ligar dois processos WhatsApp com a mesma sessão.**
3. Conferir que o banco Aiven continua no plano `free-1-1gb`, espaço disponível e CA válida.
4. Preservar os três secrets GitHub: `ALPHA_NEON_URI`, `ALPHA_AIVEN_URI`, `ALPHA_AIVEN_CA`. Nunca revelar senhas, URIs nem credenciais em prints/logs.
5. Não executar manualmente `Alpha Bot | Corte final Aiven (protegido)` enquanto houver `trevo-runtime-lock` conectado ao Neon.

## Corte final — **somente com WhatsApp suspenso**
1. No Render, suspender **somente** `alpha-bot-whatsapp-m3lc`. Manter todos os outros serviços WhatsApp suspensos.
2. Confirmar via painel/integracão Render que o estado é `suspended`. Confirmar também que nenhuma atividade do jogo é aceita.
3. Abrir https://github.com/lcsprado/Haruna-Bot/actions/workflows/alpha-aiven-final-cutover.yml → **Run workflow** na `master`. Informar no campo de confirmação exatamente `WHATSAPP_SUSPENSO_E_VERIFICADO`.
4. O workflow exige ausência de sessão `trevo-runtime-lock` no Neon **antes e depois** do dump. Lê um snapshot consistente do Neon, cria um banco **novo** `alpha_prod_v2` no Aiven (aborta se já existir), restaura em transação, compara hashes/contagens **de todas as tabelas** e sequências. Não modifica `defaultdb` nem `alpha_homolog`.
5. **Se o workflow falhar, NÃO alterar Render**. Analisar resultado. Se for preciso devolver o bot ao ar antes de resolver, reativá-lo apontando ainda ao Neon.
6. Se concluir **Success**, verificar nome `alpha_prod_v2`, total de jogadores, carteiras, pets, inventário, sessões Baileys, transações, forjas e sequências. O Neon deve permanecer sem qualquer escritor.

## Atualizar o WhatsApp — ainda dentro da janela
1. Fazer merge de PR #47 somente após verificar status e mudanças. Essa PR é limitada a TLS/CA + pool, sem regras do jogo.
2. No **mesmo** serviço Render ativo, atualizar `DATABASE_URL` com a **Service URI do Aiven alterando somente o banco de `defaultdb` para `alpha_prod_v2`**. Não usar URL do Neon e não apontar o WhatsApp para `alpha_homolog`.
3. Configurar `ALPHA_AIVEN_CA_PEM` com o certificado **público** completo disponível em Aiven → Connection information → CA certificate → Copy. O código exige TLS verificado, sem `rejectUnauthorized:false`.
4. Configurar `ALPHA_DB_POOL_MAX=5`. Preservar todos os demais parâmetros de sessão WhatsApp, grupo, autenticação e regras existentes.
5. Fazer deploy deliberado do commit aprovado em `whatsapp-only` (autoDeploy está desativado); depois reativar o serviço Render. Não permitir dois processos WhatsApp simultâneos.
6. Conferir `/health`, logs de abertura do WhatsApp, uma consulta simples ao banco `alpha_prod_v2`, perfis/inventário sem escrita, integridade dos pets, negócio, Boss e forja. Depois testar **uma** operação legítima controlada, sem créditos artificiais.
7. Manter API Web **desligada** até confirmar que o `!web` cria e consome códigos no MESMO Aiven `alpha_prod_v2` e que há uma hospedagem de API separada e saudável. Não usar Neon e Aiven simultaneamente como bancos graváveis.

## Reversão — regras inegociáveis
- **Antes da primeira ação gravável em Aiven:** suspender o WhatsApp, restaurar o `DATABASE_URL` Neon e remover a configuração específica do Aiven se necessário; reativar Render. Neon original permaneceu intacto.
- **Após qualquer escrita legítima no Aiven:** NÃO voltar diretamente ao Neon. Isso perderia dinheiro, inventários, pets ou sessões conquistados após o corte. Pausar novamente, comparar o delta e migrar/conciliar as novas operações antes de escolher qual banco ficará como produção.
- Não restaurar backups por cima de dados legítimos. Não usar dados artificiais, valores ajustados manualmente ou testes de forja real.
- Não cancelar o Neon antes de validar todas as funcionalidades e uma estratégia de backup do Aiven.

## Critérios de conclusão
- `alpha_prod_v2` restaurado + comparação 100% de tabelas, hashes e sequências.
- WhatsApp único estável no Render e usando Aiven.
- Sem novas movimentações no Neon após congelamento.
- Pool WhatsApp 5 + pool API 3, total máximo configurado 8 (fora conexões administrativas), com folga no limite de 20.
- Login `!web` e ações Web só depois de compartilhem `alpha_prod_v2`; liberação 1 jogador e então até 4 com observação da banda/CPU/conexões.
- Plano de reversão e backup documentados.

**Não declarar migração definitiva concluída antes de todos estes passos.**
