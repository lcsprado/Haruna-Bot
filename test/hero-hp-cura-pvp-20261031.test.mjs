import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {heroCombatStats,heroEffectiveCombatHp,heroCombatSheetFromProfile,heroHpToPersistent} from '../src/neon/playable-heroes-core.js'

const stored=({hp=5071}={})=>({
  hp,max_hp:3071,class_hp_bonus:130,
  atk:1000,def:1000,spd:400,
  equipment_hp:2000,equipment_atk:100,equipment_def:100,equipment_spd:20
})
const diane=st=>heroCombatStats(st,'pecado_diane',100)

test('Diane totalmente curada mantém 100% da vida com os equipamentos no PvP',()=>{
  const st=stored()
  const h=diane(st)
  assert.equal(h.maxHp,3771)
  assert.equal(heroEffectiveCombatHp(st,h,2000),5771)
  const sheet=heroCombatSheetFromProfile(st,'pecado_diane',100)
  assert.equal(sheet.maxHp,5771)
  assert.equal(sheet.hp,5771)
  assert.equal(heroHpToPersistent(sheet.hp,sheet.maxHp,5071),5071)
})

test('HP parcial, HP zero e limite superior usam a mesma proporção efetiva',()=>{
  const partial=stored({hp:2535}),h=diane(partial)
  const expected=Math.round(2535/5071*5771)
  assert.equal(heroEffectiveCombatHp(partial,h,2000),expected)
  assert.equal(heroCombatSheetFromProfile(partial,'pecado_diane',100).hp,expected)
  assert.equal(heroEffectiveCombatHp(stored({hp:0}),diane(stored({hp:0})),2000),0)
  assert.equal(heroEffectiveCombatHp(stored({hp:9000}),diane(stored({hp:9000})),2000),5771)
})

test('sem equipamento, cura e batalha continuam na mesma escala',()=>{
  const st={...stored({hp:3071}),equipment_hp:0}
  assert.equal(heroEffectiveCombatHp(st,diane(st),0),3771)
  assert.equal(heroCombatSheetFromProfile(st,'pecado_diane',100).hp,3131)
})

test('PvP, Boss/Raid e comando curar usam conversão efetiva da Diane',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(db,/aHeroStats\?heroEffectiveCombatHp\(a,aHeroStats,/)
  assert.match(db,/bHeroStats\?heroEffectiveCombatHp\(b,bHeroStats,/)
  assert.match(db,/heroPersistentMaxHp:Number\(a.max_hp\)\+Number\(aeW.hp/)
  assert.match(games,/heroEffectiveCombatHp\(st,heroStats,gearHp\)/)
  assert.match(games,/persistentMaxHp:Number\(st.max_hp\)\+gearHp/)
  assert.match(app,/const heroHpView=await getPlayableHeroCombatSheet\(sender,profile\)/)
  assert.match(app,/HP já está cheio: \*\$\{shownHp\}\/\$\{shownMaxHp\}/)
})
