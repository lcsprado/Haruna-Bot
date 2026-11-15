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
