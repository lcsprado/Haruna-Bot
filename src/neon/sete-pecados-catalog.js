// Catálogo puro da collab 7 Pecados (sem dependências de banco).
export const PECADOS_ESSENCES=Object.freeze([
  'essencia_pecado_preguica','essencia_pecado_gula','essencia_pecado_ganancia',
  'essencia_pecado_inveja','essencia_pecado_luxuria','essencia_pecado_ira','essencia_pecado_soberba'
])
export const PECADOS_HEROES=Object.freeze([
  {species:'pecado_meliodas',name:'Meliodas',style:'predador',power:340,stats:{damage:12,crit:7,defense:4}},
  {species:'pecado_ban',name:'Ban',style:'predador',power:335,stats:{damage:11,crit:6,dodge:7}},
  {species:'pecado_escanor',name:'Escanor',style:'predador',power:355,stats:{damage:12,bossDamage:12,crit:7}},
  {species:'pecado_king',name:'King',style:'guardiao',power:330,stats:{defense:12,damage:6,crit:4}},
  {species:'pecado_diane',name:'Diane',style:'guardiao',power:345,stats:{defense:12,damage:7,dodge:4}},
  {species:'pecado_gowther',name:'Gowther',style:'mistico',power:325,stats:{crit:12,damage:6,drop:4}},
  {species:'pecado_merlin',name:'Merlin',style:'mistico',power:350,stats:{damage:12,crit:10,defense:5}}
])
export const PECADOS_WEAPONS=Object.freeze([
  {id:'pecados_lostvayne',name:'Lostvayne — Meliodas',category:'weapon',atk:135,crit:.04},
  {id:'pecados_courechouse',name:'Courechouse — Ban',category:'weapon',atk:125,spd:12},
  {id:'pecados_rhitta',name:'Rhitta — Escanor',category:'weapon',atk:150,crit:.05},
  {id:'pecados_chastiefol',name:'Chastiefol — King',category:'weapon',atk:130,def:35},
  {id:'pecados_gideon',name:'Gideon — Diane',category:'weapon',atk:145,def:40},
  {id:'pecados_herritt',name:'Herritt — Gowther',category:'weapon',atk:120,crit:.07},
  {id:'pecados_aldan',name:'Aldan — Merlin',category:'weapon',atk:140,spd:8}
])
// Sete armaduras para igualdade também entre os itens individuais da categoria.
export const PECADOS_ARMORS=Object.freeze([
  {id:'pecados_armadura_meliodas',name:'Armadura Demoníaca de Meliodas',category:'armor',def:145,hp:300},
  {id:'pecados_armadura_ban',name:'Armadura Imortal de Ban',category:'armor',def:140,hp:330,crit:.01},
  {id:'pecados_armadura_escanor',name:'Armadura Solar de Escanor',category:'armor',def:160,hp:350},
  {id:'pecados_armadura_king',name:'Armadura do Rei das Fadas',category:'armor',def:150,hp:400},
  {id:'pecados_armadura_diane',name:'Armadura da Gigante Diane',category:'armor',def:160,hp:380},
  {id:'pecados_armadura_gowther',name:'Armadura da Mente de Gowther',category:'armor',def:142,hp:310,crit:.02},
  {id:'pecados_armadura_merlin',name:'Armadura Arcana de Merlin',category:'armor',def:148,hp:320,crit:.02}
])
export const PECADOS_EQUIPMENT=Object.freeze([...PECADOS_WEAPONS,...PECADOS_ARMORS])
export const PECADOS_HERO_IDS=Object.freeze(PECADOS_HEROES.map(p=>p.species))
export const PECADOS_GEAR_IDS=Object.freeze(PECADOS_EQUIPMENT.map(p=>p.id))
export const PECADOS_STARTS=Object.freeze(['2026-10-25T18:00:00-03:00','2026-11-01T18:00:00-03:00'])
export const PECADOS_ENDS=Object.freeze(['2026-10-25T20:00:00-03:00','2026-11-01T20:00:00-03:00'])
export const PECADOS_EDITIONS=Object.freeze(PECADOS_STARTS.map((start,i)=>Object.freeze({
  start:Date.parse(start),end:Date.parse(PECADOS_ENDS[i]),key:'sete-pecados-collab-'+(i===0?'20261025':'20261101')
})))
export function pecadosBonus(count){return [0,.05,.10,.20][Math.max(0,Math.min(3,Number(count)||0))]}
