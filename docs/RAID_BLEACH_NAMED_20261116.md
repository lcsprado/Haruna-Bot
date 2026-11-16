# Alpha Bot — Raid Bleach por nome (16/11/2026)

## Escopo

A primeira colaboração no novo modelo de comandos nominais é **Bleach**. A colaboração dos Sete Pecados continua na **Raid Lv.75** para evolução; ela não vira Bleach e não sofre resset de HP, maestria, EXP, inventários ou materiais.

- `!raid` — lista as Raids normais e, em seção separada, `!raid bleach`.
- `!raid bleach` — abre sala da Raid Aizen. Exige nível de jogador 70; sala expira em 15 minutos se não for iniciada.
- `!entrar bleach` — entra no grupo (até 5 participantes), incluindo entrada tardia nos termos do motor atual.
- `!go bleach` — somente o host inicia, em modo completamente automático. Pode iniciar solo.
- `!raid bleach` com sala aberta — mostra status e host.
- `!desistir bleach` / `!cancelarraide bleach` — fluxo original de saída/cancelamento.
- `!chaveraid bleach` — consulta/compra chave no fluxo já existente.
- `!raid 75`, `!raid pecados`, `!entrar 75`, `!go 75` e índices numéricos 1 a 11 — preservados.
- Não criar `!raidcollab`. `!raid naruto` fica apenas como possibilidade de extensão do registro; nenhuma Raid Naruto foi implementada.

### Configuração Bleach

Boss: Aizen — Hōgyoku. Chave exclusiva `chave_raid_bleach` de R$ 480.000; adquirida automaticamente ao abrir/entrar se o jogador tiver saldo e consumida apenas no início da luta, como nas outras Raids. HP base 1.350.000, ATK base 280, duração 40 minutos, 1 a 5 jogadores e escala de HP por participantes igual às Raids existentes. Usa pets, escudos, classes, habilidades, cura/consumíveis e XP do motor atual.

Fases, sem comandos ou HP adicional:
1. Kyōka Suigetsu: HP acima de 66%, ataque normal; especial Hipnose Absoluta.
2. Despertar do Hōgyoku: HP até 66%, +10% de ataque do Boss; especial Colapso Espiritual.
3. Transcendência de Aizen: HP até 33%, +20% de ataque do Boss; especial Ruptura do Reiatsu.

A mudança de fase é persistida em `trevo_games`, dentro do **mesmo** registro da sala `raid:76`. O ID 76 é exclusivamente técnico e não deve aparecer no comando público. Uma transição gera mensagem uma vez e o combate continua sozinho; não recria Boss, não restaura HP, nem duplica ranking ou recompensa.

### Recompensas

- Pool de dinheiro R$ 720.000, XP base total 29.000 e XP de pet 2.800, usando a distribuição **existente** por colaboração/dano.
- Novo fragmento `fragmento_reiatsu_bleach` — 8 por vitória elegível, até 48 por dia por jogador, mínimo 25.000 de dano e 2,5% de contribuição. Crédito transacional dentro da vitória com trava de registro por jogador/dia.
- Os fragmentos de Bleach não são `fragmento_ascensao_pecados_20261024`. A Raid 75 permanece com 10 fragmentos elegíveis e cap próprio de 60/dia.
- `!raidlote bleach` **não disponível** nesta versão: os pacotes têm regras e redutores próprios e exigem homologação separada. Bloqueado tanto no roteador WhatsApp quanto no início pelo worker. Nem `!raidlote 76` pode ser usado para contornar o bloqueio.

### Evidências

- GitHub Actions: https://github.com/lcsprado/Haruna-Bot/actions/runs/43887578713 (antes da trava explícita de Raidlote), 38 testes de regra/regressão aprovados, 1 não executado por condição, e 6 testes de integração aprovados.
- E2E com PostgreSQL 16 descartável `alpha_bleach_raid_e2e`: abertura de sala Bleach e sala 75 **simultaneamente**, host-only, compra de chaves separadas, 3 fases persistidas do Boss, pagamento de Reiatsu (incluindo limite parcial 47→48), finalização idempotente, inventários de Sete Pecados e sala 75 intactos.
- A CI não envia mensagens pelo WhatsApp, não executa deploy, não lê dados de produção. Serve para homologação interna.

### O que não está pronto

Esta entrega implementa a **Raid Bleach**, não o ecossistema completo de personagens da collab. A invocação de Ichigo, Kenpachi, Byakuya, Rukia, Urahara e Grimmjow, sua progressão, armas especiais e imagens na Web precisam ser implementadas e homologadas **antes de anunciar fragmentos como gastáveis**. Por ora, o Reiatsu é um material guardado, sem comando de troca — não prometer personagens obtidos.

Antes de liberar: homologar invocações/recompensas consumíveis e suas taxas; testar aviso de fase e recibo pelo WhatsApp de homologação; validar Render/Web existentes sem reverter a garagem/assets; conferir ausência de Raid/Boss ativos; manter o merge para a branch de autodeploy `whatsapp-only` pendente de autorização. Nenhum item/HP/EXP de jogador real foi alterado por este PR.
