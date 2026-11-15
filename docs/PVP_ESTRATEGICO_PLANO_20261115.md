# Alpha Bot — PvP estratégico (protótipo isolado, NÃO PUBLICAR)

Base: `whatsapp-only`, 15/11/2026. Nenhum comando, migração, configuração de produção ou rotina de PvP foi alterado. Módulo novo `src/neon/pvp-strategy-prototype.js` deliberadamente **não importado pelo runtime**.

## Modos acordados

- `!batalhar`: atual combate automático; futuro `!estrategia <personagem> <equilibrada|agressiva|defensiva|tatica>` seleciona postura prévia persistida por jogador + combatente.
- `!duelo @jogador`: modalidade separada; participantes confirmam entrada; decisões privadas nas rodadas 3, 7 e 11, com 30 segundos por decisão e resolução simultânea. Escolhas só aparecem depois que ambos responderem ou terminar o prazo. Ausente fica em `normal`, sem vantagem defensiva por inatividade.
- Se a ação for `tecnica`, o combatente usa sua habilidade estratégica; ela **não substitui** as técnicas atuais, deve se integrar uma única vez no cálculo de ataque/defesa. Regras do motor existente continuam prevalecendo nos limites de HP, equipamentos, pets, crítico e maestria.
- Ataque, proteção ou técnica consumem a oportunidade daquela rodada. Máximo de 3 intervenções por jogador. Não interromper o combate em todas as rodadas.

## Progressão e segurança

Não alterar `stats`, `player_class_levels`, `player_hero_mastery`, `player_hero_mastery_unlocks`, inventários ou economia. Classes, Despertar e os sete heróis seguem com seus níveis e habilidades atuais. Postura padrão `equilibrada` é exatamente neutra para impedir mudança silenciosa em `!batalhar`. Nenhum efeito estratégico pode ser acumulado com ele mesmo na mesma rodada.

Parâmetros iniciais: +15% máximo no multiplicador de ataque da camada estratégica, até 14% de redução adicional, até +7,5% de dano recebido quando se expõe, até 2,5% do HP máximo de recuperação por intervenção. São *tetos da camada*, não tetos dos atributos ou das habilidades existentes. Tratar percentuais como configuração sujeita a testes de múltiplos cenários, não como números aprovados para produção.

## Identidades dos personagens

| Classe / herói | Técnica estratégica | Função |
| --- | --- | --- |
| Guerreiro | Contra-ataque de Guerra | adaptação e ataque/defesa moderados |
| Paladino | Égide Sagrada | proteção, cura limitada |
| Berserker | Frenesi | dano com HP baixo, custo de vulnerabilidade |
| Necromante | Drenagem | recuperação curta e desgaste |
| Samurai | Postura Iai | precisão contra postura agressiva |
| Meliodas | Full Counter preparado | contra-ataque e defesa |
| Ban | Snatch direcionado | desgaste e sobrevivência |
| Diane | Heavy Metal | proteção |
| Escanor | Pressão Solar | pressão ofensiva tardia |
| King | Chastiefol Guardian | suporte e cura limitada |
| Gowther | Rewrite Light | interrupção tática futura |
| Merlin | Perfect Cube | barreira |
| Demais classes já registradas no catálogo | Assassino, Mago, Arqueiro, Monge, Druida | previstas no protótipo para preservar compatibilidade |

## Critérios obrigatórios ANTES da integração

1. Adaptador opcional integrado a **todos** os caminhos canônicos do PvP WhatsApp e, se aplicável, API Web. Com flag padrão OFF. Sem divergência Web/WhatsApp.
2. Persistência isolada das posturas e sessões, evitando revelar votos secretos por logs, notificações de grupo ou respostas de API. Confirmar atomicidade/idempotência e deduplicação de mensagens.
3. Simulação do motor **real**, não só do protótipo: ao menos 1.000 confrontos por confronto representativo, ordem invertida, atributos equivalentes e diferentes, equipamentos/pets, estágio de maestria I–V e Despertar 0–V.
4. Conferir vitória por proporção de HP no limite de rodadas, crítico sem teto artificial, HP não inflado, cura/imortalidade limitadas, desligamento da flag e continuidade de Boss/Raid/raidlote.
5. Não impor igualdade artificial de 50% para herói 5/5 contra classe inferior ou para builds desiguais. Alvo: cada confronto pareado com equipamento/progressão equivalente deve ter decisões relevantes e não ser garantido pela postura.
6. Não mesclar `whatsapp-only` com o autodeploy Render ligado antes de homologação, sem Raids/Boss ativos e aprovação específica. Não alterar produção nesta PR.

## Escopo do protótipo

`strategyModifiers()` calcula bônus puros. `makeDuelRound()/submitDuelChoice()/duelRoundPublic()/resolveDuelRound()` simulam escolhas de uma rodada, sem armazenamento ou integração WhatsApp. **Não é o comando !duelo pronto para uso.** Testes de invariantes e regressão do simulador existente: `node --test test/pvp-strategy-prototype-20261115.test.mjs`.


## Evidência de validação isolada (15/11/2026)

Execução GitHub Actions: https://github.com/lcsprado/Haruna-Bot/actions/runs/43753976326
- 11 testes aprovados, 0 falhas; 7 confrontos representativos, 160 duelos por confronto (80 sementes × 2 ordens); total 1.120 duelos. Configuração: equipamento igual, Lv.100, maestria V ou despertar V.
- Comparação primeiro combatente (sem postura → postura/ações demonstradas):
  - Ban × Samurai 78,8% → 85,0% (variação +6,3 p.p., arredondamento)
  - Diane × Berserker 68,8% → 72,5% (+3,7 p.p.)
  - Meliodas × Paladino 63,8% → 63,8% (0 p.p.)
  - Gowther × Necromante 62,5% → 61,3% (-1,2 p.p.)
  - Escanor × King 37,5% → 40,0% (+2,5 p.p.)
  - Guerreiro × Assassino 30,0% → 35,0% (+5 p.p.)
  - Druida × Mago 30,0% → 40,0% (+10 p.p.)

A comparação não atesta balanceamento universal: alguns confrontos já partem com disparidade alta, particularmente Ban × Samurai. A estratégia não corrige sozinha progressões desequilibradas; precisamos medir contrajogadas invertidas e cenários com pets/itens antes de integrar o motor real. O simulador novo reproduz de forma idêntica o resultado do simulador original em postura neutra nos casos testados. Nenhum jogador teve dados alterados.


## Implementação incremental (continuação 15/11)

Arquivos novos:
- `src/neon/pvp-duel-session-prototype.js`: convite, aceite, recusas, três janelas sequenciais (3/7/11), escolhas secretas, idempotência para reenvios, fallback de 30s, histórico revelado só após resolução. **Sem armazenamento persistente, sem scheduler, sem comando ativo.**
- `src/neon/pvp-strategy-preferences.js`: gravação e leitura de postura por `jid + combatant_id`, com validação de posse e valores permitidos.
- `migrations/20261115_pvp_strategy_preferences_NOT_APPLY.sql`: DDL preparado, **não executado**.
- `test/pvp-strategy-counterplay-audit-20261115.test.mjs`: quatro planos de estratégia invertida em nove pares, com ordenação espelhada.

Integração opcional preparada:
- `src/neon/db.js`: `battle()` lê preferências por personagem quando `ALPHA_PVP_STRATEGY_ENABLED=1`, aplica multiplicador de dano e proteção uma única vez no cálculo após as habilidades já existentes; em flag OFF, postura neutra e **zero consultas** à nova tabela. `configureBattleStrategy()` só grava com flag ON, dentro de transação, para o combatente ativo e comprovadamente pertencente ao jogador.
- `src/neon/index.js`: `!estrategia <equilibrada|agressiva|defensiva|tatica>`, disponível após a liberação da flag e aplicação da DDL. O comando **não é publicado** nesta PR.
- `!duelo` é atualmente um apelido legado de `!batalhar`. **Não redirecionar** para o modo interativo antes de implementar e homologar o transporte de decisões, timeout, transação, recuperação de sessões e prevenção de duelo paralelo.

Evidência CI mais recente (branch):
https://github.com/lcsprado/Haruna-Bot/actions/runs/43755537920 — **43 testes aprovados, 0 falhas**, incluindo sintaxe de `db.js` e `index.js`, testes do fluxo, posturas, posse e regressões de PvP e HP. Estas verificações **não são** um teste ponta a ponta com WhatsApp, PostgreSQL real e Web.

Testes exploratórios de contrajogada (sementes diferentes): 9 confrontos × 180 sementes × 2 ordens × (base + 4 estratégias) = 16.200 execuções. As conclusões variam por amostra; nenhuma taxa deve ser anunciada como garantia. Exemplos de vantagem estrutural que ainda precisam de investigação: King × Arqueiro (89,4% de vitória do King na amostra neutra) e Merlin × Mago (75% de Merlin). Não reduzir atributos permanentes para maquiar a análise.

### Liberação bloqueada até
1. Teste PostgreSQL descartável da migração, concorrência de alterações e preferência de outro jogador; rollback seguro.
2. Teste real de efeito de postura no `battle()` com flag ON, cobrindo HP, pet, gear, escudo, crítico e relatório, mais comparação byte-a-byte de saída em flag OFF.
3. Sessões `!duelo` no banco com travas de unicidade de participante, revisionamento/compare-and-swap, timeout por worker recuperável, sigilo das opções e deduplicação de mensagens WhatsApp.
4. Paridade Web/WhatsApp e compatibilidade com o transporte privado (mensagens "aguardando mensagem").
5. Revisar balanceamento e aplicar ajustes só na camada estratégica, com validação; nunca alterar inventário, níveis ou economia existentes apenas para favorecer a nova collab.
6. Confirmar ausência de combates/raids ativos antes de eventual publicação e solicitar aprovação específica para integrar à `whatsapp-only` (branch de autodeploy).
