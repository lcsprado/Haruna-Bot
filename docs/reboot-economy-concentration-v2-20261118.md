# Ajuste de concentração V2 — 18/11/2026

Política candidata selecionada entre 60 combinações simuladas; 29 atenderam os três limiares nos oito cenários agregados. A escolha privilegia liquidez (mínimo 7,42%), preserva negócio inicial (R$160/h) e reduz emissão por missões, sequências longas e negócios de maior porte. Diária Lv1 R$4.500, comum R$750, especial R$2.750. Sequências 3/7/14/21/30: R$500/1.000/1.500/2.000/3.000; caixas mantidas. Negócios por hora: 160/300/450/650/1.000/1.500/2.500/4.250/7.000, taxas e capacidade previamente definidas mantidas. Sem novo banco ou tabela, V1 preservada. A empresa de tecnologia tem retorno longo; revisar quando progressão e GT forem homologados.

Modelo agora também inclui sequência de dias e proteção de um dia a cada 30 dias; compara preços V2, Boss e Raid 10 hipotéticos reinvestidos, nível fixo 1. O baseline C4c continua reproduzível. Comparação histórica anterior sem streak não é diretamente equivalente; com streak e política anterior, razões base 4,21/8,90/8,20/6,71 e participação máxima negócios 75,0%.

| Dias | Casual | Regular | Dedicado | Intensivo | Razão base | Razão eventos |
|---|---:|---:|---:|---:|---:|---:|
| 7 | 28876 | 32253 | 58774 | 72127 | 2,50 | 2,68 |
| 30 | 105253 | 213425 | 395765 | 546449 | 5,19 | 4,81 |
| 60 | 354464 | 692185 | 1169692 | 1551036 | 4,38 | 4,27 |
| 120 | 1135450 | 2145730 | 3507472 | 4528983 | 3,99 | 3,97 |

Patrimônio total base dia 120 R$11.317.635 (versus R$30.490.089 no relatório anterior sem sequências). Participação máxima de negócios 46,4%, liquidez mínima 7,42%, disparidade máxima 5,19x. Teste determinístico de hipótese, não homologação de produção. Não modela frequência real de turnos, capacidade de coleta em múltiplas sessões, níveis reais, GT/Poço/Bingo/cidade, caixa das sequências, custos de poder. Ações não são limites de runtime. Necessário estresse adicional com coleta frequente e progressão. Nenhum deploy/merge/reset/SQL.

Precisão monetária: fórmula de produção V2 corrigida para calcular pontos percentuais inteiros antes de truncar, evitando perda de R$1 por representação binária. Resultados do simulador continuam aproximações de fluxos (podem diferir em poucos reais pela ordem dos arredondamentos).
