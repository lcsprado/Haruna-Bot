# RAIDLOTE V1 — pacote antecipado e sem reembolso

Status: construção do PR #290, rascunho. NÃO PUBLICAR. Flag RAID_LOTE_V1_ENABLED deve permanecer desligada.

## Regra econômica corrigida pelo dono em 10/11/2026
- O jogador COMPRA o pacote integral antes do início. Ex.: !raidlote 75 10 = 10 chaves (R$ 4.800.000) + taxa 10% (R$ 480.000) = R$ 5.280.000 debitados uma só vez, na confirmação.
- O pacote compra dez DIREITOS DE TENTATIVA, não dez chaves transferíveis. Na compra, usa primeiro as chaves que o jogador JÁ TEM (consumidas imediatamente) e cobra em dinheiro somente as chaves restantes, além da taxa automática sobre todas as tentativas. Ex.: 3 chaves próprias e 10 Raids Lv.75 = 3 chaves consumidas + 7 chaves cobradas (R$ 3.360.000) + R$ 480.000 de automação = R$ 3.840.000 debitados. A compra é integral e antecipada; nenhuma chave é novamente consumida ao iniciar as partidas do lote.
- A cobrança é atômica e idempotente, com identificação única da compra. Divide saldo entre dinheiro em mãos e banco, sem permitir saldo negativo. Taxa da automação vai para o cofre municipal segregado.
- Nenhuma devolução, mesmo por derrota, morte, cancelamento voluntário ou saldo de tentativas não utilizado. Se não puder executar por ERRO INTERNO do serviço, registrar incidente e NÃO declarar como derrota nem descartar direitos sem reconciliação; abrir incidente administrativo.
- Derrota ou morte encerra o lote e perde as tentativas restantes. Nenhuma recompensa de vitória para tentativas derrotadas.
- Limite de 10 direitos de tentativa adquiridos por jogador por janela móvel de 24h. Exigir 3 vitórias MANUAIS anteriores na mesma Raid. Nível mínimo normal.
- Combate completo real por rodada, aproximadamente 8s entre rodadas, isolamento por identificador privado, sem tomar salas públicas. Utilizar mesmas habilidades, pets, equipamentos, consumíveis existentes, morte, cura e limite de duração.
- Dinheiro 80%; XP de jogador/herói/pet 60%; maestria 50%; fragmentos 40% (floor); equipamento raro 25% da probabilidade. Eventos temporários não aumentam recompensa. Para caixa/insígnias/drop especial ainda é preciso política explícita antes de ligar a flag. Limite diário de fragmentos compartilhado com manual, com redutor antes do teto.
- Proibir compras automáticas de poções e energéticos. Consumíveis do inventário são permitidos e descontados normalmente.

## Segurança de implantação
- Nenhuma função no módulo de loja roda no boot ou em import. Migração só quando chamada explicitamente em homologação.
- Não ativar comando, worker, migração ou troca de saldo em PRODUÇÃO enquanto houver pendência em testes.
- A idempotência depende de request_key de origem confiável (ID da mensagem/ação), UNIQUE(jid,request_key).
- Débito de chaves existentes, cobrança em carteira/banco, crédito municipal e logs financeiros devem ser COMMITADOS na mesma transação; erro deve ROLLBACKAR tudo.
- A tentativa deve ter ID único e persistido antes de se iniciar; o worker deve retomar essa MESMA tentativa após restart sem consumir o próximo direito.
- O adaptador interno de Raid deve ignorar o consumo de chave manual. Guardas de 1 Raid por personagem precisam bloquear iniciar manual e automático simultaneamente em ambos os canais.
- Recompensas reduzidas são calculadas antes do crédito, dentro da transação de conclusão. Não conceder 100% para depois estornar. História de vitórias do pacote não é vitória manual para o pré-requisito.
- O fim de cada tentativa encerra uma única vez; depois de 10 vitórias, status won. Qualquer derrota/morte termina status lost, sem reembolso; cancelamento tem status cancelled e permanece pago.
- Relatório de encerramento privado; não anunciar automaticamente no grupo.

## Plano de homologação
1. Testes unitários do orçamento, redutores e limites.
2. Testes de transação com saldo insuficiente, dinheiro+saldo bancário, duas compras simultâneas, repetição do mesmo request_key, rollback, integridade cofre, e 24h.
3. Testar com sala isolada e combate real, vitória e derrota, consumíveis, herói/pet, Raid 75, reinício do Render a meio da rodada, execução concorrente de worker, reconciliação de recompensas.
4. Bloquear o deploy até verificar manualmente nenhuma cobrança dobrada, nenhum ganho de Raid não concluída, nenhuma interferência nas Raids do grupo.
