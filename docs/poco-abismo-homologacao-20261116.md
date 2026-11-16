# Poço do Abismo — Temporada piloto (16–20/11/2026)

Status deste PR: **HOMOLOGAÇÃO / PRÉVIA — NÃO PUBLICAR / SEM PRÊMIOS REAIS**.

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
- Uma rolagem de drop por Guardião por dia brasileiro; repetição ilimitada não gera farm ilimitado.
- Loot natural por rolagem: 0,60% um dos 5 exclusivos (0,12% cada); 4% caixa lendária; 12% caixa épica; 20% materiais; 25% fragmentos; 10% dinheiro extra; 28,4% vazio. Sem pity nem garantia de drop.
- Equipamentos exclusivos deverão ser entregues **prontos**, ★★★★★ nível 10, arma/armadura/elmo/escudo/botas, com pequena superioridade sobre referências atuais e funcionalidade real na ficha, inventário e combate.
- Ranking na sexta com R$ 25M/R$ 15M/R$ 10M para 1º/2º/3º, **ainda não automatizado neste PR**.

## Restrições a concluir ANTES da liberação
1. Integrar os cinco equipamentos com \`EQUIPMENT\`, \`equipmentStatsAtLevel\`, inventário, equipamento, escudo, botas e renderização. O sistema atual só aceita certas origens para ★★★★★; não cadastrar sem testes end-to-end.
2. Conceder prêmios **atomicamente e de modo idempotente** (claim por andar, drop por Boss/dia, cash e EXP). Nunca pagar apenas pela repetição nem gerar loot duplicado após restart/retry. Validar Caixa Épica/Lendária e tabelas de conteúdo antes da implementação.
3. Implementar encerramento irrevogável às 21h e ranking final + pagamento único transacional de R$ 50M; nenhum tempo/tentativa após esse instante pode alterar colocação.
4. Cronômetro de 120s deve contar da **entrega confirmada** da mensagem de ação, sem punir fila de saída/reconexão. O preview atual conta da criação da decisão; não habilitar em produção sem corrigir isso.
5. Validar prévia com cenário sem poções, dano, desconexão, reinício, resposta duplicada, ataques simultâneos e corrida de banco. Incluir regressões WhatsApp, Web, autenticação, Boss/Raid, garagem e Cerco.
6. Preservar a paridade com a versão Web onde aplicável. Em produção, a Web pode apenas consultar inicialmente; não duplicar motor de combate/pagamento.
7. CI/Node: \`node --test test/poco-abismo-temporada1.test.mjs\`, \`npm run check\`, e suites obrigatórias do \`AGENTS.md\`. Abrir preview no ambiente certo, sem alterar campanhas/contas reais.
8. Confirmar SHA no Render e Vercel; deploy do Render é manual. Não mesclar/publicar este PR sem homologação.

## Arquivos
- \`src/neon/poco-abismo-rules.js\`: combate, normalização, probabilidades, pontuação, relatório.
- \`src/neon/poco-abismo-preview.js\`: comandos e agendamento sob flag, estado de simulação sem créditos.
- \`test/poco-abismo-temporada1.test.mjs\`: testes unitários de regras.
- \`src/neon/index.js\`: apenas registro controlado da prévia (inativa por padrão).
