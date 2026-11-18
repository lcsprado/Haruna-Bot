# Custo operacional Raid 70 V2 — 18/11/2026

Mudança candidata restrita à Raid 70 com ALPHA_REBOOT_MODE=classes_only: coeficiente de defesa contra ataque passa de 0,22 para 0,55, mantendo piso de dano válido. Multiplicador de dano recebido pelo pet passa de 0,70 para 0,08 (92% de mitigação em relação ao bruto, versus 30% anteriormente); autocura usa a mesma estimativa. Outras Raids e V1 mantidas. Nenhuma alteração em HP 1,6 milhão, ATK 320, escala +12%/jogador adicional, 50min, 8s/rodada, requisito de 3 jogadores nível 90 e 3 contribuições, prêmio líquido máximo 24 mil por vitória. Pet ainda consome energia e HP. Não altera preços.

Ensaio reproduzível em scripts/reboot-raid70-cost.mjs: 100 sementes por configuração (721190–721289), com vida/energia de pets vitais reais (Quimera 470 base, Serafim 495 base), bônus e cura de pet, escolha econômica de poções, elixir quando o player cai, defesa, ataques e crítica da Raid. Equipamento e estágio hipotéticos já documentados em reboot-pve-audit. Custo é somente itens consumidos dentro da luta, exclui cura pós-Raid, chave perdida na derrota, aquisição de equipamento/pet, reposição de energia inicial, sinergia de equipe, reservas, relíquias, encantamento e revives. Não é execução completa do motor.

| Nível | Equipe | Antes (vitórias/100) | Custo anterior | Depois (vitórias/100) | Custo candidato | Rodadas candidatas |
|---:|---:|---:|---:|---:|---:|---:|
|90|3|0|266594|0|168860|301|
|90|4|0|350098|0|222800|300|
|100|3|100|403926|100|13278|340|
|100|4|100|438097|100|8048|277|

O grupo avançado fica com margem de R$10.722 ou R$15.952 antes de reposição pós-Raid e outras despesas; ainda não comprova lucro real. Grupo 90 continua perdendo. A queda expressiva de custo vem de equipamentos defensivos e durabilidade de pet, não de premiação adicional. A redução pet é forte e necessita teste com pet de nível baixo e equipes variadas; não se afirma balanceamento de outras modalidades. Testes legados de Passe Supremo e multiplicador do dono atualizados para verificar a ramificação que preserva V1 e protege V2. Próximas pendências: Boss/Dungeon, sinergia de equipe, suporte cooperativo, paridade de interface, homologação de batalha completa, backup/restauração. Sem produção, deploy, banco ou merge.
