# Alpha Bot 2.0 — Economia unificada, revisão C3 (17/11/2026)

Status: implementação PARCIAL exclusivamente na branch `feature/reboot-classes-only-20261117`, PR #387 em rascunho. Nenhuma publicação, cópia de banco, gasto de infraestrutura, reset, alteração de saldos ou sessão WhatsApp.

## Princípio econômico
O Alpha Bot 2.0 começa com quatro jogadores no nível 1, sem dinheiro, itens ou imóveis, mantendo as quatro classes originais. A moeda é gerada por atividade e investimento; os eventos não podem distribuir uma fortuna equivalente a meses de progressão. Recompensas extraordinárias devem preferir materiais, equipamentos de progressão, títulos e conquistas, não dinheiro ilimitado. O gasto é calibrado junto ao ganho: não reduzir premiações mantendo chaves e lojas caríssimas.

Ignorar a telemetria e as movimentações dos jogadores reais nas últimas 12 horas: os saldos do Alpha Bot 1.x estão sendo artificialmente creditados/debitados para testes. Todas as cifras abaixo vêm de constantes do Git e do cenário proposto.

## Orçamento proposto e isolamento V2

| Origem | V1 atual no código | 2.0 proposta | Estado no PR #387 |
| --- | ---: | ---: | --- |
| Superboss semanal (pool único) | R$ 50.000.000 | R$ 240.000 | Conectado à V2; legado preservado |
| GT — ranking semanal, 4 posições | R$ 29.000.000 | R$ 145.000 (70k/40k/25k/10k) | Conectado à V2 |
| GT — 3 corridas, total dos 4 primeiros | R$ 2.070.000 | R$ 54.000 | Conectado à V2 |
| GT vencedor — EXP do próximo nível por prova | 60% | 6% | Conectado à V2; XP do piloto permanece separado |
| Poço — ranking de 16–20/11, três posições | R$ 50.000.000 | R$ 230.000 por temporada (120k/70k/40k) | Somente política candidata; evento histórico NÃO é reativado |
| Poço — conclusão de 30 andares | R$ 3.500.000 | R$ 114.500 | Somente política candidata; criar nova temporada com novo ID |
| Diário nível inicial, 30 resgates + marcos | R$ 2.450.000 | R$ 140.000 | Conectado ao resgate V2; não altera V1 |
| Cinco missões de maiores prêmios | R$ 155.000 sem multiplicadores de nível | R$ 19.500 | Conectado às missões V2, com orçamento por tipo sem multiplicador de moeda por nível |
| Missão especial | R$ 25.000 | R$ 7.000 | Conectado à V2 |
| Negócios — nove Lv5, uma coleta 24h | ~R$ 8,33 milhões líquidos | ~R$ 2,37 milhões líquidos (cenário C1) | Conectado à coleta/upgrades da V2: operação 10% + TAXADE 10%, sem evento multiplicador |
| Raids 10–70 — chaves, pool e XP | Altos | Tabela abaixo | Conectado ao catálogo, lobby, entrada, combate e loja no modo V2 |

A política pura central fica em `src/neon/reboot-economy-policy.js`. `ALPHA_REBOOT_MODE=classes_only` é exigido; desativado por padrão. Não reutilizar nem fundir bancos. `src/neon/weekly-boss-prize-pool.js`, `src/neon/gt-alpha-rules.js`, `src/neon/gt-alpha-event.js`, `src/neon/daily-v2.js` e `src/neon/games.js` têm caminhos opt-in. O Poço histórico não foi alterado.

## Raids — dificuldade e preços candidatos

| Raid | Chave V2 | Pool de referência V2 | XP pool V2 |
| ---: | ---: | ---: | ---: |
| 10 | 2.000 | 12.000 | 600 |
| 15 | 3.000 | 16.000 | 800 |
| 20 | 4.500 | 24.000 | 1.200 |
| 25 | 6.000 | 32.000 | 1.700 |
| 30 | 9.000 | 45.000 | 2.500 |
| 40 | 14.000 | 65.000 | 3.800 |
| 50 | 22.000 | 90.000 | 6.000 |
| 60 | 32.000 | 125.000 | 8.500 |
| 65 | 45.000 | 160.000 | 11.000 |
| 70 | 60.000 | 200.000 | 14.000 |

Os pools não são dinheiro individual garantido: o motor calcula o prêmio usando a chave e a participação. A loja e a compra automática usam o mesmo preço da chave na V2. RaidLote aplica a regra de 50% do lucro manual líquido apenas nas vitórias e não deve fabricar lucro infinito. Precisamos simular 1–5 jogadores, consumo de poções e probabilidade de derrota antes de congelar todos esses valores.

### Raid 70: não pode ser solada no lançamento
- A V2 requer pelo menos **3 jogadores distintos na sala**, cada um com nível de personagem **90 ou superior**.
- HP base candidato **1.600.000** em vez de 710.000; ataque base **320** em vez de 200, antes do ajuste de HP pelos participantes. Com 3 jogadores, o multiplicador existente de +12% por membro extra dá **1.984.000 HP**.
- No resultado, pelo menos **2 jogadores distintos precisam causar 5% do dano total cada**. Se não houver contribuição mínima, o combate termina sem prêmio — isso precisa ser comunicado claramente na interface e testado com funções de suporte antes do lançamento.
- **RaidLote Lv.70 bloqueada** antes de debitar chave, taxa ou pacote; orientações de compra da V2 não a recomendam.
- Solo NÃO tem desbloqueio automático por data, level ou equipamento na V2. Poderá ser estudado mais tarde com telemetria de uma temporada real e novos critérios, sem reaproveitar saldos da V1.
- O perfil de Paladino/tanque e efeitos de proteção devem ser considerados em futura regra de participação; validar no teste integrado antes da homologação.

## Ainda fora do runtime econômico V2
Esta política não completa a reforma da economia. Os principais sistemas pendentes são:
- Uber, iFood e motoristas CLT: tarifa/rota, compra e reparo de veículo, efetividade, comissões, máximo de turno e ganho por hora.
- Negócios: taxas C1, +15% por nível, capacidade fixa, operação 10% e TAXADE 10% já estão ligados ao modo V2; ainda validar o retorno das compras e rentabilidade de cada upgrade.
- Novos calendários de Poço e Boss comuns: excluir sessões/premiações antigas, redefinir drops sem peças ★5 Lv10 grátis e garantir idempotência.
- Casas, veículos, garagem GT, tuning, manutenção, forja, lojas, relíquias, banco/empréstimos, leilão, bingo, cofres, eventos bônus, PvP e clãs: rever gastos/retornos.
- Progressão de níveis e atributos das quatro classes: estimar curva 7/30/60/120 dias após consolidar EXP, stamina, cooldown e frequência.
- Remover remuneração excepcional sem teto ou repasses por repetição de evento; manter histórico auditável e compras/licenças reais protegidos.

## Critérios de aceite de uma economia reformulada
1. Emissões e gastos consolidados por ação, jogador, dia e semana; verificar teto por evento e por temporada.
2. Simular casual, regular, dedicado e intensivo em 7/30/60/120 dias, começando de zero; separar caixa, banco, ativos, itens e EXP.
3. Dificuldade simulada de Raid 70 com 1/2/3/4/5 jogadores, classes diferentes, nível 90 e equipamento comum/melhorado; nenhuma vitória solo ou com passageiros inativos.
4. EXP de personagem, piloto e pet não são equivalentes; boosts não multiplicam vários eventos cumulativamente.
5. Mercado, lojas, chaves e custos de reparo coerentes com a renda da temporada nova; nenhum prêmio exclusivo ressurge.
6. Suite integral verde, teste em banco clone independente e aprovação separada antes de qualquer deploy.

**Não usar a economia atual como dados históricos de benchmark: movimentações e saldos recentes estão sendo manipulados por jogadores/testes.** 

### Marco C3b — coleta de negócios isolada
- `businessIntervalGrossV2` ignora as mudanças históricas de tarifas de novembro de 2026 e limita a coleta pela capacidade própria, sem bônus de horas por nível.
- Compra, catálogo, upgrade, listagem e coleta usam o mesmo valor por hora no modo V2; a V1 mantém suas tarifas originais.
- A coleta registra 10% TAXADE + 10% de custo operacional, sem multiplicador de evento ou correção antiga de jogador. Custos de aquisição e upgrades ainda precisam de análise de payback para aprovação.
- Nunca copiar `user_businesses` nem `accrued_gross` da V1 para o banco limpo da V2.
