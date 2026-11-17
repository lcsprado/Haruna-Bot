# Alpha Bot 2.0 — Fase C4c, simulação integrada offline
17/11/2026 · PR #387 (rascunho) · Sem consultas aos saldos V1.

## Escopo da simulação
Motoristas CLT e frota Uber/iFood, expedientes de carreira, resgate diário e missões simples, negócios passivos e upgrades. Os quatro jogadores-modelo começam com R$0, sem bens, sem XP profissional e com personagem Lv1, por 7/30/60/120 dias. Quatro perfis conservam a rotina de C1.

O simulador lê `src/neon/progression.js`, `src/neon/db.js` e as políticas puras da V2. Compara três colunas: reinvestir em uma sequência determinada de compras, guardar tudo e sensibilidade de personagem Lv50 constante desde o primeiro dia. Esta última coluna é contrafactual de salário, **não** estimativa de quanto um jogador realmente evoluiria.

`node scripts/reboot-economy-integrated.mjs --json` produz as 16 combinações completas, sem banco, env, tokens de WhatsApp ou chamadas de rede.

## Premissas importantes
- Expedientes por dia ativo: casual 1; regular 2; dedicado 3; intensivo 4. Cada expediente tem cooldown V2 de 30 min no runtime; essas frequências são hábitos hipotéticos, não novo teto obrigatório.
- Trabalhos manuais por dia ativo: 1/2/4/6 respectivamente, com no máximo um veículo selecionado por comando neste modelo. A V2 real permite até dois por comando; o cenário não pretende ser o pior caso possível.
- Resgate diário e 1/2/3/5 missões de baixa recompensa presumidas completadas por dia ativo. Não inclui eventos de Boss, Raids, Poço, GT, leilão e bingo, nem as missões especiais ou multiplicadores.
- O modelo mantém o personagem fixo no Lv1 e faz os cargos progredirem com 25 XP profissional/expediente, conforme os nove marcos do código. Uma sensibilidade com Lv50 fixo desde o dia 1 isola o efeito do salário maior.
- Motoristas CLT trabalham um turno completo de 8 horas nos dias ativos, após contratação e sem cobrar duas vezes o veículo que está em turno. Compra do funcionário é dinheiro gasto, não ativo revendável.
- Negócios produzem no máximo sua capacidade de horas até cada coleta ativa; aplicam TAXADE 10% e operação 10%; upgrades Lv1–5 apenas se retorno marginal calculado em até 30 dias, com custo de 20%/30%/40%/50% do preço-base.
- Consumo fixo **hipotético** de R$1.000/dia ativo em potes, equipamentos e manutenção; não representa preços atuais. Compras realizadas com reserva mínima de R$5.000, no máximo uma por dia ativo.
- Valor residual estimado de carro/moto: 70% do preço pago conforme a regra existente; negócios registrados pelo custo investido mas sem garantir liquidez; funcionários não são contabilizados como ativos.
- O patrimônio não inclui equipamentos, pets, casas, bolsas de XP nem futuro de GPT/GT. A simulação não deduz perdas de combate nem inflação gerada por eventos e caixas.

## Limites e próximos passos
Não concluir que a economia está equilibrada apenas porque uma planilha fecha: ainda é preciso simular o teto real de **dois veículos por comando manual**, três motoristas em cada modalidade, preços de carros novos, ofertas do mercado e eventos. Deve ser construído um cenário adverso de quatro intensivos com chefes/GT/Poço e simulação de ganho individual versus custos de jogo, antes da homologação em ambiente isolado.

Nenhuma alteração de carteira de jogadores, compra, revenda, limites CLT ou catálogo foi aplicada aqui. Só teste e simulação na branch.
