# Alpha Bot 2.0 — fase C4i: scheduler e interface Web protegidos
17/11/2026 · PR #387 · Código sem publicação nem alteração de banco.

## Implementado
- `src/neon/reboot-events-scheduler.js` usa o pool já existente no processo WhatsApp. Um único handle por pool (WeakMap), sem criar nova conexão permanente. Tick adaptativo: uma consulta de status por evento em cada ciclo, até cinco minutos quando inativos e 25 segundos durante um sorteio.
- Um único timer chama `stepBingoV2Draw` e `closeAuctionV2Lot`. A cobrança, sorteio, crédito e entrega continuam serializados por lock transacional central do PostgreSQL, protegendo duas instâncias se ambas executarem ticks por engano.
- Flag obrigatória: `ALPHA_REBOOT_EVENTS_SCHEDULER=approved-isolated-v2`, além de todos os gates V2, os gates individuais de Bingo/leilão, banco `alpha_reboot_*` e `ALPHA_REBOOT_ALLOW_WHATSAPP=cutover-approved`. Nenhuma flag foi configurada em qualquer serviço. Quando desativado, `startRebootEventsScheduler` não abre pool, timer ou SQL.
- Web `web/app.js`: Bingo na Central de Eventos com cartela, compra e resultado; Leilão usa layout próprio da V2 com item/valor e lance real. O layout antigo permanece no modo V1, sem reabrir conteúdo histórico na V2.
- `test/reboot-events-c4h.test.mjs`: novos testes com operações simultâneas em banco falso serializado, incluindo dois compradores da mesma cartela, dois ticks da mesma bola, dois lances equivalentes e dois fechamentos do mesmo lote. São testes determinísticos sem tocar nuvem.

## Restrições que ainda impedem lançamento
- O agendador é parte do código, MAS permanece bloqueado até habilitação consciente de flags; não existe edição criada nem ativação.
- **Concorrência real em PostgreSQL ainda não testada**. Um fake com serialização não substitui duas conexões reais a um banco de homologação. Para isso, usar apenas banco isolado previamente aprovado, sem Aiven/Neon compartilhado da V1.
- **Mensageria de resultados pendente**. Não há outbox V2 comprovada com recuperação de erro/duplicação de envio; não ativar scheduler antes de integrar uma fila persistente de notificações que não possa pagar jogadores duas vezes.
- **Validar política de tempo**: em atraso prolongado, o código encerra Bingo no deadline, sem distribuir prêmio de cartela cheia não conquistado; requer avaliação do produto.
- Não foi criada infraestrutura, alterada variável de ambiente, carregado saldo de jogador, habilitado WhatsApp, acionado evento, nem feito deploy.

## Critério C4j
Um teste de duas conexões PostgreSQL com chave única/locks reais, outbox de avisos durável, política de reconexão e verificação de identidade/visibilidade da Web antes de liberar qualquer evento.
