# PvE V2 — revisão de Raid e Dungeon, 18/11/2026

Commit candidato: dano efetivo (sem overkill) usado em contribuição da Raid V2, elegibilidade de recompensa por pelo menos 2% do dano efetivo ou cura real >= max(200,0,2% do dano total). Válido para cash, XP, pet, fragmentos e drops; participante inativo ou abaixo da contribuição não recebe nem reembolso da chave. Raid 70 continua exigindo 3 participantes Lv90+ no início, 3 contribuições de 5% ou cura, sem RaidLote. Não altera orçamento de prêmio de equipes elegíveis. V1 preservada.

Cinco concessões históricas individuais de equipamento (Raid 50 x2, 60, 65, 70) não podem voltar na V2 ao limpar marcadores. Multiplicadores históricos de drop e título Halloween isolados, passes de leilão antigos não eliminam redução da RaidLote V2; Dungeon usa multiplicadores 1. Estrelas de botas reconhecidas no snapshot inicial e entrada tardia V2. IDs de gear do Golem (armadura_golem, martelo_golem) conferidos no catálogo.

Ensaio exploratório offline: 1.600 batalhas: 4 níveis x3 tamanhos (12) +2 configurações Raid70 x2 tamanhos (4) = 16 cenários de 100 lutas. Sementes 12345 a 12444. Curva geral/classe real; classes Paladino, Necromante, Samurai, Berserker em ordem; estágio hipotético; armas e armaduras do catálogo; crítico de Raid e passivas reais; elixir full somente na morte comum; pet bônus base considerado constante (otimista), sem energia, dano ao pet, cura de pet, sinergias, relíquias, encantamento, escudos consumíveis, revives ou acesso real a inventário. Não é execução integral do motor.

| Raid | Nível | Gear (Lv/★) | Solo | 3 | 4 |
|---|---:|---|---:|---:|---:|
| 10 | 10 | espada/armadura ferro (1/1) | 100% | 100% | 100% |
| 30 | 30 | espada chamas/armadura dragão (3/1) | 100% | 100% | 100% |
| 50 | 60 | Excalibur/armadura Titã (5/1) | 0% | 100% | 100% |
| 65 | 85 | lâmina/couraça Caos (8/3) | 0% | 100% | 100% |
| 70 | 90 | lâmina/couraça Caos (5/1) | bloqueado | 0% | 0% |
| 70 | 100 | foice/manto Abismo (10/5) | bloqueado | 100% | 100% |

Raid70 avançada com 3: média 340 rodadas, 92 elixires na equipe (R$230k estimados de custo a R$2500), com 4: 273 rodadas, 103 elixires (R$257,5k). A emissão líquida de dinheiro por vitória continua R$24k; custo de consumíveis exige revisão antes de declarar viabilidade econômica do endgame. Manter HP/ATK agora; simular cura e recursos reais antes de calibrar. Pendências: combate completo e consumo real de pets/poções, Boss comum/semanal, Dungeon por nível, contribuições de suporte aliadas (funções cooperativas ainda não integradas ao loop), mitigação e regras de progressão de gear. Sem alterações em produção, SQL, merge, deploy ou backup.
