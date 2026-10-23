// Teto de PIX do RPG — por jogador remetente, em reais fictícios.
export const PIX_LIMIT_PER_TRANSFER=5_000_000
export const PIX_LIMIT_PER_DAY=10_000_000

const money=n=>Number(n).toLocaleString('pt-BR')

export function checkPixLimits(amount,sentToday=0){
  if(!Number.isSafeInteger(amount)||amount<=0) throw new Error('Valor de PIX inválido.')
  if(amount>PIX_LIMIT_PER_TRANSFER){
    throw new Error('Limite por PIX: R$ '+money(PIX_LIMIT_PER_TRANSFER)+'. Limite diário: R$ '+money(PIX_LIMIT_PER_DAY)+'.')
  }
  if(!Number.isSafeInteger(sentToday)||sentToday<0) throw new Error('Não foi possível verificar o limite diário do PIX.')
  const remaining=Math.max(0,PIX_LIMIT_PER_DAY-sentToday)
  if(amount>remaining){
    throw new Error('Limite diário de PIX: R$ '+money(PIX_LIMIT_PER_DAY)+'. Você já enviou R$ '+money(sentToday)+' hoje. Disponível: R$ '+money(remaining)+'. O limite reinicia às 00h (Brasília).')
  }
  return {remaining:remaining-amount}
}
