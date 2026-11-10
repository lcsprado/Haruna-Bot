import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_WEAPONS,PECADOS_EQUIPMENT,PECADOS_GEAR_IDS} from '../src/neon/sete-pecados-catalog.js'
import {heroPvpAttack,heroPvpDefense} from '../src/neon/playable-heroes-core.js'

// Exercita a funcao usada no menu e no calculo de PvP, Boss e Raid,
// isolando o catalogo para nao abrir conexoes ou mudar inventarios.
const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const functionBody=dbSource.split('export function equipmentStatsAtLevel(')[1]?.split('function equipmentUpgradeCost(')[0]
assert.ok(functionBody&&functionBody.includes('const starMult=1+.04*(starLevel-1)'))
assert.match(dbSource,/PECADOS_GEAR_IDS\.map\(id=>\[id,Object\.freeze\(/)
const equipment=Object.fromEntries(PECADOS_EQUIPMENT.map(({id,...gear})=>[id,gear]))
const forging=Object.fromEntries(PECADOS_GEAR_IDS.map(id=>[id,{collab:true}]))
const equipmentStatsAtLevel=new Function(
  'EQUIPMENT','RAID_GEAR_FORGE_ORIGINS','SHOP_FORGE5_STATS_IDS','ANTI_CRIT_SHIELDS','antiCritShieldStats',
  "const EQUIPMENT_MAX_LEVEL=10;\nfunction equipmentStatsAtLevel("+functionBody+"\nreturn equipmentStatsAtLevel"
)(equipment,forging,new Set(),[],()=>({}))

test('Lostvayne ★★★★★ Lv.10: 464 → 493 ATK, CRIT permanece 14,5%',()=>{
  const weapon=PECADOS_WEAPONS.find(w=>w.id==='pecados_lostvayne')
  assert.equal(weapon.atk,170)
  assert.equal(weapon.crit,.05)
  assert.equal(Math.round(160*2.5*1.16),464)
  const stats=equipmentStatsAtLevel('pecados_lostvayne',10,5)
  assert.equal(stats.atk,493)
  assert.equal(stats.crit,.145)
  assert.equal(stats.level,10)
  assert.equal(stats.stars,5)
  assert.equal(stats.starMult,1.16)
})

test('Gideon de Diane ★★★★★ Lv10 segue 478 ATK, 160 DEF e 145 HP',()=>{
  const gideon=equipmentStatsAtLevel('pecados_gideon',10,5)
  assert.equal(PECADOS_WEAPONS.find(w=>w.id==='pecados_gideon').atk,165)
  assert.equal(gideon.atk,478)
  assert.equal(gideon.def,160)
  assert.equal(gideon.hp,145)
  assert.equal(gideon.crit,0)
})

test('Outras seis armas e atributos permanecem iguais',()=>{
  const original={
    pecados_courechouse:{atk:150,spd:16,crit:.025},
    pecados_rhitta:{atk:170,crit:.06},
    pecados_chastiefol:{atk:155,def:50,crit:.01},
    pecados_gideon:{atk:165,def:55,hp:50},
    pecados_herritt:{atk:148,crit:.07,spd:5},
    pecados_aldan:{atk:160,spd:12,crit:.035}
  }
  for(const [id,stats] of Object.entries(original)){
    const w=PECADOS_WEAPONS.find(x=>x.id===id)
    for(const [key,value] of Object.entries(stats))
      assert.equal(w[key],value,id+'.'+key+' deve permanecer inalterado')
  }
  assert.equal(equipmentStatsAtLevel('pecados_courechouse',10,5).atk,435)
  assert.equal(equipmentStatsAtLevel('pecados_courechouse',10,5).spd,46)
})

test('Aplica a nova base em qualquer nivel e mantem todas estrelas e progresso',()=>{
  const regular=equipmentStatsAtLevel('pecados_lostvayne',1,1)
  const common10=equipmentStatsAtLevel('pecados_lostvayne',10,1)
  const forged=equipmentStatsAtLevel('pecados_lostvayne',10,5)
  assert.equal(regular.atk,170)
  assert.equal(common10.atk,425)
  assert.equal(forged.atk,493)
  assert.equal(regular.crit,.05)
  assert.equal(common10.crit,.125)
  assert.equal(forged.crit,.145)
  assert.match(dbSource,/SELECT sf\.item_id,sf\.stars,sf\.level/)
  assert.match(dbSource,/Number\(r\.level\)===Number\(r\.effective\)/)
})

test('Full Counter, Revenge Counter e defesa continuam no motor PvP',()=>{
  const first=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:1,masteryStage:4,gear:{attack:.015}})
  assert.equal(first.damage,1060)
  const defense=heroPvpDefense({heroId:'pecado_meliodas',damage:1000,state:{counterReady:true},gear:{}})
  assert.equal(defense.damage,950)
  assert.equal(defense.technique,'Full Counter')
  const after=heroPvpAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:2,masteryStage:4,state:{...defense.state},gear:{attack:.015}})
  assert.ok(after.damage>first.damage,'Full Counter continua somando dano')
})

test('PvP, Boss e Raid usam catalogo de armas na mesma funcao',()=>{
  assert.match(dbSource,/const aeW=a\.weapon_id\?equipmentStatsAtLevel\(a\.weapon_id/)
  assert.match(dbSource,/const beW=b\.weapon_id\?equipmentStatsAtLevel\(b\.weapon_id/)
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(games,/equipmentStatsAtLevel\(st\.weapon_id/)
})
