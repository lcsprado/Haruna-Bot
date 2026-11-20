# Alpha Bot 2.0 — Fase C1: simulação econômica, SEM APLICAÇÃO
17/11/2026 · PR #387 · Branch `feature/reboot-classes-only-20261117`

## Decisão em avaliação
Reduzir a inflação de negócios, preservar a evolução gradual dos quatro jogadores começando com R$ 0/EXP 0 e não tornar obrigatório jogar por horas diariamente. Os números abaixo são **CENÁRIOS**, e não saldos reais de jogadores nem alterações autorizadas da economia.

## Fontes verificadas no código
- `src/neon/progression.js`: catálogo de 9 negócios, preços de compra, 1 unidade por jogador, coleta, cobrança de 10% TAXADE e upgrades Lv1–5 com custo de +20% / +30% / +40% / +50% do preço-base.
- `src/neon/business-profit.js`: conta até o limite de horas da empresa, aplica um multiplicador de nível de 25% por nível além do primeiro; há histórico de tarifas para saldos antigos, que não se deve reaproveitar na V2.
- `src/neon/daily-v2.js`: missões e marcos de sequência continuam distribuindo dinheiro e caixas, cujo teto real **ainda não está balanceado** nesta proposta.
- `src/neon/games.js`: Raids 10–70 têm piscinas `cashPool`, `xpPool`, chaves e custos; Raid 75 é collab, já bloqueada em V2. Piscina NÃO significa prêmio integral por participante.
- `src/neon/db.js`: carreira dá EXP de carreira e salários por nível; não confundir EXP da carreira com EXP de personagem.

## Cálculo replicável, totalmente offline
`node scripts/reboot-economy-sim.mjs` para tabela textual ou `--json` para os 12 cenários completos. Os testes estão em `test/reboot-economy-sim.test.mjs`.

O modelo lê o catálogo do próprio repositório e trava se os nove IDs mudarem. Não conecta a banco, WhatsApp, Render, Vercel, Neon ou Aiven. Nenhuma linha de produção foi editada.

### Hipóteses explícitas (não são as regras implementadas no jogo)
1. Quatro perfis: casual **20 min/dia ativo, 5 dias/semana**; regular **45 min, 6 dias**; dedicado **90 min, 7 dias**; intensivo **180 min, 7 dias**.
2. Todos começam com **R$ 0, sem negócio e EXP 0**. Atividade rende **R$ 12.000/dia ativo** de missões presumidas mais R$ 850/min nos 20 min iniciais, R$ 360/min nos 40 seguintes, R$ 140/min nos 60 seguintes, R$ 70/min após isso. Essas taxas são provisórias: não existem ainda no runtime.
3. O modelo reserva **25%** de cada pagamento de atividade para poções, equipamentos, consertos e outros consumos. O gasto não está implementado como cobrança adicional.
4. Dinheiro dos negócios: **10% TAXADE** existente, mais **10% custo operacional proposto** apenas na simulação; nenhuma TAXADE extra foi criada.
5. Coleta no máximo uma vez por dia ativo; o ganho ausente é limitado pelas horas de capacidade. Uma compra ou upgrade por dia ativo; compras em ordem crescente de preço, upgrades apenas se o ganho marginal devolver o custo em até 30 dias. Dinheiro reservado mínimo R$ 5.000.
6. Nenhum multiplicador de evento, rendimento do CLT Uber/iFood, receitas de Banco, GT, Poço, PvP, Boss, Raid, leilões, bingo, pet, aluguel, IPTU/IPVA ou outras rendas/drenos entra nessa simulação. É proposital para isolar negócios e hábitos de jogo. Não se atribui nível ao personagem: a curva real de EXP ainda exige calibração.

## Política de negócios proposta — NÃO aplicada
Preços permanecem os do catálogo atual para comparar somente rendimento e custos. Nível máximo continua 5. O novo ganho por nível seria **+15%** (em vez de +25%), sem adicionar horas extras ao limite de armazenamento. Todas as tarifas em R$/hora:

| Negócio | Preço atual | R$/h atual | R$/h proposto |
| --- | ---: | ---: | ---: |
| Carrinho de Lanche | 15.000 | 300 | 180 |
| Barbearia | 45.000 | 800 | 450 |
| Loja de Roupas | 120.000 | 2.000 | 1.100 |
| Restaurante | 300.000 | 4.500 | 2.200 |
| Posto de Combustível | 750.000 | 7.000 | 4.200 |
| Supermercado | 1.800.000 | 12.000 | 7.200 |
| Hotel | 4.500.000 | 24.000 | 13.500 |
| Shopping | 12.000.000 | 50.000 | 25.000 |
| Empresa de Tecnologia | 30.000.000 | 110.000 | 42.000 |

No caso extremo de **todos os nove negócios no Lv5**, uma coleta a cada 24h renderia:
- Regra atual: **R$ 8.330.760 líquidos/dia** (10% TAXADE, sem outros impostos).
- Candidato V2: **R$ 2.366.516 líquidos/dia** (10% TAXADE + 10% operação propostos), redução de cerca de **71,6%**.
- Apenas a Empresa de Tecnologia Lv5 passa de **R$ 4.752.000 líquidos/dia** para **R$ 1.290.240** no cenário.
- Esses valores são **capacidade teórica máxima** em 24h de um portfolio completo, NÃO média atual, NÃO dados do banco.

## Simulação de 7/30/60 dias
Patrimônio = carteira restante + valor pago em negócios e upgrades. Não é valor de mercado realizável nem inclui bens/itens/EXP monetizados.

| Jogador-modelo | Patrimônio 7 dias | 30 dias | 60 dias |
| --- | ---: | ---: | ---: |
| Casual (20 min, 5 d/sem) | 117.103 | 771.466 | 2.550.729 |
| Regular (45 min, 6 d/sem) | 187.129 | 1.286.740 | 4.498.033 |
| Dedicado (90 min, 7 d/sem) | 282.346 | 2.083.449 | 6.953.529 |
| Intensivo (180 min, 7 d/sem) | 336.221 | 2.421.493 | 7.687.933 |

Comparação `current` do simulador em 60 dias, **com as MESMAS hipóteses não-negócio** (não são dados de jogadores reais): casual 17.008.596; regular 33.950.092; dedicado 65.580.396; intensivo 67.545.501. Redução drástica indica que a expansão patrimonial anterior é sensível à renda passiva e ao reinvestimento.

### Interpretação e limites
- O intensivo usa 9× os minutos/sessão do casual, mas o modelo lhe entrega ~3× o patrimônio em 60 dias, incluindo sete contra cinco dias por semana. A margem é determinada pelas hipóteses de retorno decrescente; **não há tal limite implementado no jogo ainda**.
- O modelo não prova equilíbrio de Raids, Bosses, Poço, caixas, carreira ou recompensas semanais. Esses fluxos podem superar os valores acima e inviabilizar a proposta.
- A renda de negócios reduzida precisa ser testada junto aos preços de carros, forja, casa, upgrades, drops e poções. Não aprovar apenas porque a emissão cai.
- Não há projeção válida de níveis (1–500) nesta simulação; `totalXp` é hipotético, não convertido pela curva de EXP do personagem.
- A bonificação XP/money de evento deve ter teto independente, sem multiplicação sucessiva de bônus.
- Os quatro jogadores devem começar no mesmo patrimônio e equipamentos; diferença de tempo jogado pode gerar progresso distinto, mas sem acesso exclusivo a conteúdo por estar conectado o dia inteiro.

## Próximo bloqueio antes de implementar a Economia 2.0
1. Inventariar todas as fontes de emissão e retirada de dinheiro/EXP (Raids e chaves, Boss, Poço, daily/streak, GT, Uber/iFood/CLT, leilão, lojas, forja). Indicar **receita por ação**, frequência/cooldown, payout por pessoa, limite e capital inicial.
2. Calcular cenário adverso com eventos duplicadores/loot raro, 24h inatividade e economia de quatro jogadores simultaneamente.
3. Propor tabela unificada e decidir/validar os números finais. **Só depois** aplicar regras ao runtime atrás do modo V2, com testes de regressão integral.
4. Não criar outra base, nem publicar preview Vercel; homologação do banco em separado ocorrerá em etapa autorizada.

Verificações: GitHub Actions `44145955517`: **30 testes dedicados + 87 regressões, todos aprovados**; 12 cenários e contabilidade conferidos; PR #387 permanece rascunho.
