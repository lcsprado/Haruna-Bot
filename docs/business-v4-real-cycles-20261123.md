# Alpha Bot — correção de negócios V4 (23/11/2026)

Status: proposta testável, V4 desativada por padrão. Objetivo: reverter queda do Carrinho (90→80 brutos/h na V3), encurtar o ROI dos ativos caros e fazer os ciclos 24h/12h/7h realmente controlarem a coleta, sem destruir a produção offline ou reescrever rendimentos passados.

## Política econômica
- Preço de compra e patrimônio atual preservados.
- TAXADE 10% e operação 10% preservados; lucro líquido por hora ~80% do bruto.
- Upgrades preservam o modelo mais acessível V3: 8%/10%/12%/14% do preço base e +20% da tarifa base por nível.
- As tarifas V4 são maiores que as V3 e maiores que as V2 em TODOS os nove negócios.
- O pagamento é calculado apenas na coleta, sem timer/scheduler adicional ou novas consultas por segundo.
- Os ciclos tornam-se critérios reais para coletar: negócios 1–3 liberam o lucro após 24h; 4–6 após 12h; 7–9 após 7h. Se o usuário não coletar na hora, continua acumulando até um teto de 24 horas. A coleta de um negócio não reseta o tempo de outro. Resgates não maduros não alteram o relógio nem a carteira. A primeira coleta com produção pré-virada e créditos consolidados por upgrades são respeitados, sem atrasar dinheiro já devido.
- O comando !coletar mostra o tempo até o próximo ciclo quando não houver negócio pronto. A regra vale igualmente para WhatsApp e Web.

## Taxas no nível 1
| Negócio | Compra R$ | Bruto por hora R$ | Líquido por hora R$ | Ciclo de liberação | Retorno 24h/dia |
|---|---:|---:|---:|---:|---:|
| Carrinho de Lanche | 15.000 | 100 | 80 | 24h | 7,8 dias |
| Barbearia | 45.000 | 220 | 176 | 24h | 10,7 dias |
| Loja de Roupas | 120.000 | 500 | 400 | 24h | 12,5 dias |
| Restaurante | 300.000 | 1.150 | 920 | 12h | 13,6 dias |
| Posto de Combustível | 750.000 | 2.400 | 1.920 | 12h | 16,3 dias |
| Supermercado | 1.800.000 | 5.500 | 4.400 | 12h | 17,0 dias |
| Hotel | 4.500.000 | 12.500 | 10.000 | 7h | 18,8 dias |
| Shopping Center | 12.000.000 | 32.000 | 25.600 | 7h | 19,5 dias |
| Empresa de Tecnologia | 30.000.000 | 75.000 | 60.000 | 7h | 20,8 dias |

O retorno em dias pressupõe coletar todo dia e investir em nenhum upgrade adicional. A primeira coleta após o corte respeita tarifas anteriores nas horas anteriores. Este horizonte é econômico, não contagem de ciclos. Importante: se o jogador não coletar por 36h, só as primeiras 24h acumulam (limite existente), mas nunca apenas as 7h do ciclo.

## Restrição de inflação e riscos
- A taxa bruta combinada dos nove negócios V4 no Lv1 é 129.370 por hora. Isso gera ~R$ 2,48 milhões líquidos por dia para um jogador que comprou todos os nove (~R$ 49,53 milhões de investimento).
- Com todos os negócios no Lv5, a produção dobra de forma moderada (+80%), chegando a ~R$ 4,47 milhões líquidos por dia por magnata. Dez magnatas poderiam receber R$ 44,7 milhões/dia: teto teórico a acompanhar, NÃO uma emissão projetada automaticamente.
- O teto de análise é uma guarda de simulação, não um limite automático individual. Antes de mais aumentos de tarifa, avaliar diariamente o total de business_profit contra sinks (chaves/consumíveis/upgrades) e quantidade de proprietários de alto nível.
- Sem compra automática de negócios, sem migrações SQL, sem reembolso de jogadores nem modificação de dados existentes.

## Corte histórico e rollback
- Requer:
  - ALPHA_REBOOT_MODE=classes_only
  - ALPHA_BUSINESS_REBALANCE_V3=on
  - ALPHA_BUSINESS_V3_EFFECTIVE_AT_UNIX=1795430183 (23/11/2026 10:36:23 UTC)
  - ALPHA_BUSINESS_REBALANCE_V4=on
  - ALPHA_BUSINESS_V4_EFFECTIVE_AT_UNIX=<instante UTC da virada, não anterior ao V3>
- Antes do primeiro corte, renda V2; entre cortes, V3; após o novo corte, V4, com um único arredondamento por negócio no final da soma. O tempo de 24 horas máximo continua ancorado na última coleta.
- Para rollback rápido, desligar ALPHA_BUSINESS_REBALANCE_V4; a taxa V3 retorna. Não apagar compras nem reprocessar créditos de transações anteriores. Uma reativação exige reconciliação do período desativado antes de escolher novo cutover.
- Homologação necessária: unitários + integração dos fluxos existentes; deploy em Render manual e verificação de WhatsApp/Banco, seguido de primeira coleta real para fechamento financeiro.

## Limitação explícita
O ciclo torna o prazo mínimo de resgate mais longo do que a coleta V3 imediata (cooldown de cinco minutos) para pequenos e médios negócios. Isso é intencional para a cadência 24/12/7 do desenho solicitado, mas deve ser comunicado de forma clara nos menus. Não há garantia de equilíbrio macroeconômico se os jogadores passarem a possuir muitos negócios sem sinks equivalentes.
