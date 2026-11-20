# Alpha Bot 2.0 — C4a: Transporte e CLT (candidato, não homologado)

Data: 17/11/2026. Branch `feature/reboot-classes-only-20261117`, PR #387 em rascunho.

A economia do Alpha Bot 1.x permanece intacta. Código implementado apenas atrás de `ALPHA_REBOOT_MODE=classes_only`; nenhuma execução no banco atual, serviço ou conta real, nem uso de saldos/testes das últimas 12 horas.

## Riscos que motivaram a mudança
- Uber manual (9min) e iFood manual (6min) remuneravam TODOS os veículos disponíveis em cada execução. Uma frota grande multiplicava emissão sem multiplicar trabalho.
- Eventos de 2×/1,5× entravam nesses dois comandos e poderiam ressuscitar premiações antigas em V2.
- CLT Uber e iFood acumulam a cada intervalo de motorista durante turno de até 8 horas; são renda automatizada adicional a negócios.
- Veículos caros geram tarifas altas, mas preservar diferença real entre categorias e custo de aquisição continua necessário.

## Política V2 candidata, codificada em `src/neon/reboot-transport-policy.js`
| Mecanismo | V1 | V2 candidata |
|---|---|---|
| Uber manual, tarifa individual | 100% do sorteio V1 | 55%, sem bônus monetário de evento antigo |
| iFood manual, tarifa individual | 100% | 60%, sem bônus monetário de evento antigo |
| Veículos pagos em um comando manual | Todos os disponíveis | Apenas os 2 mais valiosos disponíveis; garagem extra é reserva para CLT/trocas |
| TAXADE | 10% (pode multiplicar com evento fiscal) | 10% sem multiplicador fiscal legado |
| Operação/desgaste/fuel | Sem custo adicional nas rotas antigas | 15% do bruto, registrado em `transport_operation` como saída |
| CLT Uber/iFood | Comissão e TAXADE, turno de 8h | Mesmo limite de 8h, proporcional à nova tarifa, comissão preservada e operação 15%; não paga sem turnos |
| Dupla remuneração do mesmo veículo em CLT/manual | Bloqueado enquanto em turno | Continua bloqueado |

### Regra contábil
Manual V2: receita bruta sorteada `× tarifaV2`, TAXADE 10%, operação 15%, líquido de 75% do bruto V2. Sem multiplicadores sazonais de V1. Taxa operacional é uma nova saída monetária, não saldo oculto. Os comprovantes mantêm ganhos brutos, TAXADE e custo operacional separados.

CLT V2: remuneração média-base por corrida `× tarifaV2 × eficiência × (1 - comissão) × (1 - 10% TAXADE - 15% operação)`; só paga corridas concluídas e não ultrapassa a janela de 8 horas.

Exemplo isolado com bruto de R$ 1.000 na V1 (sem tips): na V2 Uber paga R$ 550 bruto, R$ 55 TAXADE, R$ 82 operação, total R$ 413; iFood R$ 600 bruto, R$ 60 TAXADE, R$ 90 operação, líquido R$ 450. Preços de carros e contratação CLT ainda NÃO foram recalibrados, portanto payback e disponibilidade de compra precisam de revisão.

## O que falta antes de aprovar
- Simular 7/30/60/120 dias com até 5 carros e 3 funcionários, incluindo manutenção, gastos de compra e upgrades, mesmo quando offline.
- Validar acessibilidade de comprar o primeiro veículo a partir do zero e rentabilidade real dos modelos caros.
- Mensagens `!uber`, `!ifood`, `!all` e coleta CLT já exibem o custo operacional quando aplicável; falta verificar visualmente em WhatsApp/Web isolados que os detalhes são compreensíveis e não há dupla cobrança.
- Recalcular carreira, trabalho, salários, leilões, banco/empréstimos e impostos fora de transporte; evitar emissão descontrolada por trabalho automático.
- Nenhuma alteração no banco de produção; realizar testes em clone independente somente após autorização específica e confirmação de espaço no Aiven.

A etapa é implementação parcial de transporte, não homologação da economia integral.
