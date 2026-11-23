# Alpha Bot 2.0 — Negócios V3: rentabilidade justa com ciclos de referência

Status: candidato em branch, **DESLIGADO POR PADRÃO**. Não migrar nem tocar na produção antes de homologar testes e aceite.

## Problema confirmado na V2
A Loja de Roupas custa R$120.000, produz R$250 brutos/h e R$200 líquidos/h (10% TAXADE + 10% operação). Mesmo produzindo 24h/dia, o retorno exige 25 dias. O upgrade Lv1→2 custa R$24.000, aumenta o líquido em apenas R$20/h e leva 50 dias para se pagar. Os negócios maiores podem ultrapassar 200 dias de retorno base, piorando o incentivo a investir.

## Princípios
- Preço de aquisição preservado, evitando reprecificar patrimônio ou penalizar quem comprou antes.
- 20% de descontos totais na coleta continuam inalterados. Sem bônus de evento.
- Lucro por hora V3 calibrado por custo e progressão; upgrades Lv.1→5 custam **8%, 10%, 12%, 14%** do preço base (um nível por etapa), com **+20% da receita bruta base por nível**.
- Ciclos de referência: **24h** carrinho/barbearia/loja; **12h** restaurante/posto/mercado; **7h** hotel/shopping/tech. O ciclo indica a cadência recomendada de coleta, NÃO é prazo de expiração, nem impede resgates menores. O comando !coletar já permite coletar após cooldown de 5min.
- Todos continuam acumulando **até 24h de receita offline** desde a última coleta; horas adicionais acima de 24h não são acumuladas. Sem automatizar créditos sem coleta.
- Um corte UTC divide produção antiga e nova: somente segundos trabalhados **após** o instante explícito de ativação usam tarifas e crescimento V3. O saldo pré-corte usa V2, e `accrued_gross` permanece intacto.
- Isolar com `ALPHA_REBOOT_MODE=classes_only`, `ALPHA_BUSINESS_REBALANCE_V3=on` e `ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX=<epoch_seconds_UTC>`. Sem ambas as chaves e o timestamp válido, V3 não ativa.
- A apresentação no WhatsApp mostra o **líquido/h estimado** e a capacidade de 24h. O valor por hora é aproximado, pois taxas e arredondamentos são aplicados sobre o bruto da coleta integral.

## Catálogo proposto — Lv.1

| Negócio | Compra (R$) | Bruto/h (R$) | Líquido/h (R$) | Ciclo | Retorno (24h/dia) | Retorno (10h/dia) |
|---|---:|---:|---:|---:|---:|---:|
| Carrinho | 15.000 | 80 | 64 | 24h | 9,8d | 23,4d |
| Barbearia | 45.000 | 200 | 160 | 24h | 11,7d | 28,1d |
| Loja de Roupas | 120.000 | 400 | 320 | 24h | 15,6d | 37,5d |
| Restaurante | 300.000 | 800 | 640 | 12h | 19,5d | 46,9d |
| Posto | 750.000 | 1.650 | 1.320 | 12h | 23,7d | 56,8d |
| Mercado | 1.800.000 | 3.400 | 2.720 | 12h | 27,6d | 66,2d |
| Hotel | 4.500.000 | 7.000 | 5.600 | 7h | 33,5d | 80,4d |
| Shopping | 12.000.000 | 16.000 | 12.800 | 7h | 39,1d | 93,8d |
| Tech | 30.000.000 | 32.000 | 25.600 | 7h | 48,8d | 117,2d |

**Atenção**: o retorno de 10 horas/dia é cenário de produção ativa/acumulável por 10 horas/dia, não de usuário offline por 14 horas que depois faz uma coleta. Quem coleta pelo menos uma vez por dia recebe até 24h de produção. Os prazos pressupõem que não houve compra de upgrades.

## Emissão agregada e risco de inflação

- 9 negócios todos em Lv.1: R$61.530 brutos/h e **R$1.181.376 líquidos/24h** para um jogador dono de todos.
- 9 negócios todos em Lv.5: aproximadamente **R$2.126.477 líquidos/24h** por proprietário.
- Dez proprietários com todos os nove negócios no Lv.5 podem recolher aproximadamente **R$21,3 milhões/dia** no limite teórico. Não é cenário de jogador iniciante: exige comprar nove negócios (cerca de R$49,5 milhões) e upgrades.
- Antes de liberar, simular 1, 5 e 10 jogadores, posse parcial, Lv.1/3/5, intervalos de 7h/12h/24h e ausência por 36h; comparar emissão diária com saídas por chaves, poções, melhorias, taxas e eventos.

## Gates e plano de implantação
1. Política pura e testes unitários com flag desligada, incluindo versionamento por segundo e verificação de níveis Lv1–5.
2. Testes com PostgreSQL descartável (cobrança + upgrade + duas coletas e falta de saldo), sem tocar Aiven produção.
3. Auditar mensagens WhatsApp, API Web, patrimônio e índices. A descrição de `cycleHours` não pode ser confundida com capacidade nem com taxa.
4. Simular 7/30/60 dias para jogadores com 1, 3 e 9 negócios. Se o teto de emissão for excessivo, ajustar a proposta ANTES da ativação.
5. Backup verificado, branch V3 aprovada, configuração da virada UTC e deploy controlado. Confirmar `ALPHA_REBOOT_MODE=classes_only` no serviço e nunca habilitar na temporada antiga.
6. Verificar duas coletas reais após a virada e conciliar movimentações `business_profit`, `income_tax` e `business_operating`. Rollback pelo flag, sem reset do banco. Se a ativação for revertida, não retroagir rendimentos já creditados.

## Limitações
O perfil de ciclo é um referencial para resgate, não um timer que bloqueia !coletar. O ganho V3 só é possível com o flag explícito. Mudança de saldo de contas antigas, reembolso de compras e redistribuição de patrimônio não fazem parte deste PR.
