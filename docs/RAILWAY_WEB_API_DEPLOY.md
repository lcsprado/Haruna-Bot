# Alpha Bot Web — Deploy separado (Railway + Vercel)

Preparacao tecnica (21/10/2026). Nenhuma etapa abaixo autoriza ativar plano pago, trocar o banco ou reiniciar o WhatsApp.

## Arquitetura
- Render: permanece com WhatsApp; nao implantar uma segunda instancia do cliente WhatsApp.
- Railway: API Node em processo isolado, sem Baileys/WhatsApp.
- Vercel: somente arquivos estaticos da pasta `web/`.
- Neon: estado compartilhado; **nao** criar um banco novo nem restaurar backups por cima do banco ativo.

## Railway — parametros de deploy
1. Confirmar que a conta esta no plano Free/Trial, sem upgrade de assinatura, e verificar consumo real de credito.
2. Criar um servico de aplicacao **sem banco adicional**, apontando para o repositorio `lcsprado/Haruna-Bot` e branch `infra/railway-web-api-20261021`.
3. Root Directory: raiz do repositorio.
4. Build: `npm ci` (mantendo patch postinstall existente).
5. Start Command: `node src/neon/render.js` (o modo normal do WhatsApp fica desligado pela variavel abaixo).
6. Definir secrets somente no painel privado do Railway, nunca em chat, documento ou Git:
   - `ALPHA_RUNTIME=web-api-only` (**obrigatorio**; sem isso ha risco de criar outra sessao de WhatsApp).
   - `DATABASE_URL`: mesma base ativa do jogo, apos confirmar a origem e os limites; usar secret separado com privilegios minimos sempre que possivel.
   - `WEB_ALLOWED_ORIGINS=https://alpha-web-rpg.vercel.app` (ou dominio Web definitivo).
   - `NODE_ENV=production`.
7. Nao copiar `PAIRING_NUMBER`, `SESSION_ID`, `ALPHA_QR_SECRET` ou arquivos de autenticacao WhatsApp para o Railway.
8. Healthcheck: `/health`, resposta esperada `{ "ok": true, "service": "alpha-web-api", "runtime": "web-api-only" }`. Esse teste confirma o processo HTTP, **nao** a conectividade com Neon.
9. Testar `/api/v1/health`. A validacao de autenticação e do banco deve ser feita sem estresse, uma vez, apos checagem do consumo.

## Vercel — conectar a API depois que o Railway fornecer dominio

O arquivo `web/app.js` usa o mesmo dominio do site como origem de `/api/v1/...`. Portanto, quando houver dominio Railway conhecido e funcional, incluir **antes** das demais regras em `web/vercel.json` um rewrite:

```json
{ "source": "/api/v1/:path*", "destination": "https://DOMINIO-REAL-DA-API/api/v1/:path*" }
```

**Nao** publicar `DOMINIO-REAL-DA-API` como placeholder: substituir apenas com endereco HTTPS confirmado, e testar a resposta via Vercel antes de promover para producao.

A Vercel tem o projeto `alpha-web-rpg`, com root esperado `web/`. Verificar as protecoes SSO antes de disponibilizar o jogo. Nao publicar codigo de sessao, tokens ou segredos em arquivos estaticos.

## Vinculo do jogador
O jogador envia `!web` no grupo WhatsApp, recebe um codigo unico e informa na tela Web.
`WEB_APP_URL` no servico do WhatsApp pode apontar para `https://alpha-web-rpg.vercel.app` **somente depois** de a interface e a API estarem acessiveis e validadas. A troca de codigo grava sessao no banco compartilhado.

## Economia de consultas
A atualizacao periodica geral do Web passou de 15 s para 60 s nesta branch (4x menos chamadas por sessao visivel); acoes continuam solicitando sincronizacao imediata. O Web deve ser testado para consumo de leituras/escritas do Neon antes de abrir para todos.

## Criterios de aceite / rollback
- WhatsApp continua respondendo no Render, sem novo pareamento.
- Railway `/health` responde; as rotas Web funcionam e nao iniciam WhatsApp.
- O jogador consegue autenticar sem reset de dados e consultar o proprio inventario/banco.
- Fluxos de escrita devem ser testados com perfil de teste e verificados no extrato/ledger.
- Sem exceder cotas gratuitas do Railway, Vercel ou Neon.
- Para rollback, remover o rewrite Web e desativar o servico Railway; nao apagar o banco nem alterar a branch `whatsapp-only`.

## Limitacao de custo
No plano Railway Free ha US$ 1/mes em credito de consumo (apos trial); processos 24/7 podem ultrapassar esse valor e ser interrompidos. A reativacao publica somente sera considerada viavel depois de medir o consumo real.
