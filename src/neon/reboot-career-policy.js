// Salários profissionais do Alpha Bot 2.0: somente classes_only.
// Nenhuma escrita em banco e nenhuma alteração da rotina salarial V1.
import {careerGrossFromLevelCap} from './career-pay.js';
import {rebootEconomyEnabled} from './reboot-economy-policy.js';
export const V2_CAREER_PAY=Object.freeze({
  levelBands:Object.freeze([[20,1400],[50,1900],[100,2600],[150,3400],
    [200,4300],[250,5500],[Infinity,7000]].map(([max,base])=>Object.freeze({max,base}))),
  roleGrowth:.45,performanceLimit:1.15,minimumPerformance:.85,
  minCareerXp:20,maxCareerXp:30,cooldownMinutes:30
});
export function v2CareerRoleFactor(mult){
  const n=Number(mult);
  if(!Number.isFinite(n)||n<1||n>4)throw new RangeError('Fator profissional inválido');
  return 1+(n-1)*V2_CAREER_PAY.roleGrowth;
}
export function v2CareerBase(level){
  if(!Number.isSafeInteger(level)||level<1)throw new RangeError('Nível de jogador inválido');
  const row=V2_CAREER_PAY.levelBands.find(x=>level<=x.max);
  return row.base;
}
export function v2CareerGross(level,mult,performance=1){
  const factor=Number(performance);
  if(!Number.isFinite(factor)||factor<=0)throw new RangeError('Desempenho inválido');
  const capped=Math.max(V2_CAREER_PAY.minimumPerformance,Math.min(V2_CAREER_PAY.performanceLimit,factor));
  return Math.max(1,Math.round(v2CareerBase(level)*v2CareerRoleFactor(mult)*capped));
}
export function careerWorkGross({level,legacyPayCap,careerMultiplier,performanceFactor=1,eventMoneyMultiplier=1,
  enabled=rebootEconomyEnabled()}={}){
  if(enabled)return v2CareerGross(level,careerMultiplier,performanceFactor);
  return careerGrossFromLevelCap(legacyPayCap,careerMultiplier,{performanceFactor,eventMoneyMultiplier});
}
export function careerWorkXp(randomNumber,{enabled=rebootEconomyEnabled(),legacyXpMultiplier=1}={}){
  const random=Number(randomNumber);
  if(!Number.isFinite(random)||random<0||random>=1)throw new RangeError('Sorteio inválido');
  if(enabled)return V2_CAREER_PAY.minCareerXp+
    Math.floor(random*(V2_CAREER_PAY.maxCareerXp-V2_CAREER_PAY.minCareerXp+1));
  return Math.round((25+Math.floor(random*16))*legacyXpMultiplier);
}
