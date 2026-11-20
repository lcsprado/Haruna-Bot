# Simulação candidata V2 — 18/11/2026

Execução determinística em JavaScript isolado a partir das funções versionadas. Nível fixo 1; saldo inicial zero; preços V2 e reaplicação de prêmios condicionais (Boss semanal por pesos 4/3/2/1 e Raid 10 semanal desde dia 21, lucro líquido de chave). Sem afirmar elegibilidade nem vitória; GT/Poço/Bingo/cidade e custos de poder não modelados. XP é sensibilidade de quota, não curva de nível. Os 32 cenários fecharam a contabilidade. Não homologado.

| Perfil | Dias | Patrimônio base | Patrimônio com eventos |
|---|---:|---:|---:|
| casual | 7 | 26102 | 30102 |
| casual | 30 | 120431 | 119359 |
| casual | 60 | 359668 | 431936 |
| casual | 120 | 1773434 | 2095970 |
| regular | 7 | 43961 | 51961 |
| regular | 30 | 283667 | 336347 |
| regular | 60 | 1104067 | 1217243 |
| regular | 120 | 5142452 | 5546544 |
| dedicado | 7 | 78748 | 90748 |
| dedicado | 30 | 617585 | 692533 |
| dedicado | 60 | 2315612 | 2526544 |
| dedicado | 120 | 9857192 | 10616488 |
| intensivo | 7 | 110057 | 126057 |
| intensivo | 30 | 1019177 | 1106947 |
| intensivo | 60 | 3396464 | 3665306 |
| intensivo | 120 | 13717011 | 14441265 |

Razões de patrimônio base: 7d 4,22x; 30d 8,46x; 60d 9,44x; 120d 7,73x. Condicional: 4,19x; 9,27x; 8,49x; 6,89x. Negócios até 75,4% da renda base e 76,6% condicional no dia 120 (denominador de atividades sem prêmios extras do modelo original). Limiares: 6x patrimônio, 70% participação dos negócios e 3% liquidez. Ultrapassagem impede declarar economia equilibrada. Próximo: ajustar fontes passivas e repetir simulação, depois validar progressão real, GT/cidade e interfaces. Nenhum deploy/merge/reset.
