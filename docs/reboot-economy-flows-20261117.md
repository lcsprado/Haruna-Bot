# Alpha Bot 2.0 — Economia C2: auditoria de prêmios por fonte
Data: 17/11/2026 · PR #387 · Somente arquivos do GitHub, sem banco.

## Regra de isolamento desta auditoria
O dono informou que a base atual está sendo usada em testes com créditos e débitos manuais. Não analisar nem corrigir os últimos 12 horas de saldos; não usar histórico, banco, JIDs nem comportamento recente para estimar a economia nova. A informação usada é o código versionado no PR.

Reproduzir: node scripts/reboot-economy-flow-audit.mjs --json

## Prêmios efetivamente encontrados no código
| Fonte | Valores em moeda fictícia | Como interpretar |
| --- | ---: | --- |
| Superboss | R$ 50.000.000 | Um único pool semanal dividido por dano, na política de 20/11/2026 em diante |
| GT ranking semanal | R$ 29.000.000 | R$ 15M / 8M / 5M / 1M para os quatro melhores |
| GT três provas diárias | Até R$ 2.070.000 no conjunto de quatro pilotos classificados em 1º–4º nas três etapas | Depende de participação, classificação e execução das provas; não é prêmio fixo por jogador |
| Poço ranking da edição 16–20/11 | R$ 50.000.000 | R$ 25M / 15M / 10M, uma edição sazonal, não mensal ou semanal |
| Poço completando os 30 andares | R$ 3.500.000 por jogador que completar a temporada | Pagamento por andar, sem caixas ou sorteios |
| Poço drop exclusivo | Equipamento ★★★★★ Lv.10 | Fortíssimo estímulo à inflação de poder; não é valor em dinheiro |
| Resgate diário em nível baixo | R$ 15.000/dia + bônus de sequência | 30 dias consecutivos com nível baixo: potencial acumulado R$ 2.450.000 |
| Missões diárias (5 principais) | Até R$ 155.000 nas cinco missões de maior prêmio | Depende do quadro rotativo e cumprimento; missão especial e caixas são adicionais |
| Raid Lv.70 | Pool R$ 710.000 com chave R$ 390.000 | Pool repartido; não é saque líquido de cada participante |
| RaidLote | Máximo 10 tentativas, taxa 10% do custo da chave e 50% do lucro manual líquido por vitória | Derrota não devolve pacote; não equivale a 50% do prêmio bruto |

As referências estão em src/neon/weekly-boss-prize-pool.js, gt-alpha-rules.js, poco-abismo-rules.js, poco-abismo-rewards.js, daily-v2.js, daily-mission-rotation.js, games.js, raid-lote-policy.js e progression.js.

## Pressão econômica, não projeção de dinheiro
O somatório de três pools de ranking de períodos distintos (50M Boss semanal + 29M GT semanal + 50M Poço de uma única edição) seria R$ 129 milhões. NÃO é uma renda semanal recorrente, NÃO é garantia a todos os quatro jogadores e NÃO significa que o mesmo grupo receberá tudo. Serve somente para mostrar a escala potencial dos prêmios contra a economia inicial.

Na simulação anterior C1, o patrimônio gerado em sete dias para os quatro perfis, todos começando com R$ 0, soma aproximadamente R$ 923 mil. O cenário misto de R$ 129 milhões representa cerca de 140 vezes essa referência; é uma comparação de pressão entre períodos diferentes, não uma previsão.

## Falhas de desenho ainda abertas
- Premiações de ranking podem anular a progressão pelo trabalho e pelos negócios, especialmente com apenas quatro jogadores.
- GT concede XP de personagem por porcentagem do necessário ao próximo nível: 60% por prova ao primeiro colocado. Três vitórias podem acelerar muito o crescimento, além do XP do piloto que é separado.
- Poço entrega alguns itens diretamente ★5 Lv.10, contornando parte da progressão da forja.
- Os pagamentos por Raid têm dependência de chave, dano, vitória e número de participantes, portanto não usar cashPool como receita pessoal.
- Resgate diário + missões + caixas pode exceder a faixa de dinheiro projetada antes de chegar aos grandes bosses.
- Leilão, bingo, Uber/iFood/CLT, patrocinadores GT, empréstimos, impostos, caixas e eventos 2×/3× ainda não foram incluídos na simulação econômica consolidada.

## Próxima decisão técnica
Definir orçamento semanal e sazonal específico da V2 para premiações de ranking, com teto agregado e regras de elegibilidade; em separado, recalibrar XP do GT e raridade do Poço. Modelar número de jogadores ativos (1, 2, 3 e 4) e resultados de vitória/derrota de Raid antes de fixar valores. Nunca aplicar redução proporcional cega sem conferir custos de chave, reparos e progressão.

O marco C2 é somente um inventário reproduzível, não uma mudança de política monetária. Nenhum deploy, reset, alteração em banco ou criação de serviços está autorizado.
