# Alpha Bot 2.0 — STATUS_V2
Atualizado em 18/11/2026. Registro de preparação, não autorização de lançamento.

## Controle
- PR #387 em rascunho; branch feature/reboot-classes-only-20261117.
- Base de produção whatsapp-only preservada.
- Não houve merge, deploy, SQL, reset ou ativação da V2 por este trabalho.
- Modo candidato: ALPHA_REBOOT_MODE=classes_only. Não alterar variáveis antes da autorização e dos gates de segurança.

## Entregas candidatas
- Quatro classes, collabs e Raid75 isoladas.
- Economia, progressão/XP, negócios, preços, mercado, veículos, eventos e recompensas rebalanceados.
- PvP calibrado e acesso bilateral Lv21+.
- Raid70: três jogadores Lv90+, contribuição efetiva; custos, pets e defesa ajustados.
- Boss/Dungeon: Superboss 150k HP/45 ATK, fundo R$40k, Boss comum e Dungeons revisados.
- Suporte cooperativo e sinergia de pets ativos.
- Revisão WA/Web: central histórica suprimida, transparência de regras, escopo do Boss global alinhado, catálogo de negócios efetivo, suporte nos relatórios.
- Ver docs/reboot-*.md para hipóteses e limites de cada ensaio.

## Ponto de retomada
1. CI de `c19167d` confirmado: 67/67 workflows retornados com sucesso. Após a correção de recompensas coletivas, `159dd85`: 65/67 workflows aprovados, 2 falharam pelo mesmo teste VM de eventos-relâmpago (dependência rebootEconomyEnabled ausente). Correção do fixture e cobertura adicional V2 em `61131f8`; `1452a3d` confirmado com 67/67 workflows verdes. Proteção do Boss comum (`dc91783`, `a518bfd`) validada em `1574b60`: 67/67 workflows verdes. Minijogos (`8f6e4f9`, `f5f1643`) validados em `1ebe2e5`: 67/67 workflows verdes. Reservas de apostas virtuais (`937e626`, `562bb12`): `5b37fdc` teve 62/67 workflows aprovados e 5 falharam pela mesma asserção literal de roleta no smoke legado. Correção da asserção (`b6f9d62`) mantém garantias V1 e V2; 5 asserções verificadas isoladamente. CI de `19ca1a2` aprovado: 67/67 workflows. Segurança administrativa V2 (`1051d4d`, `4821a96`) e alterações paralelas de trabalho AFK/avisos de cooldown: HEAD `0897c15` aprovado com 67/67 workflows. Correção do HP na rodada final de Raid (`5225403`, `2e91c8d`): HEAD `1f8a9e8` aprovado 67/67. Motor raidRound executado com cliente simulado: 13 verificações aprovadas.
2. Homologação integrada offline: revisar todas as rotas e menus restantes, comandos diretos/admin, eventos ativos, mecanismos de economia e farm entre grupos; simular ciclo de combate completo (HP/energia, equipamentos reais, pets, poções, sinergia e recompensas), e paridade WA/Web; conferir SQL e limites de infraestrutura sem tocar produção. Não declarar homologação com apenas testes estáticos.
3. Backup V1 do Aiven alpha_prod_v2 via pgAdmin em E:\AlphaBot-Backups (pendente); SHA-256 e restauração em ambiente autorizado (pendentes). Não copiar segredos.
4. Só com aprovação explícita, parar V1, reset manual pelo dono, verificar banco limpo, ativar V2 e smoke tests. Nenhuma destas ações autorizada nesta fase.

## Homologação offline — recompensas coletivas (18/11)
- Revisados comandos de administração: fluxo `admin_` valida proprietário; trabalho tem cooldown global por JID. Revisão de todos os comandos diretos e identidade ainda não concluída.
- Correção candidata V2 em `src/neon/progression.js`: missão coletiva com fundo R$5.000/R$6.000, sem multiplicador antigo e um resgate global por jogador/semana (advisory lock + consulta a resgates existentes). Evento-relâmpago R$600–2.000, teto R$2.000 inclusive em estado residual e um resgate por jogador a cada 24h (cooldown transacional). Mesmos serviços chamados pelo WA e Web; V1 sem mudança intencional.
- `test/reboot-group-rewards.test.mjs` exercita funções com banco simulado, resgates cruzados e V1; Quatro testes novos passaram na suíte estendida de `159dd85`; a suíte integral teve 1.404 aprovados, 5 ignorados, 1 falha de fixture descrita acima. CI da correção aprovado em `1452a3d`: 67/67. Valores candidatos, não homologados. Não houve nova tabela, serviço, SQL em produção, deploy ou merge.
- Próximo ponto após CI: revisar outras atividades por grupo, comandos/admin diretos, depois ciclo de combate e paridade WA/Web. Testar concorrência real apenas em ambiente isolado autorizado.

## Homologação offline — Boss comum (18/11)
- Boss comum tem cooldown por sala, mas antes não tinha limite de premiação por jogador entre grupos. V2 passa a usar `claimCooldown` na liquidação, na mesma transação do prêmio, com chave global por JID e janela móvel de 3.600 segundos. Só contribuição elegível consome a janela; nova vitória dentro dela mantém combate/participação, mas não paga dinheiro, XP, XP de pet, caixa ou pergaminho de reclassificação. V1 e Superboss semanal preservados.
- Mantido fundo de R$2.500, XP de 120 e participação mínima já existente. Janela de uma hora é parâmetro candidato alinhado ao intervalo por sala; não representa teto diário geral. Ataques simultâneos entre salas e outras fontes de farm ainda requerem revisão.
- `test/reboot-common-boss-farm.test.mjs`: três testes novos de liquidação com dependência simulada e cobertura de bloqueios, não PostgreSQL real. CI aprovado em `1574b60` (67/67). Próximo: revisar transparência do cooldown no WA/Web e outras rotas de farm, incluindo comandos diretos/admin. Sem merge, deploy ou alteração em produção.

## Homologação offline — minijogos de habilidade (18/11)
- Quiz e Adivinhe o Número pagavam recompensa por partida, com multiplicadores antigos. V2: Quiz R$100; Número R$30–150 pela fórmula (10 tentativas: R$60–150 na prática), sem multiplicadores. Um único cooldown de prêmio por JID, compartilhado pelos dois jogos, grupos e canais, de 30 minutos. Acertos sem direito a prêmio continuam permitidos; erro não consome cooldown. V1 intacta.
- Serviços `answerQuiz` e `guessNumber` reutilizados pelo WA/Web; pagamento e `claimCooldown` na mesma transação. API Web já oculta segredo de Quiz/Número antes do resultado. Campo V2 `rewardCooldown` identifica acerto sem prêmio; mensagens específicas de cooldown WA/Web implementadas em alterações posteriores, verificadas no HEAD `0897c15`.
- Testes executáveis com dependências simuladas em `test/reboot-casual-game-rewards.test.mjs` (3 casos). CI aprovado em `1ebe2e5` (67/67). Janela e valores são proposta de balanceamento; não houve teste com DB real. Não foi alterada a economia de apostas, roleta, duelos ou outros minijogos nesta etapa.
- Próximo: validar CI, revisar rotas restantes de emissão, comandos/admin, transparência de regras WA/Web e ciclo completo de combate. Sem deploy, merge ou alteração de produção.

## Homologação offline — reservas de apostas virtuais (18/11)
- V2: roleta individual/coletiva e cara ou coroa não recebem multiplicadores antigos de evento, preservando pagamentos-base. Não houve mudança de probabilidades-base, limites de apostas ou outros mecanismos de blackjack.
- Partidas expiradas de roleta coletiva, duelos de moeda/PPT e torneio: devolução das reservas efetivamente debitadas e remoção do estado na mesma transação; aviso de expiração somente após COMMIT. Ao substituir uma partida expirada, estorno e novo débito são atômicos; se a criação falhar, a transação inteira reverte e a reserva anterior permanece. Sem estorno por timer nesta etapa: liquidação na próxima interação pertinente ou substituição bem-sucedida. V1 mantém comportamento anterior.
- Quatro testes com transação simulada em `test/reboot-game-expiry-refunds.test.mjs` passaram na suíte estendida de `5b37fdc` (1.414 aprovados, 5 ignorados, 1 falha de asserção literal legada). Corrigida a asserção em `b6f9d62`, CI de `19ca1a2` aprovado (67/67). Não houve execução de SQL contra banco real nem validação de concorrência em PostgreSQL.
- Próximo após CI: revisar comandos/admin diretos e outras fontes residuais de emissão, transparência WA/Web e ciclo completo de combate. Considerar rotina de limpeza de jogos abandonados somente com orçamento de consultas e testes específicos. Produção intacta.

## Homologação offline — identidade administrativa (18/11)
- Em V2, autorização owner passa a comparar JIDs completos (telefone/LID), sem equiparar dígitos de namespaces distintos. Utiliza remetente resolvido e origem; pairing só é fallback quando não há proprietário explícito. Mapeamento especial OWNER_LID/OWNER_NUMBER não sobrepõe conflito de identidade. V1 preservada.
- `!daritem @pessoa` em V2 usa resolução de destinatário verificado, como saldo/XP/nível; menção sem resolução falha antes da entrega. Guardas owner-only de reset, saldo, XP, nível e item permanecem; menu admin_ valida owner; web-api.js não apresentou chamadas diretas às funções owner examinadas. Não se trata de auditoria completa de todos os handlers ou credenciais de deployment.
- `test/reboot-admin-identity.test.mjs`: quatro testes avaliados isoladamente com 18 asserções; CI agregado de `0897c15` aprovado (67/67). Teste real de identidade WhatsApp e configuração do proprietário é gate de homologação. Não foram lidas ou alteradas variáveis de produção.
- Próximo: verificar CI; revisar demais fontes residuais de emissão, paridade de mensagens/cooldowns WA/Web e ciclo de combate integral. Sem merge/deploy/SQL de produção.

## Homologação offline — combate integrado (18/11)
- HEAD `0897c15`: 67/67 workflows aprovados, incluindo alterações paralelas de avisos Quiz/Número WA/Web e limite de recompensa parcial de AFK (carpinar) ao plano V2.
- Executadas 22 asserções isoladas sobre funções reais de classe, cura, projeção temporária de HP, equipe de pets, energia e teto diário de XP. Cenários determinísticos de oito ataques nas quatro classes Nv.90/Despertar IV, atributos e HP de equipamentos sintéticos, não execução integral de raidRound nem simulação de banco real. Dano acumulado de exemplo: Paladino 4.920, Samurai 5.844, Berserker 6.611, Necromante 5.460; não usar como previsão de balanceamento de partida real.
- Achado: vitória antes da fase defensiva persistia cura do último golpe somente para heróis. V2 agora acumula delta projetado de cura de classe nesta fase e soma ao HP persistido dentro da transação de encerramento, sem sobrescrever HP externo, sem ressuscitar e com limite do máximo persistente da sala; V1 preservada. Validação de alterações de equipamento concorrentes continua pendente.
- `test/reboot-raid-final-class-heal.test.mjs`: dois testes de trecho real do motor com cliente simulado. CI de `1f8a9e8`: 67/67 aprovado. Próximo: confirmar CI e revisar outras diferenças de persistência/HP, executar ciclo real de combate em ambiente isolado, validar paridade restante e gates de backup. Sem merge, deploy, reset ou SQL em produção.

## Execução assistida do motor de Raid (18/11)
- Executado corpo integral de `raidRound` de `1f8a9e8` por oito rodadas, com funções reais de ataque/defesa de classe, poção, Vínculo Vital, filtragem de pets ativos, elegibilidade e distribuição financeira. Cliente SQL, estado inicial, relógio, aleatoriedade, coeficiente de defesa, resistência crítica, relíquias, persistência de pet, telemetria e callback `finishRaidRewards` simulados. Não executou criação de sala, escala de HP por tamanho do grupo, nem liquidação real de XP/inventário. Primeira execução da bancada falhou por ausência de `process.env` no ambiente de execução; segunda, com modo V2 explicitamente injetado, passou 13/13 asserções. Resultado registrado como execução assistida, não como novo teste automatizado versionado.
- Raid 10: HP-base da configuração 9.500, quatro jogadores sintéticos, vitória em oito rodadas; dano real acumulado exatamente 9.500; uma poção média debitada; pet com uma unidade de energia participou da última rodada elegível e sinergia expirou na seguinte. Partilha pela política real: R$ 2.375, R$ 2.369, R$ 2.352, R$ 2.344 (total R$ 9.440, dos quais R$ 8.000 reembolso de chaves, R$ 1.440 lucro). Nova chamada após conclusão retornou inactive, sem nova liquidação no fixture sequencial.
- Raid 70: cenário sintético de HP restante 1.000 e três inscritos, somente um participante causou dano; retorno insufficient_cooperation, zero chamadas de premiação. Não comprova dificuldade integral da Raid 70 nem concorrência real. Sem SQL, deploy ou merge de produção.
- Próximo: executar criação, rodadas e premiação reais em PostgreSQL isolado, com equipamentos válidos e paridade WA/Web; verificar backup V1 e restauração autorizada. CI de código do último HEAD aprovado; checkpoint documental dispara novo CI.

## Homologação PostgreSQL descartável (18/11)
- HEAD f8f3d81: 68/68 workflows aprovados. Novo workflow exclusivamente PR #387, runner GitHub e PostgreSQL local 16, sem secrets, sem WhatsApp/Web, sem Aiven/Neon. Teste real de Raid10 manual: quatro classes, equipamentos válidos, HP escalado 12.920, cinco rodadas, R$ 9.440 distribuídos (R$ 8.000 de chaves + R$ 1.440 lucro); duas chamadas concorrentes por rodada sem duplicação. Teto 12.000 XP e cooldown global validados com três transações concorrentes. Raid70 solo bloqueada antes do consumo da chave.
- Detectados multiplicadores legados ainda acessíveis por fontes antigas, inclusive battle e pets. V2 agora retorna multiplicador 1 nas funções compartilhadas de dinheiro/XP/pet/sorte, oculta estados antigos e bloqueia a reativação pela Central do Owner e evento 2x. Decisão candidata de balanceamento: eventos V2 com orçamento próprio, sem bônus globais antigos. V1 intacta; comandos administrativos de saldo/XP permanecem.
- Teste real ampliado para registros residuais de multiplicadores, PvP bilateral, Dungeon e poção aprovado em 2994cd9: 68/68 workflows. A etapa seguinte adiciona consumo de energia e sinergia vital no motor real, troca o runner para PostgreSQL 18 e testa pg_dump/pg_restore de dados exclusivamente sintéticos; CI pendente. Não comprova equilíbrio de Raid70 integral, sessão WhatsApp real, navegador ou restore da V1.
- Infra somente leitura: Aiven RUNNING free-1-1gb, 8 bancos, 11 backups internos, PostgreSQL 18, disco latest 40,731 na unidade nativa, CPU 15,598, memória 68,389 (pico 79,038 no dia). Vercel nenhum deploy da branch candidata. Limites de franquia Vercel/Neon, métricas Render e conexões efetivas ainda não reconfirmados. CI anterior usou PostgreSQL 16; próximo teste usa PostgreSQL 18, sem dados ou serviços de produção.
- Não houve deploy, merge, SQL na produção, backup da V1 ou restauração de dados reais.

## Limitações
As simulações anteriores são modelos de cenários; não provam que todo inventário, nível ou partida real esteja balanceado. A seleção do Superboss e a apresentação dos menus foram corrigidas em código, ainda sem teste de navegador ou banco. A configuração de eventos V2 continua sujeita a aprovação. Não criar novos serviços, ampliar planos ou usar banco de produção para homologação.
