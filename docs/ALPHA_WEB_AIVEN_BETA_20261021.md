# Alpha RPG Web — retomada segura com Aiven de produção

**Estado em 21/10/2026:** código de beta isolado validado em teste **somente leitura**; **NÃO publicado para jogadores**, sem alterações em Render/WhatsApp.

## Fontes de verdade e limites
- WhatsApp PRODUÇÃO: Render `alpha-bot-whatsapp`, branch `whatsapp-only`. **Não alterar** para servir Web; esta branch de Web é independente.
- Banco de produção: Aiven PostgreSQL `lcsh-3393 / alphabot / alpha_prod_v2`, 67 tabelas. `Neon` é backup histórico, não operar gameplay nele.
- Aiven Free: até **20 conexões simultâneas** na instância, compartilhadas por todos os bancos.
- WhatsApp Aiven usa pool configurado em 5 + uma conexão direta para trava de instância.
- A API Web `ALPHA_RUNTIME=web-api-only` usa pool **máximo 3** (limite rígido), **não importa o cliente WhatsApp**, nem hospeda arquivos visuais.
- Imagens, HTML, CSS, JS, PWA: **Vercel** projeto `alpha-web-rpg`, raiz `web/`. Imagens/assets ficam no Vercel, não no Render.
- O deploy de `master` no Vercel falha porque essa branch não tem pasta `web`; os **previews desta branch** estão `READY`. **Não alterar a branch de produção do Vercel** até ter API testada.
- Backend API isolado: instalar em um host independente do Render WhatsApp (por exemplo, Railway com orçamento/limites aprovados); **não subir um segundo Render Free no mesmo workspace sem confirmar a cota de 750 h compartilhada**.

## O que foi implementado nesta branch
1. `src/neon/render.js`: quando `ALPHA_RUNTIME=web-api-only` retorna `/health` e API sem iniciar WhatsApp nem servir mídia.
2. `src/neon/db.js`: reutiliza TLS validado pela CA do Aiven, sem `rejectUnauthorized:false`; no runtime Web o pool é 1–3.
3. `src/neon/web-api.js`: beta fechado via `ALPHA_WEB_BETA_JIDS` (lista vazia = ninguém entra); token validado a cada leitura, porém atualização de sessão persistida no máximo a cada 5 minutos. Autoteste de autenticação exige flag explícita + loopback.
4. `/api/v1/me/boss-live`: consulta específica dos dados do Boss, sem recarregar inventários e carteira.
5. `web/app.js`: a cada 120 s sincroniza o perfil quando a aba está visível. Boss/Raid consulta status leve a cada 25 s, somente na tela correspondente. Ações manuais e botão de sincronizar atualizam imediatamente. Atualização de contadores locais não faz requisições.
6. Assets e estilos mantidos: **nenhuma imagem do Work removida ou alterada**.

## Auditoria concluída
Workflow de teste: `.github/workflows/alpha-web-aiven-beta-readonly.yml`.
- Branch de teste isolada; conexão aponta para Aiven `alpha_prod_v2` usando secret `ALPHA_AIVEN_URI` e PEM `ALPHA_AIVEN_CA` do GitHub.
- `PGOPTIONS=-c default_transaction_read_only=on`; não cria tabelas/sessões nem modifica economia.
- `ALPHA_WEB_BETA_JIDS` vazio; nenhuma conta é liberada.
- `/health`: runtime `web-api-only` confirmado; `/api/v1/health` e `/api/v1/catalog`: 200; `/api/v1/me/bootstrap`: 401; `/api/v1/health/auth`: 404; `/rpg`: 404; origem externa CORS: 403.
- Não houve segundo cliente WhatsApp.
- Não foram testados login real, ações de economia ou carga concorrente; tais testes ainda são condições de liberação.

## Passos de implantação — NÃO executar até aprovar host e orçamento
1. Escolher um host para API separado da instância WhatsApp. Confirmar custo e limite de uso. Para Railway, deploy da branch `feat/web-aiven-beta-protegido-20261021`, raiz do repositório, build `npm install`, start **`node scripts/start-web-api.mjs`**.
2. Configurar **somente no painel do host**: `ALPHA_RUNTIME=web-api-only`, `DATABASE_URL` apontando para banco **alpha_prod_v2** no Aiven, `ALPHA_AIVEN_CA_PEM` PEM válido, `ALPHA_WEB_DB_POOL_MAX=3`, `ALPHA_WEB_BETA_JIDS` vazio inicialmente, `WEB_ALLOWED_ORIGINS=https://alpha-web-rpg.vercel.app` e `NODE_ENV=production`. **Obrigatório:** `WEB_MEMBER_TOKEN_SECRET` aleatório com pelo menos 32 caracteres. O entrypoint recusa inicialização sem ele.
3. **Não** copiar para a API `SESSION_ID`, `PAIRING_NUMBER`, `OWNER_NUMBER`, `ALPHA_QR_SECRET` ou chaves de WhatsApp. O novo entrypoint `scripts/start-web-api.mjs` recusa explicitamente `SESSION_ID`, `PAIRING_NUMBER` ou `ALPHA_QR_SECRET`, bancos diferentes de `alpha_prod_v2`, certificado ausente, origem não-HTTPS e pool > 3.
4. Validar `/health` e `/api/v1/health`, status 401 anônimo, 404 para autoteste, 403 para CORS externo; verificar CPU, logs, HTTP 5xx, banda e conexões SQL.
5. Com host API HTTPS real confirmado, inserir no `web/vercel.json` **antes** das outras regras o rewrite `/api/v1/:path*` → `https://HOST_REAL_DA_API/api/v1/:path*`. Jamais publicar placeholder; testar exclusivamente **preview Vercel**.
6. Antes de beta real, restringir `ALPHA_WEB_BETA_JIDS` ao jogador piloto. Verificar no mesmo Aiven os códigos `!web` e login de uso único, sem criar saldo fictício. Conferir leitura de inventário, negócios e pets sem alterações.
7. Testar ações autorizadas com controle de extrato/ledger, monitoração e reversão. Começar 1 jogador, depois até 4 com consumo medido. Só então ajustar branch/domínio de produção do Vercel e `WEB_APP_URL` no WhatsApp.
8. Garantir que imagens pesadas permaneçam no Vercel com cache e carregamento sob demanda, sem chamadas de assets no Render.

## Interrupção / rollback
- **Emergência:** interromper somente o serviço API isolado ou esvaziar `ALPHA_WEB_BETA_JIDS`, sem suspender Render do WhatsApp.
- Se API exceder limite, voltar ao modo WhatsApp-only no mesmo Aiven; não restaurar cópias anteriores do banco depois de transações reais.
- Indicadores de bloqueio: queda de WhatsApp, erros 5xx, latência elevada, pool do banco saturado, banda Render acima de margem aceita, resposta incorreta em autenticação ou economia.
- **Não fazer merge deste draft nem promover domínio público apenas porque os testes READ ONLY passaram.**

## Segurança
Senhas de Neon e Aiven foram compartilhadas anteriormente no chat; planejar rotacionar as duas com proteção de rollback, sem colocar segredos no Git ou mensagem.
