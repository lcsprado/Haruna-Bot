// V2: quatro caminhos de armas por Raid, sem restricao de classe.
// Atributos reais, sem novas multiplicacoes de skills nesta etapa de homologacao.
// Os equipamentos antigos nao recebem alteracoes de atributos ou raridade.
const tiers=[
 [15,'escama_vulcanica','Escama Vulcânica',43,{necromancer:'foice_carmesim'},[
  ['paladin','martelo_brasa','Martelo da Brasa',34,8,22,0,0],
  ['samurai','katana_vulcanica','Katana Vulcânica',38,0,0,3,.015],
  ['berserker','machado_erupcao','Machado da Erupção',45,0,0,0,0]]],
 [20,'olho_abissal','Olho Abissal',46,{paladin:'lanca_solar'},[
  ['necromancer','foice_profundeza','Foice das Profundezas',41,0,25,0,.005],
  ['samurai','katana_mares','Katana das Marés',41,0,0,4,.015],
  ['berserker','machado_devorador','Machado do Devorador',48,0,0,0,0]]],
 [25,'nucleo_titan','Núcleo do Titã',51,{samurai:'garras_vazio'},[
  ['paladin','martelo_ferro','Martelo do Bastião de Ferro',40,10,30,0,0],
  ['necromancer','foice_engrenagens','Foice das Engrenagens',46,0,30,0,.005],
  ['berserker','machado_colosso','Machado do Colosso',53,0,0,0,0]]],
 [30,'essencia_rei_abissal','Essência do Rei Abissal',54,{samurai:'espada_eclipse'},[
  ['paladin','martelo_trono','Martelo do Trono Abissal',43,12,35,0,0],
  ['necromancer','foice_rei_abissal','Foice do Rei Abissal',49,0,35,0,.01],
  ['berserker','machado_ruina','Machado da Ruína Abissal',56,0,0,0,0]]],
 [40,'fragmento_celestial','Fragmento Celestial',85,{samurai:'excalibur'},[
  ['paladin','martelo_serafim','Martelo do Serafim',68,17,50,0,0],
  ['necromancer','foice_anjo_caido','Foice do Anjo Caído',76,0,45,0,.01],
  ['berserker','machado_querubim','Machado do Querubim Caído',89,0,0,0,0]]],
 [50,'nucleo_alpha_corrompido','Núcleo Alpha Corrompido',95,{samurai:'katana_divina'},[
  ['paladin','martelo_juizo','Martelo do Juízo',76,20,65,0,0],
  ['necromancer','foice_almas_divinas','Foice das Almas Divinas',86,0,55,0,.01],
  ['berserker','machado_furia_divina','Machado da Fúria Divina',100,0,0,0,0]]],
 [60,'fragmento_caos','Fragmento do Caos',110,{samurai:'lamina_caos',berserker:'machado_tita'},[
  ['paladin','martelo_entalpia','Martelo do Bastião do Caos',88,22,75,0,0],
  ['necromancer','foice_entropia','Foice da Entropia',96,0,65,0,.015]]],
 [65,'coroa_abissal','Coroa Abissal',125,{necromancer:'foice_abismo',paladin:'espada_aurora'},[
  ['samurai','katana_aurora','Katana da Aurora',109,0,0,8,.04],
  ['berserker','machado_imperador','Machado do Imperador',130,0,0,0,0]]],
 [70,'essencia_eclipse','Essência do Eclipse',135,{samurai:'exterminadora_eclipse'},[
  ['paladin','martelo_eclipse_supremo','Martelo do Juízo do Eclipse',108,29,95,0,0],
  ['necromancer','foice_colheita_final','Foice da Colheita Final',120,0,80,0,.02],
  ['berserker','machado_frenesi_eclipse','Machado do Frenesi do Eclipse',140,0,0,0,0]]]
]
export const RAID_WEAPON_BUILD_TIERS=Object.freeze(tiers.map(([level,materialId,materialName,anchor,existing,rows])=>Object.freeze({
 level,materialId,materialName,anchor,existing:Object.freeze(existing),
 weapons:Object.freeze(rows.map(([role,slug,name,atk,def,hp,spd,crit])=>Object.freeze({
  id:'raid_v2_'+slug,role,name,category:'weapon',rarity:level<40?'epic':'legendary',
  atk,def,hp,spd,crit,raidLevel:level,materialId,materialName
 })))
})))
export const V2_NEW_RAID_WEAPONS=Object.freeze(RAID_WEAPON_BUILD_TIERS.flatMap(t=>t.weapons))
const roleNames={paladin:'Paladino',samurai:'Samurai',necromancer:'Necromante',berserker:'Berserker'}
export function v2RaidWeaponItemRows(enabled){
 if(!enabled)return []
 return V2_NEW_RAID_WEAPONS.map(w=>{
  const stats=[w.atk&&'+'+w.atk+' ATK',w.def&&'+'+w.def+' DEF',w.hp&&'+'+w.hp+' HP',w.spd&&'+'+w.spd+' VEL',w.crit&&'+'+Number((w.crit*100).toFixed(2))+' p.p. CRIT'].filter(Boolean).join(', ')
  return [w.id,w.name,'Drop exclusivo da Raid '+w.raidLevel+'. '+stats+'. Afinidade: '+roleNames[w.role]+' (sem restrição de classe).',w.category,0,w.rarity]
 })
}
export function v2RaidWeaponStats(enabled){
 return enabled?Object.fromEntries(V2_NEW_RAID_WEAPONS.map(w=>[w.id,{category:w.category,name:w.name,atk:w.atk,def:w.def,hp:w.hp,spd:w.spd,crit:w.crit}])):{}
}
export function v2RaidWeaponOrigins(enabled){
 return enabled?Object.fromEntries(V2_NEW_RAID_WEAPONS.map(w=>[w.id,{raidLevel:w.raidLevel,materialId:w.materialId,materialName:w.materialName}])):{}
}
export function expandV2RaidWeapons(cfg,enabled){
 if(!enabled||!cfg||!Array.isArray(cfg.gear)||!cfg.gear.length||cfg.originalGearCount)return cfg
 const tier=RAID_WEAPON_BUILD_TIERS.find(t=>t.level===Number(cfg.level))
 if(!tier)return cfg
 return {...cfg,originalGearCount:cfg.gear.length,gear:[...cfg.gear,...tier.weapons.map(w=>w.id)]}
}
// Compensa a diluicao de cada item antigo no sorteio uniforme.
// Continua sendo UMA rolagem, com no maximo uma arma/armadura/escudo por jogador.
export function expandedV2GearChance(cfg,originalChance){
 if(!cfg?.originalGearCount)return originalChance
 return Math.min(1,originalChance*cfg.gear.length/cfg.originalGearCount)
}
