# Alpha Bot 2.0 — C4d: cenário adverso de premiações, transporte e Raid 70
Data: 17/11/2026 · Branch feature/reboot-classes-only-20261117 · PR #387 em rascunho.

## Instruções de execução (offline)
`node scripts/reboot-economy-stress.mjs`
`node scripts/reboot-economy-stress.mjs --json`

O script calcula, sem bancos, tokens, rede, saldos, JIDs ou ações em produção, três avaliações SEPARADAS. Valores são moedas ficcionais do jogo.

1. **C4c + eventos condicionais:** parte da simulação de patrimônio do reboot, adiciona premiações GT das 3 provas em todos os dias ativos de cada perfil, ranking GT e Boss por semana concluída, e uma edição de Poço ao dia 60. O caixa extra **não é reinvestido**. Os perfis disputam entre si, não são quatro campeões ao mesmo tempo. Todos os prêmios dependem de participação, vitória, dano ou conclusão; não inferimos EXP real nem elegibilidade a Poço/Boss.
2. **Frota totalmente pré-financiada:** considera, separadamente, 5 veículos Uber e 5 iFood selecionados, 3 motoristas CLT por serviço (turno de 8h em dia ativo), mais 2 veículos livres remunerados em cada comando de Uber e iFood. Os veículos são distintos; não podem trabalhar simultaneamente em CLT e manual. O script declara TODO o capital necessário antes do dia 1 e mostra rendimento menos investimento — não pode ser interpretado como trajetória saindo de saldo zero.
3. **Raid 70 como sensibilidade econômica de vitória hipotética:** simula 1 a 5 membros, exigência mínima de 3 e nível 90, sem RaidLote. Chaves são cobradas de cada membro; contabiliza a fórmula real do jogo sem consumíveis, drops ou derrotas. Não demonstra que esses jogadores conseguem matar o chefe.

## Diferença entre configuração e pagamento da Raid 70
O campo `cashPool:200000` não funciona como teto coletivo na fórmula de vitória. Cada jogador recebe devolução econômica de 108% da chave mais bônus proporcional ao `cashPool`. Em grupos equilibrados de três, a fórmula de vitória paga R$242.397 ao conjunto, consumindo R$180.000 em chaves; sobra R$62.397 antes de poções/derrotas. Quatro membros: R$315.200 distribuídos, custo R$240.000, margem R$75.200. Cinco: R$388.000, chaves R$300.000, margem R$88.000. Esses valores são condicionais a vitória e não são limite do servidor. A proposta de economia deve tratar o pagamento agregado separadamente do retorno das chaves, sem punir automaticamente equipes maiores.

## Como interpretar o resultado
- O orçamento **Boss semanal R$240 mil** é rateado entre membros qualificados, não replicado quatro vezes.
- O **GT semanal R$145 mil** é ranking coletivo. As 3 provas por dia podem somar até R$54 mil com quatro classificados, mas em dias com menos jogadores ativos há menos premiados.
- O **Poço** é uma edição hipotética ao dia 60: R$230 mil de ranking coletivo e R$114,5 mil por cada uma das quatro limpezas completas. Não se assume que um jogador Lv1 seja capaz de limpar 30 andares ao dia 60; é somente teto de stress.
- A análise de frota e o evento não são dois depósitos extras automaticamente combináveis: falta financiamento real dos 10 veículos, custo de manutenção, consumo, derrota e elegibilidade.
- Ainda faltam os cenários de caixas, bingo, leilões, custos de forja, reparos e créditos/juros.
- A hipótese do bônus de GT, Boss e Poço nas mesmas semanas é conservadora para testes de inflação, mas não é uma previsão de participação.

## Critério de não liberação
Se a remuneração de eventos dominar o ciclo dos quatro jogadores, ou se o prêmio de Raid for tratado como cap sem ser, a economia V2 não está equilibrada apesar de testes verdes. A próxima etapa deve propor e validar um teto coletivo de emissão, com regra de divisão explícita e tratamento de chaves para grupos maiores, sem alterar regras V1 e sem implantar V2.

A revisão C4d é análise offline e **não modifica** economia, preços, progressão, status do banco, infra ou cron.

O JavaScript calcula o bônus de contribuição em ponto flutuante antes do `Math.floor`. Com três integrantes, isso arredonda o bônus a R$15.999 por pessoa (em vez de R$16.000), gerando R$242.397. A auditoria reproduz exatamente o código antigo; padronizar cálculo monetário em inteiros é uma futura melhoria, não um ajuste furtivo nesta fase.
