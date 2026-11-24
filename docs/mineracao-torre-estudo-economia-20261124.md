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
| Picareta | Origem | Preço de compra | Pedra / 4h | Reparo 10 usos | Reparo por uso |
| --- | --- | ---: | ---: | ---: | ---: |
| Madeira | Loja | R$ 2.000 | 3% | R$ 500 | R$ 50 |
| Ferro | Loja | R$ 7.500 | 6% | R$ 800 | R$ 80 |
| Aço | Loja | R$ 20.000 | 10% | R$ 1.200 | R$ 120 |
| Ouro | Cerco do Clã | Não vendida | 12% | R$ 1.600 | R$ 160 |
| Diamante | Primeiro evento | Não vendida | 15% | R$ 2.000 | R$ 200 |

Escolha dos preços:
1. Madeira custa pouco mais de uma recompensa mediana de `work` ou menos que uma única sessão de Carpinar 4h; permite entrada sem bloquear novatos.
2. Ferro fica abaixo do p75 das compras anteriores e custa cerca de 2,3 sessões de Carpinar 4h.
3. Aço é evolução superior, custa 6,25 sessões de Carpinar 4h, sendo deliberadamente mais caro que a compra mediana.
4. Ouro e Diamante são recompensas exclusivas, SEM preço de loja. O Cerco concede Ouro e o primeiro evento concede Diamante (inversão solicitada).
5. Nas condições atuais, 4/5 carteiras + bancos têm ao menos R$ 20 mil, mas só 1/5 carteiras tem R$ 7.500 ou mais. A compra operacional seguirá regra de pagamento existente da loja, sem mudar mecanismo de retirada bancária por conta própria.

## Renda mínima efetiva e riscos
- Cada uso de picareta gera, se concluído, R$ 800 e 250 XP, antes de eventual regra tributária que **não está definida para mineração**.
- Se distribuído o preço do reparo uniformemente, o saldo de dinheiro garantido por jornada é Madeira R$ 750, Ferro R$ 720, Aço R$ 680, Ouro R$ 640 e Diamante R$ 600 (não inclui preço inicial, pedras nem itens opcionais).
- Carpinar 4h paga 4 vezes mais dinheiro e XP. Mineração deve ser escolhida **pela chance de pedra**, não para obter renda.
- Chance média de ao menos uma pedra em 10 expedições (40 horas de mineração): Madeira 26,3%, Ferro 46,1%, Aço 65,1%, Ouro 72,1%, Diamante 80,3%. Isto pressupõe sorteios independentes.
- **Alerta de design**: com a Madeira (3%), cerca de 73,7% dos jogadores podem completar dez jornadas de 4h sem uma única pedra. É um risco de frustração; revisar chance antes da publicação ou aceitar intencionalmente a raridade.
- **Alerta de progressão**: Ouro do Cerco (12%) tem chance inferior à Diamante do evento (15%). Respeita a distribuição solicitada; confirmar se Cerco deve ser mais competitivo em outro aspecto.
- Manter limites de encantamento existentes; não adicionar bônus de ATK/CRIT além das cinco pedras atuais sem homologação.
- Não criar fragmentos, materiais de reparo, tickets ou moedas extras nesta primeira versão.

## Critérios mínimos antes de publicar
1. Aprovação explícita dos três preços e das chances por picareta.
2. Persistência SQL de posse/durabilidade e resgate de prêmio único, com idempotência para evitar duplicações.
3. Bloqueios transacionais recíprocos com Raidlote, Carpinar, Dormir e outra mineração.
4. Compra/reparo/consumo protegidos contra saldo negativo, concorrência e tentativas repetidas.
5. Eventos e Cerco entregando Ouro/Diamante através dos sistemas existentes, sem loja.
6. Testes E2E em banco de TESTE e revisão do dono. **Nenhuma migração ou deploy de produção sem autorização.**
