// Apenas apresentação. Os percentuais vêm dos cálculos de cada modo de combate.
const n=value=>Number.isFinite(Number(value))?Number(value):0
const fmt=value=>n(value).toLocaleString('pt-BR',{maximumFractionDigits:1})
const positive=value=>n(value)>0.000000001
const same=(a,b)=>Math.abs(n(a)-n(b))<1e-9

export function formatProfileCombatBonuses({
  raidDamagePct=0,bossDamagePct=0,
  raidCritPct=0,bossCritPct=0,pvpCritPct=0,
  petDamagePct=0,petPvp=null,petSpeed=0,teamSpeed=0,
  enchantParts=[],hasEnchantedDamage=false,reserveActive=false,
  petStatus=null,recoveredRaidDamagePct=0,recoveredBossDamagePct=0,
  classEffect=''
}={}){
  const rows=['⚔️ *BÔNUS DE COMBATE*']
  if(same(raidDamagePct,bossDamagePct)){
    rows.push('💥 Dano Boss/Raid: *+'+fmt(raidDamagePct)+'%*')
  }else{
    rows.push('💥 Dano Boss: *+'+fmt(bossDamagePct)+'%*')
    rows.push('💥 Dano Raid: *+'+fmt(raidDamagePct)+'%*')
  }
  rows.push('🎯 CRIT: PvP *'+fmt(pvpCritPct)+'%* • Boss *'+fmt(bossCritPct)+'%* • Raid *'+fmt(raidCritPct)+'%*')

  if(positive(petDamagePct)){
    rows.push('🐾 Pets no Boss/Raid: *+'+fmt(petDamagePct)+'% dano* (já incluído acima)')
  }
  const pvp=[]
  if(positive(petPvp?.damage))pvp.push('💥 +'+fmt(n(petPvp.damage)*100)+'% dano')
  if(positive(petPvp?.defense))pvp.push('🛡️ -'+fmt(n(petPvp.defense)*100)+'% recebido')
  if(positive(petPvp?.dodge))pvp.push('🌀 '+fmt(n(petPvp.dodge)*100)+'% esquiva')
  if(positive(petPvp?.healPct)&&positive(petPvp?.healCooldown)){
    pvp.push('💚 '+fmt(n(petPvp.healPct)*100)+'% HP a cada '+Math.floor(n(petPvp.healCooldown))+' ataques (abaixo de 70% HP; até 3 vezes)')
  }
  if(pvp.length)rows.push('🐾 Pet no PvP: '+pvp.join(' • '))

  if(enchantParts.length){
    rows.push('✨ Encantamentos: '+enchantParts.join(' • ')+(hasEnchantedDamage?' (dano já incluído no total PvE)':''))
  }
  const speed=[]
  if(positive(petSpeed))speed.push('pet +'+fmt(petSpeed))
  if(positive(teamSpeed))speed.push('sinergia +'+fmt(teamSpeed))
  if(speed.length)rows.push('👢 VEL: '+speed.join(' • '))

  if(reserveActive)rows.push('🐾 Reserva apta contribuindo')
  if(petStatus){
    const possible=same(recoveredBossDamagePct,recoveredRaidDamagePct)
      ?'Boss/Raid *+'+fmt(recoveredBossDamagePct)+'%*'
      :'Boss *+'+fmt(recoveredBossDamagePct)+'%* • Raid *+'+fmt(recoveredRaidDamagePct)+'%*'
    rows.push('⚠️ Pet principal '+petStatus+': bônus suspensos. Após recuperação: '+possible)
  }
  if(classEffect)rows.push(classEffect)
  return rows.join('\n')
}
