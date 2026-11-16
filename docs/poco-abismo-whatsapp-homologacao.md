# Homologação WhatsApp — Poço do Abismo (PR #365)

## Estado verificado em 16/11/2026
- A branch de produção é `whatsapp-only`. O último deploy confirmado em Render no serviço `alpha-bot-whatsapp` era o SHA `1ee325fc884a283d5e0165761eb0e2ba7036d3b8` (não contém o Poço do PR #365).
- Logs desse serviço registraram: `ALPHA_WHATSAPP_ENABLE=0; sessão não iniciada`. Portanto, não foi possível validar envio em sessão real nessa instância.
- Há outro serviço Render, `Haruna-Bot`, ligado à branch legada `neon-migration`, com deploy registrado desde 07/10/2026. Não assumir que representa a sessão oficial ou usá-lo para testar.
- Não foi encontrado serviço dedicado de staging WhatsApp entre esses dois serviços. O código do evento permanece com `POCO_ABISMO_LIVE=false` por padrão.

## Evidência automatizada já existente
- `test/poco-abismo-delivery.test.mjs`: transporte rejeitado, ACK antigo, confirmação ausente, reenvio e duplicação.
- `test/poco-abismo-postgres.test.mjs`: confirmação de transporte simulada, estado persistido, rollback real e deduplicação com PostgreSQL temporário em localhost.
- `pocoDispatchActionPrompt` só começa os 120 segundos se `reply` resolver com `key.id` (WAMessage do Baileys); resolução sem chave não equivale a envio confirmado.
- Estes testes **não substituem uma sessão WhatsApp de testes**; não contam entrega ao aparelho nem comprovam comportamento de desconexões reais.

## Critérios de aceite antes de ativar em produção
1. Criar ambiente de homologação isolado, com número WhatsApp de teste, banco **não produtivo**, Render/Koyeb de teste e sem compartilhamento de credenciais dos jogadores. Não ligar segunda sessão no mesmo número.
2. Verificar em staging que envio de uma decisão retorna `key.id`, a gravação do timestamp é persistida e a primeira resposta é aceita em até 120s após o ACK.
3. Cortar a rede antes do ACK: status deve ficar pendente, sem derrota e sem prêmios duplicados. Após reconexão, `!poco` reenvia e usa token novo; ACK antigo não altera o prazo.
4. Cortar a rede depois do ACK e antes da resposta: ao retomar, decisão fora do prazo deve finalizar a tentativa, conservando melhor resultado e os créditos anteriores.
5. Reenviar o mesmo comando de ataque/início/abertura com ID igual e em paralelo: no máximo um avanço, um claim e um pagamento.
6. Reiniciar processo após vitória do Guardião, mas antes de receber a mensagem: os créditos persistem uma vez, `!poco` retorna o estado real, sem refazer drop.
7. Simular dois jogadores atingindo andar 30: vence quem usa menos rodadas virtuais; o horário de entrega WhatsApp não afeta o tempo competitivo.
8. Simular fechamento sexta às 21h durante resposta pendente; impedir novas conclusões e garantir o pagamento único dos R$ 50 milhões.
9. Verificar login Web, garagem, Cerco V6, Raids/Boss e ausência da aba de NPCs antigos. Nenhum evento novo poderá reverter as correções da produção.
10. Só então revisar CI geral, atualizar branch com as alterações recentes da `whatsapp-only`, revisar diff, verificar SHA e publicar com plano de rollback.

## Proibições
- NÃO habilitar `POCO_ABISMO_LIVE=true` em qualquer serviço conectado ao banco/carteira produtivos sem cumprir o checklist.
- NÃO usar o serviço Render legado `neon-migration` como staging sem prova de isolamento.
- NÃO tornar o PR #365 mesclável automaticamente apenas porque testes unitários ou PostgreSQL local passaram.
