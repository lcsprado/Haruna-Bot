// Opções da venda unitária: nunca apresentar quantidades impossíveis.
// A opção 4 é restrita ao modelo selecionado; T abre a lista para vendas em lote.
export function sellQuantityOptions(available){
  const n=Math.max(0,Math.trunc(Number(available)||0))
  if(!n)return ''
  return [
    '1️⃣ Vender 1',
    ...(n>=5?['2️⃣ Vender 5']:[]),
    ...(n>=10?['3️⃣ Vender 10']:[]),
    '4️⃣ Vender todas as '+n+' unidade(s) vendáveis *deste item*',
    ...(n>1?['5️⃣ Escolher quantidade']:[]),
    '',
    'T️⃣ Ir para venda em massa (lista completa)',
    '9️⃣ Voltar à lista',
    '0️⃣ Sair'
  ].join('\n')
}
