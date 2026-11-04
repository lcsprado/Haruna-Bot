// Cinco lendários permanentes do Vínculo Vital.
// Distribuídos somente entre Raids já existentes: 40, 50, 60, 65 e 70.
export const VITAL_PETS = Object.freeze([
  Object.freeze({species:'cervo_aurora_viva',name:'🦌 Cervo da Aurora Viva',raidLevel:40,materialId:'fragmento_celestial',power:315,chance:8,hpBase:295,hpGrowth:22,stats:Object.freeze({hp:8,defense:5}),type:'Vital — Protetor'}),
  Object.freeze({species:'guardiao_nucleo_vital',name:'🗿 Guardião do Núcleo Vital',raidLevel:50,materialId:'nucleo_alpha_corrompido',power:385,chance:8,hpBase:360,hpGrowth:26,stats:Object.freeze({hp:9,defense:7,dodge:3}),type:'Vital — Bastião'}),
  Object.freeze({species:'quimera_rubra',name:'🐲 Quimera Rubra',raidLevel:60,materialId:'fragmento_caos',power:365,chance:8,hpBase:345,hpGrowth:25,stats:Object.freeze({hp:9,damage:7,crit:4}),type:'Vital — Lutador'}),
  Object.freeze({species:'serafim_vida_abissal',name:'🪽 Serafim da Vida Abissal',raidLevel:65,materialId:'coroa_abissal',power:395,chance:8,hpBase:375,hpGrowth:27,stats:Object.freeze({hp:10,defense:5}),healPct:6,healCooldown:6,type:'Vital — Restaurador'}),
  Object.freeze({species:'leviata_eternidade',name:'🌊 Leviatã da Eternidade',raidLevel:70,materialId:'essencia_eclipse',power:430,chance:8,hpBase:395,hpGrowth:28,stats:Object.freeze({hp:11,defense:7,bossDamage:5}),type:'Vital — Colosso'})
])
export const VITAL_PET_SPECIES=Object.freeze(VITAL_PETS.map(p=>p.species))
export const VITAL_PET_SPECIES_SET=new Set(VITAL_PET_SPECIES)

// O bônus é temporário, vale apenas durante a luta e preserva o percentual
// de vida existente. Não deve ser gravado na coluna stats.hp.
export function applyVitalCombatHp(currentHp,maxHp,petHpRate=0,teamHpRate=0,{pvp=false}={}){
  const baseMax=Math.max(1,Number(maxHp)||1)
  const baseHp=Math.max(0,Math.min(baseMax,Number(currentHp)||0))
  const petRate=Math.max(0,Number(petHpRate)||0)
  const teamRate=Math.max(0,Number(teamHpRate)||0)*(pvp?.5:1)
  const rate=Math.min(pvp?.10:.25,petRate+teamRate)
  const boostedMax=Math.max(1,Math.round(baseMax*(1+rate)))
  const boostedHp=Math.max(0,Math.min(boostedMax,Math.round(baseHp*boostedMax/baseMax)))
  return {hp:boostedHp,maxHp:boostedMax,rate,baseMaxHp:baseMax}
}

export function restoreVitalPersistentHp(combatHp,combatMaxHp,persistentMaxHp){
  const combatMax=Math.max(1,Number(combatMaxHp)||1)
  const persistedMax=Math.max(1,Number(persistentMaxHp)||1)
  return Math.max(0,Math.min(persistedMax,Math.round(Math.max(0,Number(combatHp)||0)*persistedMax/combatMax)))
}
