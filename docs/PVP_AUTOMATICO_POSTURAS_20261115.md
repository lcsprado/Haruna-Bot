# Alpha Bot — PvP Automático com Posturas (15/11/2026)

**Direção aprovada:** jogadores querem batalhas automáticas. Não lançar o `!duelo` interativo. O código experimental manual permanece preservado na antiga branch do PR #343, mas não deve ser mesclado com este PR.

## Experiência prevista

- `!batalhar @pessoa`: segue com as mesmas regras de execução automática, prêmio, cooldown, XP e relatório.
- `!duelo @pessoa`: permanece o apelido automático já existente; **não** ativa pausas ou decisões manuais.
- `!estrategia` ou `!estrategia status`: consulta a postura do combatente ativo.
- `!estrategia equilibrada`: nenhum modificador estratégico, comportamento padrão.
- `!estrategia agressiva`: foco no ataque com vulnerabilidade adicional.
- `!estrategia defensiva`: mais redução de dano, menos ataque.
- `!estrategia tatica`: proteção leve e reforço de ataque quando a habilidade existente é acionada.
- `!estrategia adaptativa`: escolhe automaticamente, em cada golpe, entre agressiva, defensiva e tática com base no próprio HP, HP adversário e perfil de combate; recebe apenas 70% da intensidade dos modificadores. Nenhuma IA externa, clique, resposta ou espera.

A postura fica salva por `jid + combatant_id`. O jogador pode usar Ban adaptativo, Diane defensiva e Samurai agressivo sem reconfigurar a cada troca.

## Segurança

- No padrão, `ALPHA_PVP_AUTO_STRATEGY_ENABLED` é **OFF**. O `battle()` atual continua matematicamente idêntico com a flag OFF: sem consulta à tabela nova, sem RNG extra e sem alteração do multiplicador de dano.
- A migração `migrations/20261115_pvp_auto_strategy_NOT_APPLY.sql` foi testada apenas no PostgreSQL descartável; NÃO aplicar diretamente em Aiven produção.
- O módulo não altera HP, itens, XP, maestria, pets, carteira, Boss, Raid ou raidlote. Os únicos efeitos futuros com flag ON são modificadores temporários sobre o dano no PvP, até +8% ataque, 8% defesa e até +5% vulnerabilidade adicional.
- Heróis desconhecidos de futuras collabs ficam neutros até receberem configuração específica, sem quebrar as batalhas.
- Nenhuma nova mensagem de decisão durante o combate; não depende de WhatsApp privado e não cria uma segunda modalidade.

## Evidências

GitHub Actions: https://github.com/lcsprado/Haruna-Bot/actions/runs/43761737294

- 28 testes de estratégia, sintaxe e regressões do PvP existente.
- 4 testes em PostgreSQL 16 descartável, cobrindo migração, separação de posturas por classe/herói, posse do personagem e ausência de consulta com flag OFF.
- Resultado: 32/32 testes aprovados, sem falhas.

## Antes de habilitar

1. Testar o `battle()` com flag ON com dois personagens de teste e equipamentos, escudo, crítico, pets e maestria reais, comparando seu relatório e HP com flag OFF.
2. Recalcular distribuição de vitórias entre classes e heróis com cada postura, evitando que a adaptativa domine.
3. Aplicar migração no banco de homologação, verificar rollback e tabela `pvp_auto_strategy_preferences`, depois avaliar mudança em produção.
4. Só publicar após checar Raids/Boss ativos e compatibilidade com a versão Web atual. A branch `whatsapp-only` possui autodeploy e não deve ser atualizada apenas para testar.


## Auditoria aprofundada do motor real — 16/11/2026

A suíte `test/pvp-auto-live-engine-audit-20261116.test.mjs` extrai e executa o bloco `hit()` e o laço real de 20 rodadas diretamente do arquivo `src/neon/db.js` da branch de homologação, usando as funções existentes de classes, Sete Pecados, crítico, escudos, pets e cura. Evita SQL e recompensas; combatentes têm atributos equivalentes, obtidos no simulador, e efeitos de equipamento/pet equivalentes de teste. Não são estatísticas históricas reais dos jogadores nem execução de transações com pessoas reais.

Amostras determinísticas, com mesmas sementes e inversão dos lados:
- 13.200 confrontos em 12 pares, cinco posturas contra equilibrada.
- 45.000 confrontos na matriz 5 × 5 em 12 pares.
- 340.000 confrontos para os 136 pares distintos dos 17 combatentes, todas as 25 combinações, 50 sementes × 2 lados.
- 60.000 confrontos adicionais de confirmação nos seis pares mais sensíveis, com 1.000 sementes × 2 lados e cinco posturas contra equilibrada.
- Total 458.200 execuções comparativas nas baterias automatizadas, sem alteração de `stats`, XP, HP persistente, pets ou inventário.

### Resultado principal dos 340.000 confrontos

A média de vitórias do primeiro combatente, espelhando a posição, com as cinco opções adversárias, foi de 57,9% equilibrada; 60,4% agressiva (+2,5 p.p.); 61,5% defensiva (+3,6 p.p.); 60,3% tática (+2,4 p.p.); 59,3% adaptativa (+1,4 p.p.). Os valores absolutos acima de 50% refletem que os personagens da lista não têm força idêntica; para balanceamento das posturas importa a diferença contra a equilibrada no MESMO conjunto de pares e sementes. A adaptativa não lidera.

Seis pares tiveram mais de 20 p.p. de diferença entre a melhor e a pior postura em amostra de 100 lutas por postura. Rechecados com 2.000 lutas por postura, a maior diferença caiu para 19,4 p.p. O caso Escanor × Merlin: com Escanor agressivo 32%, defensivo 51,4%, equilibrado 35,7%. Escanor × Gowther: agressivo 34,2%, defensivo 53,6%, equilibrado 38,3%. É contrajogada específica, não dominância universal.

Os testes verificam:
1. Ativar a flag com ambas as posturas equilibradas gera exatamente a mesma saída que a flag OFF, incluindo log/HP/crítico, nas sementes testadas.
2. Modificadores são temporários e não alteram atributos persistentes, equipamentos ou maestria.
3. Alterações de escudos/pets são percebidas no cálculo real, não somente em simulador teórico.
4. Uma alteração futura que gere vantagem global acima de 12 p.p. ou diferença acima de 20 p.p. nos seis pares sensíveis bloqueia a suíte.

### Conclusão de homologação

Nenhum nerf global é necessário pelas evidências atuais. O modo adaptativo continua abaixo dos modos fixos melhores em média. Existem diferenças ESTRUTURAIS entre classes e heróis (ex.: King × Arqueiro) que antecedem as posturas e precisam de uma auditoria de progressão separada.

**Bloqueio de publicação mantido:** os testes são sobre o bloco de combate real, mas com snapshots equivalentes e sem a transação `battle()` completa em uma instância do bot conectada a banco de homologação, dois JIDs reais, Web e entrega WhatsApp. Migrar e habilitar flag só após esses testes, validação de Raids/Boss ativos e aprovação. O PR permanece em rascunho.
