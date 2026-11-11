# RAIDLOTE V1 — contrato de implementação (NÃO PUBLICAR)

Status: especificação e política pura preparadas. O comando, a fila, o motor e os pagamentos NÃO estão conectados. Feature flag deve nascer desligada.

## Regras
- !raidlote <nivel> <quantidade 1..10>, !raidlote status, !raidlote cancelar, !raidlote historico
- Até 10 tentativas por janela móvel de 24 horas, por jogador, inclusive tentativas fracassadas.
- Exigir 3 vitórias manuais anteriores naquela Raid; conferir origem em histórico confiável, não confiar em contagem informada pelo cliente.
- Combate real completo por rodada com o motor existente, HP, escudos, equipamentos, técnicas, pets, efeitos, cura e ressuscitação normais.
- Execução individual e isolada, sem ocupar sala pública nem alterar o combate de terceiros.
- Chave normal por tentativa + taxa de serviço de 10% do preço da chave. Se chave existe, consumir, não recomprar.
- Cobrança no início da tentativa, dentro da MESMA transação que cria o combate. Nunca cobrar tentativas futuras.
- Vitória: dinheiro 80%, XP jogador/herói/pet 60%, maestria 50%, fragmentos 40% arredondados para baixo, chance de equipamento 25% da normal. Outros drops e recompensas exclusivas devem ser explicitamente classificados antes de habilitar.
- Recompensas de eventos temporários não multiplicam ganhos automáticos. Fragmentos compartilham limite diário com Raid manual; aplicar redutor antes de limite, não depois.
- Derrota/morte: encerrar lote; sem recompensa de vitória, sem devolução de chave/taxa daquela tentativa. Consumíveis disponíveis podem ser usados; compras automáticas de consumíveis proibidas.
- Cancelamento: concluir somente a rodada atual, não iniciar outra; não cobrar as não iniciadas. Ao concluir, relatório PRIVADO.

## Esquema sugerido (migration separada, reversível)
raid_lote_jobs(id uuid PK, jid text, level int, requested int, completed int, status text, cancel_requested bool, created_at timestamptz, updated_at timestamptz, lease_until timestamptz, current_attempt_id uuid)
raid_lote_attempts(id uuid PK, job_id uuid FK, seq int, raid_instance_id uuid UNIQUE, status text, key_consumed bool, key_purchased bool, fee_paid bigint, reward_committed bool, started_at timestamptz, finished_at timestamptz, UNIQUE(job_id,seq))
raid_lote_reward_ledger(attempt_id uuid, reward_type text, item_id text, amount bigint, PRIMARY KEY(attempt_id,reward_type,item_id))
Criar indice parcial de job ativo por jid e índice por janela 24h. Usar chave idempotente por tentativa e evento; lock por jid e raid_instance_id; garantir que falha/timeout reinicie a MESMA tentativa, jamais outra.

## Sequência de integração
1. Testes unitários da política pura.
2. Migration e testes transacionais de chave, carteira, Prefeitura, rollback e concorrência.
3. Adaptador de batalha: reutilizar raidRound e inicialização real sem simular vitória; preservar snapshot, tempo de rodadas e potions.
4. Aplicar redutores ANTES de cada crédito, não debitar recompensas depois; auditar cada recompensa (inclusive XP, maestria, materiais, itens, pets e colab).
5. Worker com lease e retomada idempotente após restart, 1 job ativo por jogador, pausa por manutenção.
6. Comandos e mensagens privadas; esconder em !comandos até homologação.
7. Testar 1/10/75, derrota, morte, falta de chave/saldo, interrupção, deploy/restart, dois workers, 10 tentativas, limite 24h, cancelamento, teto diário colab, auditoria financeira.
8. Liberar manualmente flag RAID_LOTE_V1_ENABLED somente após CI + homologação em TESTE. Sem deploy automático.

## Atenções
- raidRound é acoplado a salas por chat; não apontar o worker para grupo público.
- A recompensa normal da Raid 75 pode incluir retorno financeiro maior que o preço da chave. Monitorar saldo líquido e limite de fragmentos.
- A transação financeira da taxa precisa creditar a Prefeitura em vez de sumir do sistema.
- Não usar o resultado de HP=0 como prova de premiação: conferir transação, XP, inventário e ledger.
