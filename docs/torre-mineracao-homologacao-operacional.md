# Torre Infinita — Mineração 4h: homologação funcional isolada

Status: **IMPLEMENTADO NA BRANCH DE TESTE**, NÃO IMPLANTADO. PR #421 em rascunho. Nenhuma migração realizada no `alpha_prod_v2` nem deploy no serviço Render de produção.

## Proteção de ambiente

- A importação dos módulos de mineração não cria tabela nem concede itens.
- O controlador somente é ligado quando TODAS as condições forem verdadeiras:
  - `ALPHA_MINING_MODE=homologation`
  - `ALPHA_MINING_DB_CONFIRMED=test-only`
  - `DATABASE_URL` aponta para banco cujo nome começa por `alpha_test` ou `alpha_homolog` (ex.: `alpha_homolog_mining`).
- Banco `alpha_prod_v2` é expressamente rejeitado. Não há flag para ativar diretamente nesse banco.
- O bootstrap em homologação prepara estruturas de Raidlote e só então cria as tabelas `mining_pickaxes`, `mining_expeditions` e `mining_action_receipts`.
- Não criar/alterar serviço ou banco em nuvem para testar sem a aprovação específica do proprietário.

## Comandos do WhatsApp (somente quando a homologação estiver habilitada)

| Comando | Ação |
|---|---|
| `!picaretas` | Loja, chances, picaretas possuídas e resistência |
| `!comprarpicareta madeira` | Compra uma picareta vendida em loja; também aceita `ferro` e `aco` |
| `!repararpicareta madeira` | Restaura toda a resistência faltante; pagamento proporcional, apenas saldo da carteira |
| `!minerar` ou `!minerar status` | Consulta a expedição e comandos |
| `!minerar iniciar madeira` | Consome 1 uso e inicia uma expedição de 4 horas |
| `!minerar resgatar` | Resgata **uma única vez** R$ 800, XP base 250 e chance de 1 pedra |
| `!minerar cancelar` | Interrompe antes de completar 4h; não devolve o uso nem concede prêmios |

- Tempo, resistência e status são persistidos no PostgreSQL; reinício do bot não zera o contador.
- Regras vigentes: Madeira 4 usos/3%/R$2.000/R$1.200; Ferro 5 usos/6%/R$7.500/R$3.000; Aço 6 usos/10%/R$20.000/R$6.000; Ouro 7 usos/12% (Cerco/R$10.000 reparo); Diamante 8 usos/15% (Evento inaugural/R$15.000 reparo).
- Pedra encontrada usa somente as cinco IDs já existentes e respeita o limite dos equipamentos, que não foi alterado.
- Dinheiro base é R$ 800 por conclusão; o XP base de 250 passa pelo motor global de XP, de modo que o valor efetivamente creditado pode refletir regras globais. A mensagem de resgate exibe o XP efetivo.
- O valor `ore` do protótipo é apenas simulação e **não é creditado**, vendido nem gera item no inventário.

## Economia e idempotência

- Compras debitam **somente dinheiro na carteira**; saque bancário é operação separada. Não muda o saldo de banco.
- Cada mensagem de compra, reparo e início recebe chave persistente derivada do ID da mensagem WhatsApp; reprocessamentos não cobram novamente.
- Resgate usa `FOR UPDATE` na expedição, transação atômica e estado `claimed`; não há segundo crédito de carteira, XP ou pedra.
- Reparo de picareta já cheia é idempotente e gratuito, inclusive após repetição da mensagem.
- As picaretas de Ouro e Diamante não podem ser compradas; a função interna `grantMiningPickaxeReward` exige origem `cerco` ou `evento_inaugural` correta e evita premiação duplicada. **Não está conectada a evento agendado nem ao Cerco de produção**, pois critérios de vitória ainda estão pendentes.

## Exclusão de atividades

- Uma mineração só inicia após consultar sono, Carpinar, Raidlote e Raid manual em aberto.
- A ativação de Dormir, Carpinar e Raidlote consulta reciprocamente a mineração ativa.
- Todos os inícios usam o mesmo advisory lock PostgreSQL do Raidlote (`raid-membership:<jid>`), impedindo corridas entre grupos.
- Enquanto minera, o roteamento WhatsApp bloqueia comandos de ação; permite `!minerar`, `!picaretas` e consultas básicas, incluindo `!coletar` renda de negócios.
- Expedientes vencidos não bloqueiam ações depois de 4h, mas exigem `!minerar resgatar` antes de iniciar outra mineração.
- Não foi feita mudança de proteção de PvP contra ataques/roubos: requisito necessita definição separada.

## Evidências e próximos testes obrigatórios

- Sintaxe dos sete arquivos JS relevantes validada no parser V8 do ambiente de desenvolvimento.
- 12 cenários do módulo de política de mineração passaram em executor JS isolado.
- Simulação transacional em memória: compra, repetição da compra, início, repetição do início, proibição de sessão simultânea, resgate antecipado, resgate único, reparo e repetição do reparo, bloqueio do Raidlote e leitura da posse.
- Simulação isolada do resgate: R$ 800, 250 XP, uma pedra; repetição retorna `none` sem duplicar.
- Simulação da entrega exclusiva: `ouro` via Cerco entrega uma vez; repetição e origem errada são rejeitadas.
- Testes automatizados no repositório: `test/torre-mineracao-4h.test.mjs` e `test/torre-mineracao-store-homolog.test.mjs`.
- **Ainda NÃO testado**: migração e restrições em PostgreSQL de TESTE real, fluxo do WhatsApp com usuário real, envio/recebimento de mensagens após reconexão, falha no meio de transação e corrida real de sessões.
- Homologar em banco e serviço isolados antes de considerar merge e publicação. **Não confundir os testes simulados com homologação ponta a ponta.**

## Checklist para homologação E2E futura

1. Criar/habilitar ambiente de TESTE apenas mediante autorização; conferir URL do banco, flags, migrations e conexão.
2. Comprar Madeira com saldo suficiente/insuficiente; tentar repetir a mensagem e mudar ID sob mesma chave.
3. Iniciar, consultar restante, bloquear Dormir/Carpinar/Raidlote; testar simultaneidade em dois grupos.
4. Aguardar quatro horas reais ou simular tempo exclusivamente no banco de teste; resgatar duas vezes e auditar carteira, XP, pedra e `transactions`.
5. Consumir toda a durabilidade e reparar parcialmente e integralmente, validar valores por picareta.
6. Cancelar antes do fim; conferir consumo de uso, ausência de prêmio e liberação das outras atividades.
7. Conceder Ouro/Diamante pela rotina interna com chave de evento e verificar bloqueio de venda.
8. Reiniciar serviço de homologação durante mineração e confirmar persistência/reconciliação.
9. Somente após revisão e aprovação formal considerar um plano separado para a produção.
