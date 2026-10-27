/**
 * Calcula o pagamento de !trabalhar de forma retrocompatível:
 * - o teto por nível continua sendo o salário NORMAL de cargos até Gerente;
 * - Diretor (3,0x) e CEO (4,0x) recebem aumento proporcional ao Gerente (2,4x);
 * - o bônus de desempenho e eventos é aplicado depois da base do cargo,
 *   sem ser anulado por um teto fixo de R$ 15.000.
 * Nenhum crédito retroativo é gerado por esta função.
 */
export function careerGrossFromLevelCap(levelPayCap,careerMultiplier,{performanceFactor=1,eventMoneyMultiplier=1}={}){
  const payCap=Number(levelPayCap)
  const multiplier=Number(careerMultiplier)
  const performance=Number(performanceFactor)
  const event=Number(eventMoneyMultiplier)
  if(!Number.isFinite(payCap)||payCap<1||!Number.isFinite(multiplier)||multiplier<1
    ||!Number.isFinite(performance)||performance<=0||!Number.isFinite(event)||event<1){
    throw new Error('Parâmetros inválidos para salário profissional.')
  }
  const careerFactor=Math.max(1,multiplier/2.4)
  const roleBase=Math.round(payCap*careerFactor)
  return Math.max(1,Math.round(roleBase*performance*event))
}
