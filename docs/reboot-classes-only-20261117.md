# ALPHA BOT — Reboot de classes / temporada nova
Data: 17/11/2026 · Branch de preparação: `feature/reboot-classes-only-20261117`

## Decisão do dono do jogo
- Preservar TODOS os sistemas atuais do bot: WhatsApp, Web, PvP, Raids/Boss, pets, clãs/Cerco, GT, carros, Uber/iFood, imóveis, negócios, economia, leilões, bingo, eventos e Poço do Abismo.
- Excluir definitivamente as colaborações, inclusive todos os personagens jogáveis dos 7 Pecados, técnicas, equipamentos vinculados, materiais, essências, fragmentos, Raids/bosses exclusivos, lojas e atalhos. As classes tradicionais voltam a ser o único combatente.
- Quatro jogadores começam do zero: níveis, experiência, dinheiro, banco, pets, coleções, forja, garagem, negócios, propriedades, clãs/ranking, conquistas, buffs e demais progressões. As contas e sistemas não são apagados.
- Reequilibrar receitas/despesas, níveis, loot, equipamento e combate ANTES do reset real. Equipamento lendário deve voltar a ser relevante.
- NÃO modificar produção e NÃO executar qualquer SQL contra banco real nesta preparação.

## Proteção obrigatória
Preservar identificadores de contas e grupos, autenticação WhatsApp/Web, licenças, assinaturas/benefícios pagos, permissões/admin, tickets de suporte, configurações administrativas e histórico/auditoria externa de transações financeiras reais. Separar receita/moeda fictícia do jogo de pagamento real.

Criar backup RESTAURÁVEL de banco e código antes de qualquer migração destrutiva. Não usar restauração de banco antigo: sobrescreveria sistemas corrigidos depois da collab. Não tocar nos projetos ou serviços Render/Koyeb/Vercel/Neon/Aiven de produção nesta fase.

## Inventário de persistência observado (auditoria estática, NÃO exaustivo)
- `db.js`: users, wallets, stats, player_class_levels, inventories, bound_inventory_items, equipment_fusions/upgrades/star_forges, cooldowns, daily_streaks, pets, pet_collection, pet_team, pet_expeditions, market_listings, transactions e mais.
- `progression.js`: clans, clan_members, clan_donations, user_homes, user_cars, user_motorcycles, user_businesses, group_missions, group_events, clt_uber_drivers, clt_ifood_drivers.
- `playable-heroes.js`: player_hero_mode, player_hero_mastery, player_hero_mastery_unlocks, hero_mastery_awards, hero_level_awards.
- `games.js`: trevo_games, boss_auto_sessions, player_damage_stats, player_damage_hits.
- `loans.js`: player_loans.
- Diversos módulos criam outras tabelas: identificar por varredura de DDL e consulta ao schema de um CLONE, nunca assumir que esta lista está completa.

## Problemas econômicos confirmados no código
- Empresa de Tecnologia: compra R$30 milhões, R$110.000/h de base e capacidade de 24h; o retorno-base pode ser R$2,64 milhões/dia antes de multiplicadores de nível (em `progression.js`).
- `business-profit.js`: histórico de mudança das tarifas e fórmula de nível `1+(level-1)*0.25`; não reutilizar tarifa legada em novos personagens.
- `games.js`: Raid 75 ligada aos 7 Pecados; lista de outras Raids inclui recompensas em dinheiro, EXP e itens. Revisar TODAS, não apenas a Raid da collab.
- `poco-abismo-rewards.js`: Poço paga dinheiro e EXP por andar, com caixa e itens já forjados ★5 Lv10; ajustar para não invalidar lendários do reboot.
- Leilões, receitas automáticas, missões e bônus cumulativos demandam inventário de fontes e drenos; nenhum valor definitivo deve ser aprovado sem simulação.

## Etapas / critérios de aceite
### A — Inventário técnico e auditoria (começar aqui)
1. Varredura reexecutável de referências de collab em runtime e Web; produzir lista de arquivos e linhas.
2. Listar TODAS as tabelas criadas por módulos e classificar: (i) progresso resetável por JID; (ii) estado global da temporada; (iii) histórico protegido; (iv) operacional intocável.
3. Identificar as quatro contas por JID **validado antes do reset**, sem inferir por apelido.
4. Inventariar todos os canais de entrada de moeda, XP, drop e poderes acumulados.
Aceite: mapa auditável de dependências, sem nenhuma escrita em banco.

### B — Desacoplamento da collab
1. Desabilitar somente em ambiente de teste as rotas de herói e eventos da collab.
2. Restaurar classes como combatentes exclusivos em Web/WhatsApp/combate/relatórios.
3. Excluir referências de personagens e itens da collab de catálogos, loot, forja, filtros, menus e temporadas futuras; manter apenas registros históricos no arquivo offline.
4. Manter intactos os sistemas não relacionados (especialmente Cerco sem NPCs antigos, GT, pets e Poço).
Aceite: pesquisa de dependências de runtime da collab zerada, testes de classes e regressão passando.

### C — Economia 2.0
1. Tabela única de preços/recompensas por segmento; retirar valores milionários gratuitos sem fonte.
2. Projetar aquisição de carro/negócio/arma e rentabilidade; simular 4 perfis de jogadores por 7/30/60 dias.
3. Reduzir receitas passivas abusivas, bônus aditivos/multiplicativos e fontes de loot máximo; manter custos que tornam investimentos graduais.
4. Calibrar Boss/Raid/PvP/Poço para nível inicial até endgame; comparar classes e progressão de equipamento lendário.
Aceite: relatórios reproduzíveis de entrada-saída de moeda e evolução; nenhuma classe ou item trivializa o conteúdo.

### D — Migração simulada, depois lançamento separado
1. Criar banco de teste isolado/clonado e cópia verificável com dados anonimizados dos 4 JIDs; jamais apontar scripts ao DATABASE_URL da produção.
2. Dry-run antes/depois de TODAS as tabelas; preservar contas, benefícios pagos, licenças e direitos administrativos.
3. Testar sem perda/dobro de crédito, sem dados órfãos, sem recompensas antigas resgatáveis, sem sessão em andamento e sem histórico de collab ativo.
4. Iniciar os 4 no Lv1 em igualdade; validar WhatsApp/Web/GT/Cerco/Raid/PvP/mercado/eventos.
5. Lançamento real somente por aprovação expressa em nova etapa, após backup, snapshot SHA, plano de rollback e janela de manutenção.
Aceite: relatório de comparação + testes verdes + aprovação humana.

## Proibição desta branch
Não executar TRUNCATE, DELETE, UPDATE em banco real; não fazer merge automático, deploy, reset ou pagar compensações. Não recriar sistemas existentes e não modificar arquivos fora do escopo.

## Instrução enxuta para eventual Work (SOMENTE auditoria, nenhuma implementação)
Repositório `lcsprado/Haruna-Bot`, base `whatsapp-only`, branch `feature/reboot-classes-only-20261117`.
Analise `src/neon/db.js`, `src/neon/progression.js`, `src/neon/games.js`, `src/neon/playable-heroes*.js`, `src/neon/loans.js`, `src/neon/sete-pecados*.js` e módulos referenciados; analise `src/neon/web-api.js` e `web/app.js`.
Entrega única: tabela com (arquivo/linha, tabela ou rotina, tipo de persistência, risco de remoção de collab, ação proposta).
Verificar especificamente se haverá regressão em GT, Cerco, pets, Poço e licenças.
Não criar novos sistemas, não reescrever eventos, não tocar no deploy ou DB. Se algo depender de dados de produção, marque PENDENTE, sem conectar. Termine ao entregar a tabela; não faça alterações especulativas.
