# Alpha Bot 2.0 — C4h: comandos e transações de Bingo/leilão
17/11/2026 · PR #387, branch isolada, sem deploy.

- Bingo V2: criação manual de uma edição por 7 dias em `trevo_settings`; cartela R$500 debitada atomicamente (uma por JID). Sorteio servidor-only com 40 números e prêmios 1/2/3 linhas de R$1.500/R$2.500/R$5.000. Cada marco tem ledger de chave única e crédito/estado no mesmo commit.
- Leilão V2: três lotes de itens iniciais, lance inicial R$1.000 ou R$2.500 conforme lote, incremento R$500, teto R$25.000. Reserva o valor e estorna o lance anterior no mesmo commit; entrega item não forjado uma vez ao encerrar.
- Ambos usam lock transacional PostgreSQL global, calendário independente e exigem URL `alpha_reboot_*`, `ALPHA_REBOOT_DB_CONFIRMED=isolated-v2` e flag `ALPHA_REBOOT_BINGO_RELEASE` ou `ALPHA_REBOOT_AUCTION_RELEASE` no valor `approved-isolated-v2`. Essas flags não foram configuradas em nenhum serviço.
- WhatsApp no modo V2: `!bingov2`, `!cartelav2`, `!leilaov2`, `!lancev2 VALOR`; exige grupo com licença válida.
- Web autenticada: `GET /api/v1/me/bingo-v2`, `GET /api/v1/me/auction-v2`, `POST /api/v1/action/bingoV2.buy`, `POST /api/v1/action/auctionV2.bid`. A rota antiga de consulta do leilão redireciona logicamente para estado V2 no modo reboot.
- NÃO HÁ scheduler, evento criado, interface visual pronta ou envio de notificações. Funções de sorteio e finalização existem apenas para executor autorizado posterior, não são acionadas pelo jogador. Nenhum botão Web foi publicado.
- Testes usam um banco fake em memória, com checagens de rollback e idempotência sequencial. Ainda falta teste real com duas conexões em banco isolado, falha de conexão, execução do scheduler único, outbox de mensagens e validação financeira antes de qualquer liberação.
- V1 preservada e banco atual intocado. PR continua draft.
