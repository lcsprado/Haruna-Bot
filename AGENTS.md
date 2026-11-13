# AGENTS.md — Alpha Bot (fonte de verdade para alterações)

## Branch e ambiente oficial
- A única branch do jogo **em produção** é `whatsapp-only`. Baseie todas as correções futuras no HEAD dessa branch e confirme o commit publicado no Render e na Vercel antes de editar.
- **Nunca** use `master`, branches `feat/*`, `fix/*`, histórico de deployments ou o branch da API beta como base de uma nova versão do jogo. `master` ainda pode ser o default histórico do GitHub e **não** é o jogo atual.
- Repositório: `lcsprado/Haruna-Bot`.
- Web jogável: projeto Vercel `alpha-web-rpg`, URL `https://alpha-web-rpg.vercel.app/rpg`. Diretório `web/`.
- Bot e API de conta: Render Doido15, serviço `alpha-bot-whatsapp`, `https://alpha-bot-whatsapp-m3lc.onrender.com`, branch `whatsapp-only`, entrypoint `src/neon/render-whatsapp.js`, deploy automático desligado.
- O site `https://alphabot.lcsprado.com.br` usa outro projeto Vercel (`alphabot-rpg-oficial`) para divulgação. NÃO substitua o projeto de divulgação pelo Web RPG sem pedido explícito.
- Cerco V5/V6: motor ainda está no Render Lcsprado4 `alpha-web-api-beta`, branch `feat/web-aiven-beta-protegido-20261021`. O `web/vercel.json` encaminha APENAS `/api/v1/me/clan-siege` e seus comandos para esse motor; as demais rotas usam o backend principal. É uma dependência ativa, não um ambiente obsoleto a apagar. Planeje migração do motor antes de desativá-lo.

## Proteção contra regressão
- Preserve `web/app.js`, `web/styles.css`, `web/racing-ui.js`, `web/clan-siege-ui.js`, `web/version.json`, `web/sw.js` e o catálogo completo de imagens da Garagem.
- Não substitua a Web rica por versões antigas/menores, nem remova garagem, oficina/corridas/pinturas, NPCs, eventos, Boss/Raid, leilão, personagens, pets, inventário, Clã e Cerco ao Castelo.
- Cerco deve preservar V5 e V6, Castelo/Portão/Depósito, ações secretas, reabastecimento, fortaleza, regras de versão, rodízio e permissões de participação; nunca habilite regras V6 de forma implícita.
- Login novo: telefone brasileiro com DDD + senha, vinculado ao JID já verificado pelo código privado `!web`. Um cadastro não pode assumir identidade informando livremente o telefone. Migração e recuperação preservam a identidade e os itens do jogador. Login legado permanece tolerado apenas no backend durante transição.
- Não ative duas conexões WhatsApp; o serviço alternativo `summoner 7` é redundante. Não rode migrações destrutivas, compensações, restaurações históricas, eventos, compras ou transferências apenas para testar.

## Checklist obrigatório antes de publicar
1. Confirmar HEAD atual de `whatsapp-only` e deployments vivos de Render/Vercel.
2. Criar branch *a partir desse HEAD*, nunca do default `master`.
3. Validar sintaxe e testes: `node --test test/web-password-auth.test.mjs test/web-password-accounts-isolation.test.mjs test/web-rich-ui-preservation.test.mjs`; mais suites pertinentes a garagem, cerco e API, sem gravar em produção.
4. Validar `web/vercel.json` e conexão ao motor Cerco, inclusive exigência do header `x-alpha-web-version`; diferenciar testes de UI de testes reais autenticados.
5. Construir preview Vercel, abrir `/rpg`, conferir formulário e existência dos módulos JS; não validar transações com conta real sem autorização.
6. Para mudanças no backend, preservar compatibilidade com a Web atual, publicar Render (deploy manual), verificar logs/saúde ANTES de promover a nova UI.
7. Publicar somente `alpha-web-rpg` em produção, a partir de `whatsapp-only`, conferir SHA, alias público e versão PWA/cache; manter rollback claro.
8. Deletar branches temporárias somente após merge + verificação e nunca apagar o backend Cerco em uso. Não mudar domínio de divulgação.

## Falhas conhecidas de governança
- O GitHub estava com `master` como default em 13/11/2026, embora a produção use `whatsapp-only`. Necessário ajustar **Settings → Branches → Default branch** para `whatsapp-only` com conta administradora; mudança de código não substitui esse ajuste.
- Não declare uma atualização '100% homologada' só porque os testes estáticos passaram. Use status exato (PR/preview/READY/Render live) e informe se o Cerco autenticado foi testado por um jogador.
