// Cinco lendários permanentes do Vínculo Vital.
// Distribuídos somente entre Raids já existentes: 40, 50, 60, 65 e 70.
export const VITAL_PETS = Object.freeze([
  Object.freeze({species:'cervo_aurora_viva',name:'🦌 Cervo da Aurora Viva',raidLevel:40,materialId:'fragmento_celestial',power:315,chance:8,hpBase:295,hpGrowth:22,stats:Object.freeze({hp:11,defense:8}),healPct:6,healCooldown:6,type:'Vital — Protetor'}),
  Object.freeze({species:'guardiao_nucleo_vital',name:'🗿 Guardião do Núcleo Vital',raidLevel:50,materialId:'nucleo_alpha_corrompido',power:385,chance:8,hpBase:360,hpGrowth:26,stats:Object.freeze({hp:12,defense:9,dodge:5}),type:'Vital — Bastião'}),
  Object.freeze({species:'quimera_rubra',name:'🐲 Quimera Rubra',raidLevel:60,materialId:'fragmento_caos',power:365,chance:8,hpBase:345,hpGrowth:25,stats:Object.freeze({hp:12,damage:10,crit:6}),type:'Vital — Lutador'}),
  Object.freeze({species:'serafim_vida_abissal',name:'🪽 Serafim da Vida Abissal',raidLevel:65,materialId:'coroa_abissal',power:395,chance:8,hpBase:375,hpGrowth:27,stats:Object.freeze({hp:13,defense:8}),healPct:8,healCooldown:5,type:'Vital — Restaurador'}),
  Object.freeze({species:'leviata_eternidade',name:'🌊 Leviatã da Eternidade',raidLevel:70,materialId:'essencia_eclipse',power:430,chance:8,hpBase:395,hpGrowth:28,stats:Object.freeze({hp:14,defense:9,bossDamage:8}),type:'Vital — Colosso'})
])
export const VITAL_PET_SPECIES=Object.freeze(VITAL_PETS.map(p=>p.species))
export const VITAL_PET_SPECIES_SET=new Set(VITAL_PET_SPECIES)

// Três espécies da coleção, sem Coringa: raro e forte, mas não é DPS.
// Não acumula com Elo Universal nem com estilos comuns.
export const VITAL_TEAM_BONUS=Object.freeze({
  style:'vital',styleLabel:'🧬 Vital',
  label:'💚 Vínculo Vital — Coração Eterno',
  hp:.08,defense:.02,vitalPulse:.05,
  attack:0,crit:0,speed:0,
  text:'+8% HP máximo • -2% dano recebido • Coração Eterno: ao cair abaixo de 35% HP, cura 5% HP (1 vez por combate) no Boss/Raid'
})
export function resolveVitalTeam(species=[]){
  return Array.isArray(species)&&species.length===3&&new Set(species).size===3&&species.every(s=>VITAL_PET_SPECIES_SET.has(String(s)))?VITAL_TEAM_BONUS:null
}

// Único gatilho por combate, só se continuar vivo, sem auto-ressurreição.
export function vitalPulseHeal(currentHp,maxHp,alreadyUsed=false,pulseRate=0){
  const max=Math.max(1,Number(maxHp)||1)
  const hp=Math.max(0,Math.min(max,Number(currentHp)||0))
  if(alreadyUsed||hp<=0||hp/max>.35||Number(pulseRate||0)<=0) return {hp,heal:0,used:Boolean(alreadyUsed)}
  const amount=Math.max(1,Math.round(max*Math.max(0,Math.min(.05,Number(pulseRate)||0))))
  const next=Math.min(max,hp+amount)
  return {hp:next,heal:next-hp,used:true}
}


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
