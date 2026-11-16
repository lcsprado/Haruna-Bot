# PvP automático — homologação Web e transporte WhatsApp

Data: 16/11/2026. Escopo: PR #345. Status: **Web Chromium aprovada; transporte WhatsApp real não executado**.

## 1. Evidências verificadas

- PR: https://github.com/lcsprado/Haruna-Bot/pull/345
- Chromium e API reais em runner Linux, sem serviço externo: https://github.com/lcsprado/Haruna-Bot/actions/runs/43876398093
- Teste `test/pvp-auto-web-browser-staging-20261116.test.mjs`: servidor HTTP local com interface real `web/index.html` e `web/app.js`; `handleWebApi` real; Postgres 16 `alpha_pvp_web_stage` exclusivo do CI; cadastro de usuário sintético e senha, tentativa inválida, autenticação válida, sessão privada, logout e rejeição após logout.
- Regressão da operação Web/WhatsApp sem número real: `test/pvp-auto-real-battle-e2e-20261116.test.mjs`: comando de `!batalhar` extraído do roteador, ação automática no `battle()` real e banco descartável, relatório e uma só recompensa; configurações de `!estrategia` pelo mesmo roteador com `reply()` simulado.
- `!estrategia` passou a integrar `RPG_CMDS`, respeitando o bloqueio de RPG por grupo.

## 2. Não usar o preview Vercel como staging da API

O arquivo `web/vercel.json` atual possui regras para:
- `/api/v1/:path*` → `https://alpha-bot-whatsapp-m3lc.onrender.com/api/v1/:path*`
- `/api/v1/me/clan-siege/:path*` → `https://alpha-web-api-beta.onrender.com/api/v1/me/clan-siege/:path*`

A primeira regra usa serviço ativo, portanto uma prévia Vercel sem sobrescrever essas regras **não é ambiente isolado**. Em 16/11, não havia deploy Vercel da branch `feat/pvp-auto-strategy-20261115`. Não foi criado deployment público para esta homologação.

## 3. Transporte WhatsApp: bloqueio operacional antes de teste real

Para validar mensagem entregue em um aparelho pelo Baileys é indispensável:
1. Instância separada de WhatsApp **com número de teste** e sessão/estado de autenticação próprios. **Nunca** conectar o telefone oficial do bot numa segunda instância, usar credenciais de produção ou cadastrar sessão em Render real.
2. Serviço de staging isolado apontado a banco exclusivo de homologação, sem jobs de Raid, Boss, leilão, cobrança e sem anúncios de grupo real.
3. Grupo WhatsApp de teste contendo dois números consentidos; allowlist explícita de JIDs, com rejeição de todos os demais.
4. Teste com um smartphone Android e outro cliente (celular/desktop) para confirmar recebimento efetivo, inclusive mensagens privadas, e histórico livre de “Aguardando mensagem”.
5. `!estrategia adaptativa`, `!estrategia defensiva`, `!estrategia status` → resposta recebida e postura guardada por personagem correto.
6. `!batalhar @oponente` → uma única mensagem de batalha e relatório, 1 vitória, 1 derrota, 1 transação, XP/HP conforme motor e cooldown impedindo repetição. Rodar com ambos os celulares conectados e depois com um desconectado para validar entrega.
7. Validar `!web` numa conta de teste para login com senha e isolamento de acesso, sem dados de jogadores reais.
8. Checar atividade de Raid/Boss, testes de regressão e aprovação antes de considerar release.

**Ainda não é possível atestar itens 1–7 de transporte real:** não há autorização/identificação confirmada de um ambiente Render de homologação e de um WhatsApp separado para essa sessão. O connector Render exige a escolha explícita de workspace; nenhum foi selecionado por esta execução. Não foram enviados WhatsApps reais.

## 4. Estado de publicação

- PR #345 permanece DRAFT; código não mesclado em `whatsapp-only`.
- Feature flag `ALPHA_PVP_AUTO_STRATEGY_ENABLED` continua OFF por padrão.
- SQL `migrations/20261115_pvp_auto_strategy_NOT_APPLY.sql` não foi aplicado à produção.
- Não houve disparo de deploy Render/Vercel, envio de mensagens, alteração de HP/XP, dinheiro ou itens de jogadores reais.
