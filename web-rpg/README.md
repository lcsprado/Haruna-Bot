# Alpha RPG Web

Protótipo web 2D independente inspirado nas regras do Alpha Bot.

## Isolamento

- Deploy Vercel próprio: `alpha-web-rpg`.
- Código concentrado em `web-rpg/`.
- O bot de WhatsApp em produção não é importado nem executado por este app.
- Nesta fase os dados do jogador ficam em `localStorage` do navegador.
- Nenhuma escrita é feita no banco Neon do WhatsApp.

## Escopo atual

- Perfil RPG: nível, EXP, HP, ATK, DEF, SPD e crítico.
- Raid níveis 10/15/20/25/30/40/50.
- Catálogo de Raid alinhado ao Alpha Bot: nomes, HP, ATK, preço das chaves e duração.
- Chave consumida ao iniciar o combate.
- Boss de evento com ataque com pet ou sem pet.
- Pet gasta energia, recebe dano e usa autocura preventiva abaixo de 35% quando há poção.
- Reserva entra quando o principal fica indisponível.
- Duelo e Duelo Pet.
- Time Pet com Principal, Suporte e Reserva.
- Inventário com equipar, upgrade e drag-and-drop para slots.
- Negócios e coleta com TAXADE.
- Trabalho, Uber e Ifood.
- Banco: depósito e saque.
- Mercado.
- Missões.
- Estado persistido localmente para facilitar testes.

## Próxima fase

O passo seguinte é retirar o estado do navegador e criar backend/banco próprios para o jogo web. A API deverá preservar IDs e regras compatíveis com as mecânicas do Alpha Bot, mas sem depender do processo do WhatsApp nem de seu banco de produção.
