// A opção numérica de um menu privado tem prioridade sobre o "continuar quiz"
// compartilhado pelo grupo. Sem isso, "1" pode iniciar outro quiz em vez de abrir
// uma Caixa Lendária do jogador.
export function shouldRouteQuizContinuation({body,hasPlayerMenu,quizPending,prefix='!'}) {
  const answer=String(body||'')
  return !answer.startsWith(prefix) &&
    (answer==='1'||answer==='2') &&
    Boolean(quizPending) &&
    !Boolean(hasPlayerMenu)
}
