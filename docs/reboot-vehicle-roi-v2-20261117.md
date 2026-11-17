# Alpha Bot 2.0 — C4b: análise dos veículos e motoristas CLT
17/11/2026. Apenas Git, sem saldo de jogadores.

O preço atual de compra e o histórico de revenda de carros e motos **não foram alterados** nesta etapa. Mudar apenas o preço de débito, mantendo menus, Web, patrimônio, troca, revenda e ranking com o valor antigo criaria inconsistências.

O simulador `scripts/reboot-vehicle-roi.mjs` lê 13 modelos de carro, 6 veículos de entrega e os 6 tipos de motoristas do catálogo versionado. Para cada veículo, calcula retorno em dias ATIVOS com 1/3/6 comandos manuais por dia, já com as tarifas V2 (Uber 55%, iFood 60%), TAXADE 10%, operação 15%, tipo de corrida e gorjeta média. Não assume que são ganhos reais ou garantidos.

Para CLT, o cálculo contempla motorista + veículo, com 8 horas máximas de turno, intervalo específico, eficiência, comissão, TAXADE e desgaste. O custo de contratar motorista é investimento, não taxa diária. O mesmo veículo não deve faturar simultaneamente manual e CLT.

Referências de decisão: preço Corsa R$35.000, bicicleta R$1.500, até 5 carros para Uber, 6 motos, 3 trabalhadores por modalidade. O GT Evolution possui veículos próprios — os prêmios do GT não entram no ROI do Uber.

O script informa também um teto de preço teórico para 45 dias ativos com 3 ações diárias. Isso é apenas referência de custo-benefício, não tabela final ou aprovação para alterar preço.

Próximos passos: simular preço + salário + negócios em 7/30/60/120 dias, testar trajetórias de compra e manutenção, e só depois aplicar preços num catálogo único que alimente compras, trocas, revendas, mensagens e valor patrimonial. A estratégia deve impedir pagamentos negativos e arbitragem de vendas em V2.

Nenhuma mudança no bot da V1, banco atual, recursos de nuvem ou transações recentes.
