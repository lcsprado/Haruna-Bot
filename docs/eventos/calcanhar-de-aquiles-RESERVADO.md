# EVENTO RESERVADO — CALCANHAR DE AQUILES

Status: PLANEJADO / BLOQUEADO. Não ativar por deploy, agenda, migração ou inicialização.
Gatilho exclusivo: ordem explícita do proprietário após alta hospitalar de JP.
Nenhuma mensagem automática, teaser, anúncio ou spawn antes da autorização.

## Homenagem
Evento comemorativo de recuperação do JP. Tema mitológico: Calcanhar de Aquiles.
Boss: Carrasco de Aquiles.
Participantes: número livre, inclusive solo; quatro jogadores NÃO são obrigatórios. Uma única instância de boss e ranking por dano; sem duplicação entre grupos.

## Recompensas
1º lugar: 1 unidade garantida de Botas do JP — Passos de uma Lenda (Evento Único), XP e dinheiro.
Demais participantes elegíveis (sem limite de colocação): Insígnia exclusiva "Nem a Cirurgia Derrubou a Lenda", XP e dinheiro.
Elegibilidade para insígnia: dano individual mínimo de 25.000 no boss; quem ficar abaixo recebe XP/dinheiro conforme contribuição, mas não recebe insígnia.
O 1º lugar recebe a bota garantida; também pode receber a insígnia se atingir o mínimo de 25.000 de dano.
XP e dinheiro proporcionais à contribuição, dentro dos limites vigentes da economia do RPG.
Não criar duplicatas da bota; não incluir a bota em caixas, raids comuns, altar ou lojas.
Não permitir farming por múltiplos grupos ou dupla premiação.

## Regras a validar antes de implementar
- Definir HP/ATK do boss com base no nível dos participantes no dia, sem exigir quatro jogadores.
- Definir atributos da bota comparando com as botas existentes e evitar power creep.
- Validar mínimo proposto de 25.000 de dano para insígnia conforme HP final do boss, com regras de desempate; permitir número variável de jogadores.
- Garantir idempotência do encerramento e distribuição das recompensas.
- Exigir comando de liberação explícito do proprietário, com autorização persistida; default desativado.
- Testar em ambiente isolado antes de publicar; sem alteração de economia global.
- O evento não está implementado no runtime por este arquivo: isto é apenas uma especificação de produção segura.
