# Alpha Bot 2.0 — C4e: corte de inflação e limite de Raid
Data: 17/11/2026. PR #387 em rascunho, apenas V2, zero alterações em produção.

## Regras implementadas e protegidas por ALPHA_REBOOT_MODE=classes_only

| Fonte | Tabela candidata anterior | Nova tabela C4e |
| --- | ---: | ---: |
| Superboss — pool semanal coletivo | R$ 240.000 | R$ 40.000 |
| GT ranking semanal (quatro posições) | R$ 145.000 | R$ 20.000 (10k/5,5k/3k/1,5k) |
| GT três provas/dia, quatro classificados | até R$ 54.000/dia | até R$ 7.950/dia |
| Poço, ranking sazonal | R$ 230.000 | R$ 40.000 (20k/12k/8k) |
| Poço, conclusão dos 30 andares | R$ 114.500 por conclusão | R$ 32.500 por conclusão |
| Poço, bônus de dinheiro de guardião | R$ 30–70 mil | R$ 500–1.500 |
| Poço, dinheiro de exploração | R$ 10–19 mil | R$ 300–1.200 |
| Poço, equipamentos exclusivos | ★★★★★ Lv10 prontos | peça-base ★ Lv1, evolução pela forja |
| Negócios Lv5 | +15% por nível | +10% por nível acima do primeiro |

A V1 mantém intactos todos os valores legados. A política da V2 concentra as novas regras em `src/neon/reboot-economy-policy.js`. Poço e os comandos da Web/WhatsApp usam o mesmo flag da V2.

### Renda de negócios em R$/hora (valores V2 C4e)
| Negócio | Antes | C4e |
| --- | ---: | ---: |
| Carrinho de Lanche | 180 | 160 |
| Barbearia | 450 | 400 |
| Loja de Roupas | 1.100 | 900 |
| Restaurante | 2.200 | 1.700 |
| Posto | 4.200 | 3.000 |
| Mercado | 7.200 | 4.500 |
| Hotel | 13.500 | 8.000 |
| Shopping | 25.000 | 14.000 |
| Tecnologia | 42.000 | 27.000 |

Preço de compra e upgrade dos negócios permanecem inalterados — não tentar corrigir preços isoladamente, pois compra, patrimônio, revenda e Web precisam concordar. Um negócio de tecnologia Lv5 agora faz R$907.200 brutos/dia e R$725.760 depois de 10% TAXADE e 10% operação, em comparação com R$1.290.240 líquidos/dia no candidato C4d. A redução é de 43,75% nesse ativo.

## Raid 70: caixa garantido versus dinheiro novo

- Chave Lv70 permanece R$60.000 por pessoa; nível mínimo de personagem 90, mínimo três pessoas; RaidLote 70 indisponível.
- A fórmula de premiação V2 devolve 100% do custo da chave aos vencedores e dá um bônus único de 12% do `cashPool` nominal por batalha, partilhado entre o grupo. Para Lv70 `cashPool=R$200.000`, o bônus agregado é **R$24.000**, independentemente de haver três, quatro ou cinco integrantes.
- Metade do bônus é distribuída igualmente para contemplar suporte e defesa, e metade proporcional ao dano. O somatório é exato (cálculo com inteiros), sem eventos monetários 2×.
- Com três integrantes o grupo recebe R$204.000 (R$180.000 em chaves mais R$24.000 de bônus); com quatro R$264.000; com cinco R$324.000. Isso **não é** dinheiro de lucro total; o lucro bruto do grupo depois de chaves fica R$24.000, antes de consumíveis e tentativas perdidas.
- Para permitir a vitória em Lv70, três participantes precisam contribuir significativamente: pelo menos 5% do dano ou cura de classe/pet suficiente para superar o limiar de suporte. Isso evita levar um terceiro totalmente inativo e preserva a utilidade do curador. O conjunto de classes/HP/dano ainda precisa de homologação PvE; nenhuma conclusão de solo foi permitida.

## Não homologar ainda

- Os cenários de 7/30/60/120 dias devem passar novamente com as novas tarifas. Os valores dos documentos C1–C4d são cenários anteriores, NÃO números vigentes da C4e.
- Limites de origem não substituem um teto agregado por conta/semana entre TODOS os eventos; Boss comum, bingo, leilões, caixas, GT patrocinadores e empréstimos ainda precisam ser auditados.
- A renda passiva permanece sujeita a investimento inicial de alto valor. Ajustar preço só após payback e sincronismo de todas as telas.
- Validar as quatro classes em Raid 70, com dano, cura, equipe de três jogadores e derrotas; nenhum saldo real ou transação V1 está nesta simulação.

Nenhum SQL, alteração de carteira, merge, sessão de WhatsApp, deploy ou novo serviço Aiven/Neon/Render/Vercel.
