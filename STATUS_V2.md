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
1. CI de `c19167d` confirmado: 67/67 workflows retornados com sucesso. Após a correção de recompensas coletivas, `159dd85`: 65/67 workflows aprovados, 2 falharam pelo mesmo teste VM de eventos-relâmpago (dependência rebootEconomyEnabled ausente). Correção do fixture e cobertura adicional V2 em `61131f8`; `1452a3d` confirmado com 67/67 workflows verdes. Após implementação de proteção do Boss comum (`dc91783`) e testes (`a518bfd`), confirmar CI do novo HEAD antes de avançar.
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
- `test/reboot-common-boss-farm.test.mjs`: três testes novos de liquidação com dependência simulada e cobertura de bloqueios, não PostgreSQL real. CI pendente. Próximo: confirmar CI; revisar transparência do cooldown no WA/Web e outras rotas de farm, incluindo comandos diretos/admin. Sem merge, deploy ou alteração em produção.

## Limitações
As simulações anteriores são modelos de cenários; não provam que todo inventário, nível ou partida real esteja balanceado. A seleção do Superboss e a apresentação dos menus foram corrigidas em código, ainda sem teste de navegador ou banco. A configuração de eventos V2 continua sujeita a aprovação. Não criar novos serviços, ampliar planos ou usar banco de produção para homologação.
