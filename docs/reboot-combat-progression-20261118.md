# V2 — progressão, classes e dificuldade
18/11/2026 — PR #387 iniciou o reboot com quota diária de XP, posteriormente substituída pela regra de 21/11/2026 (sem teto). A curva de nível geral permanece 100×nível, e o nível da classe evolui separadamente até 100. V1 preservada por modo.

## NOVA REGRA DE XP (21/11/2026)

- No Alpha Bot V2 não há limite diário de XP creditável; o contador de XP por dia é apenas informativo e reinicia à meia-noite de São Paulo, sem reduzir XP acumulado de nível.
- 06h00 até 23h59min59s (America/Sao_Paulo): 100% do XP normalmente concedido.
- 00h00 até 05h59min59s (America/Sao_Paulo): 70% do XP normalmente concedido. A taxa é avaliada no momento em que a recompensa é creditada (vitória da Raid, fim da atividade etc.).
- RaidLote (modo V2) mantém seus 60% de XP de jogador e **não sofre o redutor da madrugada**, inclusive quando uma tentativa começa de dia e acaba de madrugada. O lucro líquido, XP de heróis e pets, materiais e demais parâmetros de RaidLote seguem suas regras próprias, sem modificações.
- Os bônus de XP de consumíveis são contabilizados no crédito e escalados pela mesma taxa horária nas atividades normais; no RaidLote, o redutor noturno não é aplicado uma segunda vez ao bônus.
- Um registro reutilizado por usuário em trevo_settings registra o XP efetivamente creditado no dia, sob lock transacional de users. O perfil WhatsApp e a Web mostram XP hoje, sem teto, e a taxa horária no momento da consulta.
- Não são alteradas taxas econômicas, limites de tentativas, recompensas-base ou políticas de anti-exploit. Não há reset de personagens ou do banco.

Bônus de classe capados a Nv100: Paladino +360 HP/+40 DEF, Berserker +170 HP/+45 ATK/+8 DEF/+4 VEL; Samurai +210 HP/+32 ATK/+12 DEF/+24 VEL; Necromante +240 HP/+25 ATK/+18 DEF/+6 VEL. PvP reduz fatores de compensação de collab no Despertar V: ataque/defesa 8/12%,16/7%,13/7%,12/9% respectivamente. Técnicas, atributos persistidos e fórmula de dano não mudam; falta medir taxa de vitória com builds reais sem collab, não afirmar equilíbrio definitivo. Dungeon V2 usa nível da classe e não paga vitória se o monstro não morreu no prazo.

Despertar II/III/IV/V níveis 25/50/75/100, R$12k/30k/65k/120k, missões por trilha x2/3/4/5, mínimos Raid 15/30/50/60 considerando também nível da missão original. Cooperação V mantida. Sem bônus/reconstruções pessoais legadas. Raids 10 a 50 HP reduzido para acessibilidade, 60/65 levemente aumentados; Raid70 segue 1,6M HP, ATK320, mínimo Nv90 e três participantes. Duração original. Sem reset, deploy, banco ou nova infraestrutura. Valores candidatos, ainda precisam de simulação e homologação prática. V1 preservada por modo.

## VISIBILIDADE DO XP DIÁRIO (INFORMATIVA)
Perfil WhatsApp e Web exibem o XP creditado desde a última meia-noite, sem exibir nenhuma barra ou limite diário. O indicador mostra a taxa horária de 100% ou 70%, com RaidLote preservando 60% a qualquer hora. O contador reinicia à meia-noite sem afetar o progresso de nível ou classe. O pergaminho de XP continua limitado a uma utilização diária e ao nível máximo do personagem, mas não é bloqueado por teto diário inexistente.
