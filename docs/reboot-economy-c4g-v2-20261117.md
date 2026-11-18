# Alpha Bot 2.0 — Fase C4g, prêmios, caixas e leilão
17/11/2026 · PR #387 · Regras opt-in e teste offline. SEM operação no banco.

## Bingo V2: política pronta, execução bloqueada
- Uma edição a cada 7 dias, uma cartela por jogador, custo de R$500.
- Milestones: uma linha R$1.500, duas linhas R$2.500, cartela cheia R$5.000. Orçamento agregado **R$9.000 por edição**.
- Não há distribuição de dinheiro para todos os cartões na bola especial; prêmio especial não monetário pode ser criado na implementação futura.
- Cada pagamento tem identificador de edição + prêmio. A função pura se recusa a repetir um pagamento liquidado; pagamento concorrente terá de ser protegido por chave única em transação no banco isolado.
- Uma edição precisa de ID `bingo_v2_YYYYMMDD_1600` ou `bingo_v2_YYYYMMDD_1930`, janelas e comprovação de não existir edição anterior nos últimos sete dias.
- O modo `classes_only`, banco `isolated-v2` e flag `ALPHA_REBOOT_BINGO_RELEASE=approved-isolated-v2` são pré-requisitos. Ainda não existe scheduler WhatsApp V2 ativado ou evento criado. Não se escolheu arbitrariamente data de início.

## Leilão V2: catálogo candidato
- Até três lotes por edição semanal: poção grande ×2 (R$1.000), espada de aço (R$2.500), armadura de aço (R$2.500). São exemplos com itens existentes, não leilão agendado.
- Qualquer lote exige item regular, equipamento inicial ★1 Lv1, sem Raid75 nem vouchers da temporada antiga.
- Vouchers do leilão de 15/11 são barrados tanto na aquisição como no resgate, inclusive `!usardecreto`, `!usarperfeicao` e `!passeraidlote`.
- A entrega genérica de prêmio em V2 não aplica mais forja automática ★★★★★ Lv10; a V1 preserva o comportamento antigo.

## Caixas e revenda
- Drop sem preço de loja na V2: revenda por unidade, no máximo R$8.000 lendário, R$2.000 épico, R$800 raro, R$250 incomum, R$100 comum. Itens compráveis com preço positivo mantêm revenda de 50% do preço.
- Caixa da Sorte: R$100–400; caixa Rara: R$400–1.200; caixa Épica: R$800–2.000. Caixa Lendária continua sem pagamento direto de dinheiro.
- Limite de abertura de 25 caixas por comando V2, contra 5.000 V1. Inventário, venda simples e venda em lote aplicam a mesma tarifa de revenda.
- Não há alteração de inventário, patrimônio, histórico, preço pago ou recompensas já concedidas.
- PENDENTE: testar raridade/drop de equipamento e valores de reembolso das melhorias, venda no mercado entre jogadores, caixas de evento, novo scheduler de bingo e liquidação de leilões em transação real isolada.

O teste do Bingo confirma apenas a política pura de emissão e idempotência lógica. Ele não prova execução com dois processos concorrentes no banco e não autoriza lançamento.
