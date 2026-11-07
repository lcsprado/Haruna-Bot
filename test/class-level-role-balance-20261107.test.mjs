import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PLAYER_CLASSES} from '../src/neon/game-catalog.js'
import {
  CLASS_LEVEL_DAILY_XP_CAP,CLASS_LEVEL_MAX_XP,classLevelFromXp,
  classTraining,classCombatStats,classEffectiveCombatHp,classHpToPersistent
} from '../src/neon/class-level-progression.js'
import {buildFairFighter,auditClassHeroBase,PVP_EQUAL_GEAR} from '../src/neon/pvp-balance-simulator.js'

const four=['paladin','berserker','samurai','necromancer']

test('classe inicia Nv.1 sem bonus extra e evolui ate Nv.100 sem ultrapassar teto',()=>{
  assert.equal(CLASS_LEVEL_DAILY_XP_CAP,500)
  assert.equal(CLASS_LEVEL_MAX_XP,9900)
  assert.equal(classLevelFromXp(0),1)
  assert.equal(classLevelFromXp(500),6)
  assert.equal(classLevelFromXp(9900),100)
  assert.equal(classLevelFromXp(999999999),100)
  for(const id of four){
    assert.deepEqual(classTraining(id,1),{hp:0,atk:0,def:0,spd:0})
    const full=classTraining(id,100)
    assert.ok(full.hp>0 && full.def>0)
    assert.deepEqual(classTraining(id,101),full)
  }
  assert.deepEqual(classTraining('warrior',100),{hp:0,atk:0,def:0,spd:0})
})

test('papeis: Paladino e tanque; Berserker e atacante; Samurai e duelista rapido',()=>{
  const stats=id=>({hp:PLAYER_CLASSES[id].hp+classTraining(id,100).hp,
    atk:PLAYER_CLASSES[id].atk+classTraining(id,100).atk,
    def:PLAYER_CLASSES[id].def+classTraining(id,100).def,
    spd:PLAYER_CLASSES[id].spd+classTraining(id,100).spd})
  const tank=stats('paladin'),brute=stats('berserker'),duelist=stats('samurai'),necro=stats('necromancer')
  assert.ok(tank.hp>brute.hp && tank.hp>duelist.hp && tank.hp>necro.hp)
  assert.ok(tank.def>brute.def && tank.def>duelist.def && tank.def>necro.def)
  assert.ok(brute.atk>tank.atk && brute.atk>duelist.atk && brute.atk>necro.atk)
  assert.ok(duelist.spd>brute.spd && duelist.spd>necro.spd && duelist.spd>tank.spd)
})

test('HP de classe escala durante combate e retorna a base permanente sem inflar banco',()=>{
  const saved={class_applied:true,class_id:'paladin',max_hp:3700,hp:4900,atk:910,def:455,spd:460}
  const sheet=classCombatStats(saved,100),gear=2157
  assert.equal(sheet.maxHp,3885)
  assert.equal(sheet.atk,921)
  assert.equal(sheet.def,483)
  assert.equal(sheet.spd,462)
  const combatHp=classEffectiveCombatHp(saved,sheet,gear)
  assert.ok(combatHp>saved.hp)
  assert.equal(classHpToPersistent(combatHp,sheet.maxHp+gear,saved.max_hp+gear),saved.hp)
  assert.equal(classCombatStats({...saved,class_applied:false},100).maxHp,saved.max_hp)
})

test('balanco aprovado EXCLUSIVAMENTE na base: herois superiores a quatro classes Lv100',()=>{
  const audit=auditClassHeroBase({duelsPerOrder:200,awakening:5,mastery:5,classLevel:100})
  assert.equal(audit.scenario,'no-gear')
  assert.equal(audit.gearIncluded,false)
  assert.equal(audit.combatants,17)
  assert.equal(audit.heroCount,7)
  assert.equal(audit.selectedClasses,4)
  assert.ok(audit.weakestHeroRate>audit.strongestClassRate,
    'Todos os sete herois devem ficar acima das quatro classes sem itens')
  assert.ok(audit.weakestHeroMatchupRate>50,
    'Cada heroi ainda precisa ter vantagem no confronto individual igualado')
  assert.ok(Object.values(audit.classesVsHeroes).every(rate=>rate>=20&&rate<50),
    'Classes devem ter chances reais, mas os herois continuam superiores')
})

test('equipamentos sao uma camada adicional separada, nunca criterio do balanceamento base',()=>{
  for(const id of ['paladin','berserker','samurai','necromancer','pecado_meliodas']){
    const base=buildFairFighter(id,{gear:false,classLevel:100})
    const equipped=buildFairFighter(id,{gear:true,classLevel:100})
    assert.equal(equipped.maxHp-base.maxHp,PVP_EQUAL_GEAR.hp)
    assert.equal(equipped.atk-base.atk,PVP_EQUAL_GEAR.atk)
    assert.equal(equipped.def-base.def,PVP_EQUAL_GEAR.def)
    assert.equal(equipped.spd-base.spd,PVP_EQUAL_GEAR.spd)
  }
  const progression=readFileSync(new URL('../src/neon/class-level-progression.js',import.meta.url),'utf8')
  assert.doesNotMatch(progression,/equipmentStatsAtLevel|weapon_id|armor_id|helmet_id|boot_id|PVP_EQUAL_GEAR/)
  // Nenhum ganho extra de classe deve ser atribuido diretamente a armas/armaduras.
})

test('bonus nao antecipados no Nv.1 e nao herdados pelo heroi da collab',()=>{
  const novato=buildFairFighter('berserker',{gear:false,classLevel:1,awakening:1})
  const veterano=buildFairFighter('berserker',{gear:false,classLevel:100,awakening:1})
  const hero=buildFairFighter('pecado_ban',{gear:false,classLevel:1})
  assert.ok(veterano.maxHp>novato.maxHp)
  assert.ok(veterano.atk>novato.atk)
  assert.equal(hero.awakening,0)
  assert.equal(hero.hero,true)
})

test('XP da classe tem travas e nao entra em stats permanentes nem modo heroi',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(db,/CREATE TABLE IF NOT EXISTS player_class_progress/)
  assert.match(db,/ON CONFLICT\(jid,class_id\) DO NOTHING/)
  assert.match(db,/CLASS_LEVEL_DAILY_XP_CAP-today/)
  assert.match(db,/hm\.hero_species IS NULL/)
  assert.match(db,/classHpToPersistent\(withoutPet/)
  assert.match(games,/classEffectiveCombatHp\(st,classStats,gearHp\)/)
  assert.match(games,/classStoredHp=recordedHp/)
})
