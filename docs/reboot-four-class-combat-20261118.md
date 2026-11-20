# Auditoria de combate V2 — 18/11/2026

Offline, quatro classes, 15 cenários, 28.800 duelos (160 sementes por orientação, 6 pares). Executado trecho real de resolução de db.js com funções de classe, crítico, escudo, pulso vital e vencedor proporcional; sem abrir banco. Atributos base do esquema (HP100 ATK10 DEF5 SPD10) e aumento por nível (+8/+2/+1/+1), bônus de classe e despertamentos concluídos hipoteticamente. Equipamento sintético igual (HP 3 por nível, ATK 1,2 por nível arredondado, DEF 0,8 arredondado, SPD10, CRIT6pp), escudo rúnico e cachorro ou Quimera Rubra a partir do nível 60. Não representa acesso/obtenção real; não testa sinergia completa ou PvE. Taxa agregada sobre três oponentes, meta candidata 30–70%.

| Nível | Cenário | Paladino | Necromante | Samurai | Berserker |
|---:|---|---:|---:|---:|---:|
| 1 | sem equip | 30,0% | 18,1% | 70,6% | 81,3% |
| 1 | equip igual | 32,1% | 22,3% | 67,7% | 77,9% |
| 1 | pet/escudo | 31,3% | 15,0% | 71,5% | 82,3% |
| 25 | sem equip | 43,8% | 36,0% | 59,2% | 61,0% |
| 25 | equip igual | 44,8% | 37,5% | 62,7% | 55,0% |
| 25 | pet/escudo | 40,4% | 39,0% | 65,8% | 54,8% |
| 50 | sem equip | 37,7% | 45,4% | 62,7% | 54,2% |
| 50 | equip igual | 39,0% | 43,1% | 63,3% | 54,6% |
| 50 | pet/escudo | 39,6% | 35,4% | 61,3% | 63,8% |
| 75 | sem equip | 34,4% | 50,0% | 62,5% | 53,1% |
| 75 | equip igual | 36,7% | 44,4% | 67,1% | 51,9% |
| 75 | pet/escudo | 33,8% | 44,8% | 66,7% | 54,8% |
| 100 | sem equip | 58,3% | 46,7% | 48,1% | 46,9% |
| 100 | equip igual | 61,0% | 45,8% | 55,2% | 37,9% |
| 100 | pet/escudo | 60,6% | 46,3% | 52,1% | 41,0% |

Resultado: 3 cenários iniciais fora da faixa. Ajuste de multiplicador de ataque testado exploratoriamente (81 combinações pequenas, validação ampliada da melhor) falhou: Necromante chegou a 82,9% e Berserker a 22,5%. Não aplicado. Necessária calibração inicial menos agressiva, com novo ensaio em sementes independentes; também testar estágio I em níveis intermediários, equipamento real, combate PvE, despertar e pets. A aprovação automatizada do teste de auditoria NÃO significa aprovação do balanceamento. Sem mudança de runtime, produção, banco ou merge.

Reprodução: ALPHA_REBOOT_MODE=classes_only node scripts/reboot-four-class-combat.mjs
