// Catálogo puro da collab 7 Pecados (sem dependências de banco).
export const PECADOS_ESSENCES=Object.freeze([
  'essencia_pecado_preguica','essencia_pecado_gula','essencia_pecado_ganancia',
  'essencia_pecado_inveja','essencia_pecado_luxuria','essencia_pecado_ira','essencia_pecado_soberba'
])
export const PECADOS_HEROES=Object.freeze([
  {species:'pecado_meliodas',name:'Meliodas',style:'predador',power:340,stats:{damage:14,crit:9,defense:6}},
  {species:'pecado_ban',name:'Ban',style:'predador',power:335,stats:{damage:14,crit:9,dodge:9}},
  {species:'pecado_escanor',name:'Escanor',style:'predador',power:355,stats:{damage:14,bossDamage:14,crit:9}},
  {species:'pecado_king',name:'King',style:'guardiao',power:330,stats:{defense:14,damage:10,crit:6}},
  {species:'pecado_diane',name:'Diane',style:'guardiao',power:345,stats:{defense:14,damage:11,dodge:7}},
  {species:'pecado_gowther',name:'Gowther',style:'mistico',power:325,stats:{crit:14,damage:10,drop:7}},
  {species:'pecado_merlin',name:'Merlin',style:'mistico',power:350,stats:{damage:14,crit:12,defense:8}}
])
export const PECADOS_WEAPONS=Object.freeze([
  {id:'pecados_lostvayne',name:'Lostvayne — Meliodas',category:'weapon',atk:160,crit:0.05},
  {id:'pecados_courechouse',name:'Courechouse — Ban',category:'weapon',atk:150,spd:16,crit:0.025},
  {id:'pecados_rhitta',name:'Rhitta — Escanor',category:'weapon',atk:170,crit:0.06},
  {id:'pecados_chastiefol',name:'Chastiefol — King',category:'weapon',atk:155,def:50,crit:0.01},
  {id:'pecados_gideon',name:'Gideon — Diane',category:'weapon',atk:165,def:55,hp:50},
  {id:'pecados_herritt',name:'Herritt — Gowther',category:'weapon',atk:148,crit:0.07,spd:5},
  {id:'pecados_aldan',name:'Aldan — Merlin',category:'weapon',atk:160,spd:12,crit:0.035}
])
// Sete armaduras para igualdade também entre os itens individuais da categoria.
export const PECADOS_ARMORS=Object.freeze([
  {id:'pecados_armadura_meliodas',name:'Armadura Demoníaca de Meliodas',category:'armor',def:185,hp:400,crit:0.015},
  {id:'pecados_armadura_ban',name:'Armadura Imortal de Ban',category:'armor',def:180,hp:480,crit:0.02},
  {id:'pecados_armadura_escanor',name:'Armadura Solar de Escanor',category:'armor',def:200,hp:440,atk:20},
  {id:'pecados_armadura_king',name:'Armadura do Rei das Fadas',category:'armor',def:190,hp:530},
  {id:'pecados_armadura_diane',name:'Armadura da Gigante Diane',category:'armor',def:205,hp:490},
  {id:'pecados_armadura_gowther',name:'Armadura da Mente de Gowther',category:'armor',def:182,hp:400,crit:0.035},
  {id:'pecados_armadura_merlin',name:'Armadura Arcana de Merlin',category:'armor',def:190,hp:420,crit:0.03,spd:6}
])
export const PECADOS_EQUIPMENT=Object.freeze([...PECADOS_WEAPONS,...PECADOS_ARMORS])
export const PECADOS_HERO_IDS=Object.freeze(PECADOS_HEROES.map(p=>p.species))
export const PECADOS_GEAR_IDS=Object.freeze(PECADOS_EQUIPMENT.map(p=>p.id))
// Regras compartilhadas entre WhatsApp, recompensas e a Central de Eventos do Web.
export const PECADOS_ESSENCES_PER_PHASE=2
export const PECADOS_FULL_CLEAR_BONUS_ESSENCES=7
export const PECADOS_MIN_BOSS_DAMAGE=10000
export const PECADOS_BOSS_PHASES=Object.freeze([
  {"id":"preguica","name":"💤 Preguiça","hp":300000,"atk":100,"cash":[20000,15000,10000]},
  {"id":"gula","name":"🍖 Gula","hp":400000,"atk":120,"cash":[25000,18000,12000]},
  {"id":"ganancia","name":"💰 Ganância","hp":500000,"atk":140,"cash":[30000,22000,15000]},
  {"id":"inveja","name":"🐍 Inveja","hp":600000,"atk":160,"cash":[35000,25000,18000]},
  {"id":"luxuria","name":"💋 Luxúria","hp":700000,"atk":180,"cash":[40000,30000,20000]},
  {"id":"ira","name":"🔥 Ira","hp":800000,"atk":200,"cash":[50000,35000,25000]},
  {"id":"soberba","name":"👑 Soberba","hp":900000,"atk":230,"cash":[60000,45000,30000]},
  {"id":"azazel","name":"👹 Azazel, o Pecado Original","hp":1200000,"atk":260,"cash":[150000,100000,70000],"boxes":[10,6,4]},
])
export const PECADOS_STARTS=Object.freeze(['2026-10-25T18:00:00-03:00','2026-11-01T18:00:00-03:00'])
export const PECADOS_ENDS=Object.freeze(['2026-10-25T20:00:00-03:00','2026-11-01T20:00:00-03:00'])
export const PECADOS_EDITIONS=Object.freeze(PECADOS_STARTS.map((start,i)=>Object.freeze({
  start:Date.parse(start),end:Date.parse(PECADOS_ENDS[i]),key:'sete-pecados-collab-'+(i===0?'20261025':'20261101')
})))
export function pecadosBonus(count){return [0,.05,.10,.20][Math.max(0,Math.min(3,Number(count)||0))]}
