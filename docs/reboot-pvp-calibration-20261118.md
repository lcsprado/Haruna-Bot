# Calibração PvP V2 — 18/11/2026

A auditoria anterior incluiu níveis hipotéticos abaixo do acesso real: defensor Lv.1–20 já era protegido. A V2 torna a proteção simétrica, impedindo também iniciar duelo antes do Lv.21, antes do cooldown, na função battle compartilhada por WhatsApp e Web. V1 conserva a regra anterior. Nenhuma mudança de saldo, atributos persistidos, PvE ou Despertar V.

Amostra inicial representativa de 78 cenários: níveis 21,22,23,24,25,50,75,100, estágios 0 a máximo elegível pelo nível (sem presumir missões/equipamento disponíveis), três configurações equivalentes (sem equipamento, equipamento sintético igual, pet/escudo iguais). 93.600 duelos, 68/78 aprovados, faixa agregada 30%–70%. Foram testados ajustes de atributos e dano inicial, rejeitados por desequilíbrio nos níveis intermediários. Selecionada menor correção entre cinco combinações aprovadas: Samurai -2,5% de dano até IV, Necromante +2% até I, Paladino +2% de II a IV. Berserker e V intactos. Aplica ao dano final de ataque, apenas em PvP V2.

Revalidação com semente 11827341: 65.520 duelos, 78/78, taxas agregadas 31,4–67,1%. Semente independente 88209117: 168.480 duelos, 78/78, taxas 31,9–63,5%. No nível 21 sem despertar e sem equipamento: Paladino 41,3%, Necromante 40,7%, Samurai 58,3%, Berserker 59,6% (arredondamento individual). Não garante taxa real, todos os níveis intermediários ou cada confronto individual: o critério é taxa agregada contra três oponentes. Ainda pendentes diferenças de nível, sinergias completas, equipamento real e PvE. Sem deploy/merge/reset/banco.

Reprodução: ALPHA_REBOOT_MODE=classes_only node scripts/reboot-four-class-combat.mjs
