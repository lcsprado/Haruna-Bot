// Bônus de renda V2.1: somente atividades manuais selecionadas.
export function levelIncomeBonusPercent(level){
  const n=Number(level)
  if(!Number.isSafeInteger(n)||n<1)throw new RangeError('Nível inválido')
  return n>=200?80:n>=150?65:n>=120?50:n>=90?35:n>=60?20:n>=30?10:0
}
export function levelIncomeGross(base,level){
  if(!Number.isSafeInteger(base)||base<0)throw new RangeError('Renda inválida')
  const gross=Math.round(base*(100+levelIncomeBonusPercent(level))/100)
  if(!Number.isSafeInteger(gross))throw new RangeError('Renda fora da precisão suportada')
  return gross
}
