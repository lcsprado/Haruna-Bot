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
