# Alpha Bot 2.0 — estado de classificação de dados (17/11/2026)
Gerado a partir da auditoria estática do PR #387. **Não é schema SQL e não autoriza reset**.

## Resultado da execução isolada
- Fontes examinadas: **199 arquivos** de `src/neon` e `web`.
- Tabelas deduplicadas encontradas em definições DDL no código: **116**.
- Classificadas por regra explícita: **116**.
- Tabelas desconhecidas nessa varredura: **0**.
- Testes próprios da preparação: **10/10 aprovados** no GitHub Actions.
- **Não significa** que o banco real tenha somente 116 tabelas; extensões, migrações, DDL dinâmico e diferenças de versão podem adicionar outras. Conferir `pg_catalog` APENAS no futuro banco de homologação.

## Tratamento planejado (não executado)
| Classe de dados | Quantidade | Tratamento na V2 |
| --- | ---: | --- |
| `fresh_gameplay` | 79 | Criar esquema do módulo com dados de jogo vazios; a progressão dos 4 jogadores começa do zero |
| `selective_migration` | 12 | Copiar só campos autorizados de identidade, licenças, controles e acesso, nunca a tabela completa |
| `auth_cutover_only` | 2 | Transportar apenas na virada após a parada comprovada do WhatsApp antigo; nunca expor na homologação |
| `manual_review` | 10 | BLOQUEIO: nenhuma cópia automática até fechamento de regras específicas |
| `archive_only` | 11 | Manter no banco antigo desligado/backup; não copiar registros de eventos passados |
| `reseed_catalog` | 1 | Recriar o catálogo de itens sem itens das collabs |
| `fresh_volatile` | 1 | Inicializar vazio, sem transportar contadores de limitação de login anteriores |
| `unclassified_blocker` | 0 | Qualquer nova tabela entra aqui e bloqueia a execução |

## Dez áreas bloqueadas para revisão especializada
| Tabela | Por que não copiar ou excluir diretamente |
| --- | --- |
| `transactions` | Histórico financeiro e de recompensas: separar moeda fictícia de qualquer registro associado a benefício/pagamento real |
| `trevo_settings` | Mistura chaves operacionais, configurações globais e estado de temporada; exige whitelist de chaves |
| `trevo_games` | Sessões persistentes de minigames/Raid, algumas podem reabrir após reconexão |
| `boss_auto_sessions` | Recompensas e batalhas pendentes; risco de crédito duplicado |
| `snipe_messages` | Dados de mensagens e privacidade; não são progressão e exigem política própria de retenção |
| `quick_flows` | Interações em andamento, não devem voltar a ser executadas na V2 |
| `auction_bid_notice_outbox` | Fila de avisos de leilão; não pode reenviar premiação/aviso antigo |
| `raid_lote_notice_outbox` | Fila de entregas automáticas de RaidLote, risco de replay |
| `whatsapp_outbound_retry` | Reenvios pendentes do WhatsApp; risco de mensagens antigas e duplicadas |
| `awakening_migrations` | Marcadores de migração podem reexecutar correções antigas e alterar atributos da temporada nova |

## Acesso e direitos operacionais
- `users` requer migração de identificação e preferências separada dos campos `level`/`exp`.
- `group_licenses`, `subscription_orders` e dados de senhas Web devem manter direitos legítimos e segurança.
- `verified_whatsapp_lid_links` protege a identificação correta entre WhatsApp privado/grupo; precisa de migração seletiva.
- `auth_creds` e `auth_keys` NÃO podem ser carregados no WhatsApp de teste nem usados por dois serviços em paralelo.
- `web_auth_rate_limits` é estado operacional temporário; o novo banco começa com controle de acesso íntegro e nenhum token antigo copiado sem validação.

## Fronteira de gameplay
- Há quatro classes selecionáveis e somente elas: Paladino, Necromante, Samurai e Berserker.
- `player_hero_mode`, maestrias dos Pecados, itens exclusivos e progresso anterior não entram no novo jogo.
- `player_awakenings`, `equipment_enchantments`, `poco_abismo_claims`, `racing_*`, GT, pets, carros e negócios iniciam com dados de temporada novos, mantendo o código das funcionalidades.
- Sistemas próprios da cidade com NPCs em `city.js` são diferentes dos NPCs antigos do Cerco. Não remover um sistema por semelhança do nome.

## Próxima autorização técnica (não do usuário)
Antes de qualquer operação de migração, são obrigatórios: (i) validar o schema efetivo em banco-clone isolado; (ii) identificar os quatro JIDs corretamente; (iii) concluir as dez revisões; (iv) garantir que não há scheduler/outbox ativo no ambiente B; (v) restore de backup testado; (vi) economia 2.0 aprovada e teste de regressão do RPG.

Nenhuma ferramenta de auditoria contém comandos destrutivos. O PR permanece em rascunho, sem deploy.
