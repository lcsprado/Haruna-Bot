# Alpha Bot 2.0 — RaidLote contínuo por período (revisão 21/11/2026)

## Regra final solicitada pelo dono
- O período (4h, 8h, 12h) é a duração do automático, **não** uma quantidade de tentativas.
- Confirmar `!raidlote confirmar 10 4h` cria sessão de 4h, **sem pagamento antecipado**.
- Primeira Raid liberada imediatamente; worker inicia na próxima verificação (até 8 segundos com instância saudável).
- Terminou combate? Próxima Raid liberada imediatamente, sem 80 minutos de espera. Respeitar duração real do motor e suas rodadas.
- Antes de cada tentativa, em uma transação: consumir uma chave do inventário se houver, ou cobrar uma chave da carteira; cobrar adicional de 10% sobre a chave em qualquer caso. Dividir débito entre dinheiro e banco como no V1.
- Se faltar saldo para a tentativa seguinte, encerrar sem debitar nem consumir chave. Ao morrer (HP persistido <= 0), ao terminar o prazo ou ao solicitar cancelar, encerrar sem tentar a próxima.
- Derrota **sem morte** não encerra a sessão. Última Raid que começou antes de expirar pode terminar e pagar recompensa.
- Permanecem pré-requisitos de acesso (nível mínimo, três vitórias manuais na Raid) e redutores econômicos V1; Raid70 continua cooperativa/manual, Raid75 desativada na V2.
- Sem teto fixo de três, seis ou nove Raids; limite técnico do schema ampliado apenas para viabilizar sessões. Não publicar esse limite como regra de jogo.
- Pacotes antigos (`billing_mode='prepaid'`) preservam agendamento, custo e histórico originais. Não converter pacotes existentes.
- Em falha técnica, não debitar novamente a mesma tentativa já reservada: reserva da tentativa, crédito da taxa municipal e débito ficam na mesma transação.

## Segurança de implantação
- Alteração separada em `fix/raidlote-v2-continuous-20261121`.
- A migração acrescenta `billing_mode` e `session_ends_at` à tabela atual e amplia constraints de tentativas; é idempotente.
- Antes de implantar: testar PostgreSQL real isolado; simular vitórias consecutivas, morte, derrota sem morte, economia e recompensas, cancelamento, expiração, falta de saldo, reboots e concorrência do worker.
- Preservar backup da V1, não executar reset, não ativar V2 nem modificar ambiente de produção sem homologação e aprovação de corte.
- Incidente separado: pacote Lv10 de R$6.600 criado em 21/11/2026 às 13:44 e cancelado às 14:25 sem nenhuma tentativa. Estorno total de R$6.600 creditado no banco do jogo, com registro idempotente; não usar migração para reembolsar novamente.
