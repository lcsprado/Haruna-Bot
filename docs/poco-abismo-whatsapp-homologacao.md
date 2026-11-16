# Homologação WhatsApp — Poço do Abismo (PR #365)

## Serviços verificados em 16/11/2026

- Doido15, Ohio, serviço `alpha-bot-whatsapp` (`srv-db7qb38u01pc739nlvpg`), branch `whatsapp-only`, deploy manual. Deploy observado `dep-dbtljbdckfvc73ej9bo0`, SHA `71f065b1b28787a3c2640c73a8a5967089554059`.
- Summoner7, serviço reserva `srv-db34ae942hec738hkrr0`, deploy automático por commit na `whatsapp-only`. O status do Render informa a versão implantada. Confirmar a configuração da conexão WhatsApp da reserva em operação separada.
- Web RPG na Vercel, projeto `alpha-web-rpg`, com o Cerco roteado para o Render Lcsprado4, `alpha-web-api-beta`. Sem sessão de WhatsApp de homologação confirmada.
- O código exige opt-in explícito nas flags para registrar comandos e temporizadores do evento. Conferir os valores no painel autorizado antes do deploy, sem divulgar variáveis do serviço.

## Evidência automatizada já existente
- `test/poco-abismo-delivery.test.mjs`: transporte rejeitado, ACK antigo, confirmação ausente, reenvio e duplicação.
- `test/poco-abismo-postgres.test.mjs`: confirmação de transporte simulada, estado persistido, rollback real e deduplicação com PostgreSQL temporário em localhost.
- `pocoDispatchActionPrompt` só começa os 120 segundos se `reply` resolver com `key.id` (WAMessage do Baileys); resolução sem chave não equivale a envio confirmado.
- Estes testes **não substituem uma sessão WhatsApp de testes**; não contam entrega ao aparelho nem comprovam comportamento de desconexões reais.

## Critérios de aceite antes de ativar em produção
1. Criar ambiente de homologação isolado, com número WhatsApp de teste, banco **não produtivo**, Render/Koyeb de teste e sem compartilhamento de credenciais dos jogadores. Não ligar segunda sessão no mesmo número.
2. Verificar em staging que envio de uma decisão retorna `key.id`, a gravação do timestamp é persistida e a primeira resposta é aceita em até 120s após o ACK.
3. Cortar a rede antes do ACK: status deve ficar pendente, sem derrota e sem prêmios duplicados. Após reconexão, `!poco` reenvia com o token da decisão pendente. A primeira confirmação válida abre a janela, e confirmações repetidas ou de outros turnos preservam o prazo original.
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

## Sequência de liberação com autorizações separadas

1. Confirmar que a reserva Summoner7 está isolada do número e da base produtiva e que o deploy automático da `whatsapp-only` foi desativado antes de autorizar o merge. O deploy `dep-dbtlgbjm8hqs739ssmcg` ficou `live` por novo commit em 16/11; o status do serviço apenas comprova o deploy.
2. Confirmar homologação com número de teste e PostgreSQL descartável, suite de prêmios e rollback aprovada para o SHA candidato e falhas externas registradas. Reconsultar a ponta de `whatsapp-only`, o SHA do PR #365 e seus checks. Congelar o SHA de referência e preservar o artefato ativo.
3. Com autorização de merge, usar o PR #365 sobre `whatsapp-only` e conferir o SHA resultante. O serviço Doido15 observa essa branch e está com Auto-Deploy Off. Verificar quaisquer integrações da Web antes de mesclar.
4. Com autorização independente de deploy, usar Manual Deploy → Deploy a specific commit no serviço Doido15 `srv-db7qb38u01pc739nlvpg`. Selecionar o SHA resultante do merge. Usar configuração desativada para Poço e prévia. Confirmar o deploy em `live`, saúde do serviço principal, uma única conexão WhatsApp e compatibilidade com login Web, Cerco e demais rotas.
5. Com autorização independente de ativação, conferir a janela da temporada no horário de Brasília e ativar somente `POCO_ABISMO_LIVE=true`, com `POCO_ABISMO_PREVIEW` diferente de `true`, na instância Doido15. Confirmar qual versão e configuração ficaram em execução. Se a janela tiver fechado, definir nova temporada antes de ativar.
6. Rollback: diante de falha após deploy, interromper a ativação e retornar no Doido15 ao último deploy bom. A referência de 16/11 é `dep-dbtljbdckfvc73ej9bo0`, SHA `71f065b1b28787a3c2640c73a8a5967089554059`. Confirmar elegibilidade do artefato no momento da publicação, status `live`, saúde e conexão única. O rollback de código deixa intactos os registros do PostgreSQL. Preservar os claims e a trilha de auditoria para conciliar eventual crédito com autorização própria.
