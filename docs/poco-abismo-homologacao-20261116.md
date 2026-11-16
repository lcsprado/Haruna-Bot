# Poço do Abismo — Temporada piloto (16–20/11/2026)

Status deste PR: **HOMOLOGAÇÃO — NÃO PUBLICAR**. O controlador de premiação real existe, mas está desligado por padrão. Nenhum crédito ou alteração foi executado no ambiente de produção.

## Base e isolamento
- Base obrigatória: \`whatsapp-only\`; nunca usar \`master\` histórico.
- \`POCO_ABISMO_PREVIEW\` ausente ou diferente de \`true\`: não registra comandos, não roda temporizador, não altera banco.
- Prévia ligada apenas em ambiente de teste: \`!poco iniciar\`, \`!poco 1|2|3|4\`, \`!poco sair\`, \`!poco ranking\`, \`!poco relatorio\`.
- Estado independente em \`trevo_settings\` por JID, chave \`poco_abismo_preview_20261116:player:<jid>\`, com lock transacional; sem refazer atributos reais nem consumir poções/itens reais.
- Preview acumula \`pendingCash\` e \`pendingDrops\` **somente como dados de simulação**. Sem UPDATE de wallets, sem INSERT de inventories, sem pagamentos finais.

## Regras aprovadas do design
- Semana de 16/11/2026 até **sexta-feira 20/11/2026 às 21h (Brasília)**.
- 30 andares, seis Guardiões (5, 10, 15, 20, 25, 30).
- Tentativas ilimitadas. Cada tentativa começa no andar 0 e mantém herói, classe, equipamento e pets em snapshot.
- Inimigos normais automáticos; decisões contra Guardiões: atacar, defender, curar, usar técnica especial.
- 120 segundos por decisão. Prazo vencido, morte ou desistência termina a tentativa. Recorde permanece.
- Rank: maior andar **concluído**, menor quantidade de **rodadas virtuais**, maior HP, mais poções, primeiro horário de conclusão e JID final para não compartilhar colocação. Tempo de leitura/latência do WhatsApp NÃO é tempo competitivo.
- Normalização com bônus total de progressão permanente ≤5% e trade-offs de classes. Simulação de 200 sementes com tática de defesa/cura: Diane 149/200, Ban 145/200, Meliodas 155/200 conclusões, num cenário de avaliação (não são odds garantidas).
- O Guardião anuncia sua habilidade antes da escolha, e relatórios registram a razão da derrota.
- Dinheiro por andar concluído **uma única vez por temporada**: faixas 30/50/80/120/170/250 mil por andar nos blocos 1–5 / 6–10 / 11–15 / 16–20 / 21–25 / 26–30, total R$ 3,5M se completar todos os 30.
- Cinco rolagens de drop por dia brasileiro, exclusivamente nos Guardiões 10, 15, 20, 25 e 30. O Guardião 5 não concede saque raro; todos os andares mantêm as recompensas de primeira conclusão. Repetição ilimitada não gera farm ilimitado.
- Loot natural por rolagem: 0,60% um dos 5 exclusivos (0,12% cada); 4% caixa lendária; 12% caixa épica; 20% materiais; 25% fragmentos; 10% dinheiro extra; 28,4% vazio. Sem pity nem garantia de drop.
- Equipamentos exclusivos deverão ser entregues **prontos**, ★★★★★ nível 10, arma/armadura/elmo/escudo/botas, com pequena superioridade sobre referências atuais e funcionalidade real na ficha, inventário e combate.
- Ranking na sexta com R$ 25M/R$ 15M/R$ 10M para 1º/2º/3º, com liquidação única implementada e cronograma de execução somente quando a flag real estiver ligada.

## Restrições a concluir ANTES da liberação
1. **Implementado no código e em teste:** os cinco equipamentos constam no catálogo, escudo e botas são reconhecidos pelo combate, e a função de recompensa concede uma única cópia ★★★★★ Lv.10. Ainda falta validação com banco real e Web.
2. **Implementado e simulado:** claims por andar, Boss/dia, caixa e ranking; dinheiro e EXP concedidos dentro da mesma transação da batalha, com reversão se qualquer operação falhar. Testes cobrem 30 andares, cinco rolagens diárias, abertura de caixa, primeiro prêmio e retransmissão. Validação de commit/rollback, forja, abertura de caixa e liquidação com PostgreSQL real descartável no GitHub Actions concluída; ainda falta teste de sessão WhatsApp e ambiente de homologação completo.
3. A liquidação e o ranking final estão em `poco-abismo-settlement.js`: fechamento às 21h, andar/rodadas virtuais e pagamento único de R$ 50M. O controlador real os chama pelo agendador somente com `POCO_ABISMO_LIVE=true` e `POCO_ABISMO_PREVIEW!=true`. A implantação e a flag **não** foram ativadas.
4. Cronômetro de 120s: o preview agora começa após resolução positiva de `sock.sendMessage` (envio ao servidor WhatsApp), **não** após leitura/entrega ao aparelho. Uma falha de envio deixa o turno pendente, sem morte por tempo; `!poco` pode reenviar, e tokens impedem que um ACK antigo reinicie o relógio. Falta validar a confirmação efetiva de entrega, desconexão/reenvio e corrida de mensagens no ambiente WhatsApp.
5. Validar prévia com cenário sem poções, dano, desconexão, reinício, resposta duplicada, ataques simultâneos e corrida de banco. Incluir regressões WhatsApp, Web, autenticação, Boss/Raid, garagem e Cerco.
6. Preservar a paridade com a versão Web onde aplicável. Em produção, a Web pode apenas consultar inicialmente; não duplicar motor de combate/pagamento.
7. CI/Node: \`node --test test/poco-abismo-temporada1.test.mjs\`, \`npm run check\`, e suites obrigatórias do \`AGENTS.md\`. Abrir preview no ambiente certo, sem alterar campanhas/contas reais.
8. Confirmar SHA no Render e Vercel; deploy do Render é manual. Não mesclar/publicar este PR sem homologação.

## Arquivos
- \`src/neon/poco-abismo-rules.js\`: combate, normalização, probabilidades, pontuação, relatório.
- \`src/neon/poco-abismo-preview.js\`: comandos e agendamento sob flag, estado de simulação sem créditos.
- \`test/poco-abismo-temporada1.test.mjs\`: testes unitários de regras.
- \`src/neon/index.js\`: roteamento para prévia ou controlador real, ambos desligados por padrão.

## Rodada de implementação 16/11 — continuação
- O relógio de 120s começa após sucesso de `sock.sendMessage`; falha de envio mantém turno pendente sem punir o jogador. `!poco` reenvia decisão pendente sem avançar o turno, e token de sequência rejeita confirmações antigas.
- ID de mensagem enviado pelo roteador WhatsApp e cache transacional limitado a 80 mensagens por jogador impedem retransmissão da mesma ação.
- Os testes `poco-abismo-delivery.test.mjs` e `poco-abismo-settlement.test.mjs` validam prazo, reenvio, fim da temporada, ordenação e isolamento de preview.
- Prévia não credita dinheiro/EXP/equipamento: manter PR como draft até homologação completa do fluxo real.

## Integração real no código (sem publicação)
- `src/neon/poco-abismo-live.js`: controlador real separado da prévia; requer flag explícita `POCO_ABISMO_LIVE=true` (se a flag de prévia também estiver ligada, o modo real não inicia).
- Ações, recompensas e progresso usam a mesma transação PostgreSQL, com chave de claim exclusiva por jogador e temporada.
- O relógio de decisão começa após confirmação de envio do WhatsApp e não conta a fila de processamento do bot. As respostas são deduplicadas por ID de mensagem.
- `src/neon/poco-abismo-rewards.js`: caixa, material, EXP, cash e equipamento já forjado; invocar somente dentro de transação real.
- `src/neon/poco-abismo-settlement.js`: prefixo de produção diferente da prévia, fechamento único, ranking determinístico e premiação ao Top 3.
- `test/poco-abismo-rewards.test.mjs`: simulação ponta a ponta completa, sem banco de produção.
- `test/anti-crit-shields.test.mjs` e `test/shield-forge-integration-20261108.test.mjs`: os seis escudos históricos continuam com verificações específicas; sétimo modelo é validado em separado.

### Bloqueadores de publicação
- Não há validação manual do fluxo com WhatsApp e banco isolado de testes; o GitHub Actions simula as transações, mas não comprova comportamento de rede, sessões nem latência real.
- Verificações gerais de Web/Altar, heróis, Superboss e Raid Lote continuam falhando no CI por expectativas que não correspondem ao código na base `whatsapp-only`; corrigir em trabalho separado. Não modificar mecânicas antigas para "fazer o teste passar" no PR do Poço.
- Não houve merge, deploy no Render nem alterações diretas de saldo/inventário reais.

### Regressão de atomicidade e elegibilidade — 16/11
- O controlador `poco-abismo-live.js` utiliza `pocoRunPlayerTransaction` para gravar estado, claims e créditos na mesma transação PostgreSQL.
- CI independente sobe PostgreSQL 16 descartável e executa `test/poco-abismo-postgres.test.mjs`, sem nenhuma credencial de produção, testando falha injetada após a concessão e rollback de saldo, EXP e progresso.
- O teste valida a exclusividade da peça ★★★★★ Lv.10, caixa aberta uma vez e a liquidação final única.
- São seis Guardiões, mas somente cinco oportunidades de saque por dia (10/15/20/25/30); o Guardião 5 mantém apenas dinheiro/EXP de primeira conclusão.
- O CI principal ainda possui falhas de expectativas históricas em módulos externos ao Poço. O merge/deploy segue bloqueado até classificação e homologação final.
