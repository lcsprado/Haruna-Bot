# Cadência de coleta e curva de nível V2 — 18/11/2026

Correção candidata: negócios passam a acumular em 24h. Tarifa efetiva = piso(tarifa de referência * capacidade antiga / 24). A coleta em 24h fica praticamente igual à política anterior; evita que coletas frequentes multipliquem a emissão bruta. Exemplo carrinho: antes 1.280/dia em uma coleta ou 3.840/dia em 24; agora 1.272 em ambos. As tarifas anteriores ficam como referências internas. Ainda há diferença de líquido por arredondamento de imposto/operação por transação; não se afirma igualdade de rendimento líquido. V1 intacta, sem novos registros/queries. Catálogo, cotação e coleta alinhados.

Modelo patrimonial após correção: 7/30/60/120 dias, razão base 2,50/5,20/4,38/3,99; cenários com eventos 2,68/4,81/4,27/3,97. Máxima participação dos negócios 46,4%, liquidez mínima 7,38%. Patrimônio aos 120 dias: casual 1.134.069, regular 2.143.560, dedicado 3.504.600, intensivo 4.525.936. Todos os limites candidatos atendidos. Simulação ainda fixa nível 1 e não inclui GT, outros eventos/custos de poder.

Curva de nível usa level*100 e teto geral 999; classe usa a função real com teto 100; volumes brutos de XP por dia ativo são hipóteses 2k/5k/10k/24k. Ao dia 7: 14/25/35/41; dia 30: 30/51/71/85; dia 60: 42/72/101/120; dia 120: 59/101/143/170. Classe limitada a 100. Nível 90 atingido em 94/48/34 dias (regular/dedicado/intensivo); casual não alcança em 120 dias. Isso NÃO prova capacidade de vencer Raid 70, apenas nível mínimo; exige 3 participantes e contribuição. Necessário testar combate, prêmios, despertar e UI. Sem produção, banco, reset ou merge.

A auditoria de largura de banda falhou devido à mudança autorizada da apresentação de streak no daily-v2.js; SHA fixo atualizado sem remover a proteção.
