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
1. Confirmar CI do HEAD do PR, corrigir falhas antes de avançar. Última referência verificada verde: c064496 (67/67 workflows); após isso houve falhas em asserções legadas e correções subsequentes ainda aguardam CI.
2. Homologação integrada offline: revisar todas as rotas e menus restantes, comandos diretos/admin, eventos ativos, mecanismos de economia e farm entre grupos; simular ciclo de combate completo (HP/energia, equipamentos reais, pets, poções, sinergia e recompensas), e paridade WA/Web; conferir SQL e limites de infraestrutura sem tocar produção. Não declarar homologação com apenas testes estáticos.
3. Backup V1 do Aiven alpha_prod_v2 via pgAdmin em E:\AlphaBot-Backups (pendente); SHA-256 e restauração em ambiente autorizado (pendentes). Não copiar segredos.
4. Só com aprovação explícita, parar V1, reset manual pelo dono, verificar banco limpo, ativar V2 e smoke tests. Nenhuma destas ações autorizada nesta fase.

## Limitações
As simulações anteriores são modelos de cenários; não provam que todo inventário, nível ou partida real esteja balanceado. A seleção do Superboss e a apresentação dos menus foram corrigidas em código, ainda sem teste de navegador ou banco. A configuração de eventos V2 continua sujeita a aprovação. Não criar novos serviços, ampliar planos ou usar banco de produção para homologação.
