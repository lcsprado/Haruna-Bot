# Torre Infinita — estudo econômico de precificação da mineração (24/11/2026)

STATUS: proposta em homologação; NÃO publicar, não executar DDL, não realizar entregas de itens nem cobrança em produção.

## Fonte e método
- Consultas SQL **somente leitura** ao Aiven PostgreSQL `alpha_prod_v2`, em 24/11/2026.
- 5 jogadores cadastrados, 5 ativos na última semana, 4 ativos no último dia, com níveis entre 1 e 83.
- Carteira + banco: mediana R$ 131.948, média R$ 150.101, mínimo R$ 0, máximo R$ 339.015.
- Mediana de saldo **somente na carteira**: R$ 2.160; grande parte da riqueza está no banco.
- Das 192 transações registradas como `purchase`, percentis: p25 R$ 2.000, p50 R$ 4.200, p75 R$ 9.500, p90 R$ 37.480.
- Ganhos de `work` (136 transações): mediana R$ 1.654, média R$ 1.943.
- Carpinar: 4h = R$ 3.200 + 1.000 XP conforme rotina real; transações `carpinar_reward` têm mediana R$ 3.200 (13 registros).
- Renda da mineração proposta: 4h = R$ 800 + 250 XP garantidos, com 0 ou 1 pedra (não afeta tabela antiga de encantamentos).
- Os dados cobrem somente 5 jogadores, com economia recente após reorganização; a amostra é insuficiente para afirmar equilíbrio a longo prazo.
- As somas da tabela `transactions` por tipo não representam necessariamente emissão líquida (há transferências, registros contábeis e custos de RaidLote). Não usar total bruto de transações como renda individual.

## Preços propostos (não aprovados)
| Picareta | Origem | Preço de compra | Pedra / 4h | Usos | Reparo completo | Reparo de 1 uso |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Madeira | Loja | R$ 2.000 | 3% | 4 | R$ 1.200 | R$ 300 |
| Ferro | Loja | R$ 7.500 | 6% | 5 | R$ 3.000 | R$ 600 |
| Aço | Loja | R$ 20.000 | 10% | 6 | R$ 6.000 | R$ 1.000 |
| Ouro | Cerco do Clã | Não vendida | 12% | 7 | R$ 10.000 | R$ 1.429 |
| Diamante | Primeiro evento | Não vendida | 15% | 8 | R$ 15.000 | R$ 1.875 |

Todas as expedições duram 4h e consomem 1 uso no início. O reparo é proporcional à resistência faltante com arredondamento inteiro para cima, não exige outro item e nunca destrói a picareta. A tabela de custos/uso considera reparar apenas um uso. Os valores substituem a proposta inicial de 10 usos e estão **apenas na branch de homologação**.

Escolha dos preços:
1. Madeira custa pouco mais de uma recompensa mediana de `work` ou menos que uma única sessão de Carpinar 4h; permite entrada sem bloquear novatos.
2. Ferro fica abaixo do p75 das compras anteriores e custa cerca de 2,3 sessões de Carpinar 4h.
3. Aço é evolução superior, custa 6,25 sessões de Carpinar 4h, sendo deliberadamente mais caro que a compra mediana.
4. Ouro e Diamante são recompensas exclusivas, SEM preço de loja. O Cerco concede Ouro e o primeiro evento concede Diamante (inversão solicitada).
5. Nas condições atuais, 4/5 carteiras + bancos têm ao menos R$ 20 mil, mas só 1/5 carteiras tem R$ 7.500 ou mais. A compra operacional seguirá regra de pagamento existente da loja, sem mudar mecanismo de retirada bancária por conta própria.

## Renda garantida x custo de reparo (simulação de um ciclo completo)

O valor de R$ 800 e 250 XP é concedido em cada expedição completa, independentemente de encontrar pedra. O gasto com reparo é pago à parte quando o jogador solicita conserto. A coluna de saldo líquido pressupõe um reparo **completo** após usar toda a durabilidade; portanto é saldo teórico de um ciclo completo, não débito automático por expedição.

| Picareta | Usos × 4h | Receita garantida do ciclo | Reparo completo | Saldo em dinheiro após reparo | Probabilidade de ZERO pedras no ciclo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Madeira | 4 / 16h | R$ 3.200 | R$ 1.200 | +R$ 2.000 | 88,5% |
| Ferro | 5 / 20h | R$ 4.000 | R$ 3.000 | +R$ 1.000 | 73,4% |
| Aço | 6 / 24h | R$ 4.800 | R$ 6.000 | -R$ 1.200 | 53,1% |
| Ouro | 7 / 28h | R$ 5.600 | R$ 10.000 | -R$ 4.400 | 40,9% |
| Diamante | 8 / 32h | R$ 6.400 | R$ 15.000 | -R$ 8.600 | 27,2% |

Cálculo de risco: `P(zero pedras) = (1 - chancePorExpedicao)^quantidadeDeUsos`, assumindo sorteios independentes, sem garantia progressiva ou modificadores por evento. O sorteio escolhe no máximo uma das cinco pedras já existentes por jornada.

- Mineração é uma atividade para tentar obter encantamentos, não uma alternativa lucrativa ao Carpinar 4h (R$ 3.200 + 1.000 XP).
- **Atenção:** Madeira tem 88,5% de chance de passar 16h sem pedra, apesar de render dinheiro. Ouro tem 40,9% após 28h e Diamante 27,2% após 32h; sem atribuir valor comercial às pedras, não há comprovação de equilíbrio da manutenção.
- **Ciclo de Diamante:** 8 jornadas concluídas pagam R$ 6.400, contra R$ 15.000 para restaurar; falta R$ 8.600 para o reparo. Seu dono terá de financiar a diferença com outras atividades.
- **Reparo parcial:** não é obrigatório aguardar zero; Ouro com 3/7 usos custa `ceil(4 × 10.000 / 7) = R$ 5.715` e Diamante com 4/8 custa R$ 7.500.
- Os resultados não incluem preço inicial, valor de eventual pedra, valor hipotético de minério, impostos ou bônus de evento; impostos e mercado de minério ainda não foram aprovados.
- Chance da picareta de Ouro (Cerco, 12%) é inferior à Diamante (primeiro evento, 15%), conforme distribuição solicitada. Rever a competição/raridade dos prêmios antes da publicação.
- Manter o limite de três encantamentos por equipamento e máximo de dois percentuais; não acrescentar buffs fora das cinco pedras existentes.

## Critérios mínimos antes de publicar
1. Aprovação explícita dos três preços, das chances, da resistência 4–8 e dos valores de reparo antes da produção.
2. Persistência SQL de posse/durabilidade e resgate de prêmio único, com idempotência para evitar duplicações.
3. Bloqueios transacionais recíprocos com Raidlote, Carpinar, Dormir e outra mineração.
4. Compra/reparo/consumo protegidos contra saldo negativo, concorrência, repetição e cobrança de reparo parcial; testar recuperação de durabilidade desigual.
5. Eventos e Cerco entregando Ouro/Diamante através dos sistemas existentes, sem loja.
6. Testes E2E em banco de TESTE e revisão do dono. **Nenhuma migração ou deploy de produção sem autorização.**
