# Alpha Bot 2.0 — prêmios de nível e consumíveis
18/11/2026 · PR #387 · Somente código e testes, sem acessar DB.

Os 20 marcos até Nv.100 antes totalizavam R$ 6.350.000 em dinheiro; agora R$ 119.500. Nv.5 R$1.000, Nv.50 R$5.500, Nv.100 R$15.000. A partir de 110 os marcos continuam de dez em dez, com R$8.000–12.000; de 200 em diante de vinte em vinte, R$12.000–15.000 limitados. Até 100, três caixas épicas somadas, nenhuma lendária/forja máxima/collab, sem chave 70 ou 75. Nv.100 mantém pergaminho de reclassificação, duas caixas épicas e uma chave 50. Resgates e auditoria/idempotência originais permanecem. O reset humano deve verificar tanto level_reward_claims quanto level_reward_audit para não bloquear a nova temporada; não alteramos registros.

Poções personagem R$200/450/950/2.500, pet R$250/600/1.100/2.400/7.500, energético R$3.500. Cura e energia restaurada não mudam. Loja, revenda e autocura econômica de pet usam valor V2. Ofertas exclusivas dos três NPCs ajustadas à renda V2 (ressurreição R$9 mil, selo R$6 mil, óleo R$7,5 mil; fragmentos R$2,5–16 mil), mantendo limitações, karma e modificadores. Preço de oferta sem tarifa própria já vem do catálogo, sem descontar duas vezes.

Decisões candidatas de balanceamento, não valores aprovados individualmente; V1 mantém regras originais. Ainda falta testar compra e resgate reais na V2 isolada, verificar prêmios e preços de sistemas alternativos (cidade/mercado/recompensas de eventos) e confirmar impactos econômicos por simulação. Não há novo schema, worker, deploy, backup ou reset.
