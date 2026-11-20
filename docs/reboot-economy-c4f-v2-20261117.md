# Alpha Bot 2.0 — Fase C4f: patrocínios, Bingo, leilões e empréstimos
17/11/2026 · PR #387 · V2 opt-in, sem merge, deploy ou conexão com bancos.

## Executado na V2
O patrocínio TurboMax pagava R$500.000 por contrato e ainda era utilizável com a nova premiação de GT. Agora rende R$5.000 (duas vitórias), com um contrato por jogador por semana. Oficina: cupom até R$5.000. Pit Stop: 20% de desconto, máximo R$10.000. A V1 continua com R$500.000/R$200.000/R$300.000 em suas regras anteriores. Avisos, menu, pagamento e cupom usam a política correta no modo V2.

Teto hipotético de 4 jogadores por 7 dias: ranking semanal R$20.000 + 3 corridas diárias (R$7.950 × 7 = R$55.650) + 4 contratos Turbo conquistados (R$20.000) = R$95.650 em GT. O estresse agora soma o patrocínio condicionado à vitória, sem presumir pagamentos reais.

## Auditado sem alterar a operação
- Bingo Halloween, 15/11 e 16/11: juntos ofereciam nominalmente R$6.270.000 em prêmios. São edições antigas encerradas; reutilizar seus IDs, tabelas ou recompensas criaria inflação.
- Leilão antigo: entradas por lance retiram caixa do jogador, mas certos vouchers permitem equipamento ★★★★★ Lv10. Novos leilões da V2 precisam de recompensas adequadas a personagens Lv1.
- Empréstimos: dinheiro emprestado e juros passam entre jogadores, não são moeda criada pelo sistema. A regra atual cobra 2% por hora depois do vencimento, limitada a 50 horas; é risco patrimonial e de concentração, não emissão direta.
- Caixas e drops vendáveis ainda podem gerar arbitragem. Não considerar o trabalho concluído sem auditoria desses mecanismos.

## Controle
`scripts/reboot-economy-ancillary-audit.mjs` executa somente leitura de arquivos Git. Testes bloqueiam reutilização inadvertida de eventos históricos e divergência de orçamento de patrocínio. Nenhuma tabela, carteira ou transação real foi lida.
