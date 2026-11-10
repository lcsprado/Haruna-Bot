import {applyVitalCombatHp} from './vital-pets.js'

// O HP Vital é projeção temporária. Boss Web e WhatsApp usam o mesmo
// snapshot de participante (versão 3), sem reaplicar bônus a cada ataque.
// Nenhum valor é persistido diretamente em stats.hp.
export function projectBossVitalCombatHp({
  baseHp=0,baseMaxHp=1,petHpRate=0,teamHpRate=0,
  heroId=null,prior={},storedHp=null,heroBaseMaxHp=null,persistentMaxHp=null
}={}){
  const projection=applyVitalCombatHp(baseHp,baseMaxHp,petHpRate,teamHpRate)
  const oldMax=Number(prior?.vitalCombatMaxHp)
  const priorHp=Number(prior?.heroLastHp)
  const reuse=Boolean(heroId)&&Number(prior?.heroHpProjectionVersion)===3&&
    prior?.heroLastHp!=null&&Number.isFinite(priorHp)&&
    Number.isFinite(oldMax)&&oldMax>0&&
    Number(prior?.heroStoredHp)===Number(storedHp)&&
    Number(prior?.heroCombatMaxHp)===Number(heroBaseMaxHp)&&
    Number(prior?.heroPersistentMaxHp)===Number(persistentMaxHp)
  if(!reuse)return {...projection,reused:false,reprojected:false}
  const bounded=Math.max(0,Math.min(oldMax,priorHp))
  const hp=oldMax===projection.maxHp
    ?bounded
    :Math.max(0,Math.min(projection.maxHp,Math.round(bounded*projection.maxHp/oldMax)))
  return {...projection,hp,reused:oldMax===projection.maxHp,reprojected:oldMax!==projection.maxHp}
}
