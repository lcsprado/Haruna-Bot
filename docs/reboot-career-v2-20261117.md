# Alpha Bot 2.0 — C4b: salarios e progressão de carreira
Data: 17/11/2026. PR #387. Apenas código da V2 em rascunho, V1 sem alterações.

## Mudança funcional isolada na V2
- `!trabalhar` mantém 30 minutos de cooldown.
- Salário-base por turno: Lv1–20 R$1.400; 21–50 R$1.900; 51–100 R$2.600; 101–150 R$3.400; 151–200 R$4.300; 201–250 R$5.500; acima R$7.000.
- Multiplicador de cargo V2: `1 + (multiplicadorLegado - 1)*0.45`; de Ajudante 1× a CEO 2,35×. Promoções ainda valem, sem remuneração descontrolada.
- Bônus de desempenho V2 no máximo +15%, mínimo -15%; sem evento x2/x3 antigo e sem dobro de XP profissional.
- XP de carreira de 20 a 30 por trabalho; não confundir com EXP de personagem. Os marcos de cargo não foram alterados.
- Mensagem de `!carreira` mostra o multiplicador efetivamente aplicado no modo V2, não o multiplicador legado.
- TAXADE na V2 10% fixa; sem cobrança nova de imposto do trabalho. O código V1 e suas fórmulas permanecem funcionais e testados.

## Exemplo numérico hipotético, não são pagamentos de jogadores
- Lv1 Ajudante, expediente normal: R$1.400 bruto, R$140 TAXADE, R$1.260 líquido.
- Lv251+ CEO normal: R$16.450 bruto, R$1.645 TAXADE, R$14.805 líquido.
- Máximo com desempenho +15%: R$18.918 bruto no Lv251+ CEO. A renda efetiva depende da frequência do jogador e do limite do cooldown.

## Pendências da C4b
- Retorno de compra de 13 carros e 6 bicicletas/motos sob as tarifas de transporte C4a; custo dos 3 motoristas CLT de cada modal e revenda de 70% do preço pago.
- Simular primeiro veículo, ganho em 7/30/60/120 dias e manutenção. Não mudar preço isoladamente sem ajustar menus, Web, patrimônio, trocas, revenda e GT.
- Integração com economia de Boss, Raids, Poço, leilões e negócios. Atualizar números somente após cobertura de todos os fluxos.

Não acessar saldos dos últimos 12 horas, não alterar base atual, nunca iniciar outra sessão WhatsApp, nem criar novos recursos de Aiven, Neon, Render ou Vercel.
