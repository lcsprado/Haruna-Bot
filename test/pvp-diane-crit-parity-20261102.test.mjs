import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pvpCritChance} from '../src/neon/pvp-crit.js'
import {heroPvpAttack,heroPvpDefense} from '../src/neon/playable-heroes-core.js'
import {formatPvpBattleReport} from '../src/neon/pvp-report.js'

test('critico de heroi ignora passiva de classe e respeita teto PvP',()=>{
 const hero=pvpCritChance({equipmentCrit:.10,classId:'assassin',classApplied:true,
  awakeningStage:5,heroActive:true,collabCrit:.02,petCrit:.04})
 assert.ok(Math.abs(hero-.26)<1e-9)
 const classic=pvpCritChance({equipmentCrit:.10,classId:'assassin',classApplied:true,
  awakeningStage:5,collabCrit:.02,petCrit:.04})
 assert.ok(classic>hero)
 assert.equal(pvpCritChance({equipmentCrit:.5,petCrit:.1}),.40)
 const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 assert.match(app,/const pvpCritWithPet=pvpCritChance\(/)
 assert.match(app,/const pvpCritPct=pvpCritChance\(/)
 assert.match(db,/crit:pvpCritChance\(/)
})

test('Heavy Metal protege proximo golpe e informa ativacao',()=>{
 const attack=heroPvpAttack({heroId:'pecado_diane',damage:600,attackIndex:5,masteryStage:3,state:{}})
 assert.equal(attack.technique,'Heavy Metal')
 const first=heroPvpDefense({heroId:'pecado_diane',damage:1000,state:attack.state,gear:{defense:.02}})
 assert.equal(first.damage,895)
 assert.equal(first.technique,'Heavy Metal')
 const second=heroPvpDefense({heroId:'pecado_diane',damage:1000,state:first.state,gear:{defense:.02}})
 assert.equal(second.damage,955)
 assert.equal(second.technique,null)
 const report=formatPvpBattleReport({
  ok:true,opening:{attacker:{jid:'a',name:'Diane',hp:1000,maxHp:1000,spd:200},
   defender:{jid:'b',name:'Joao',hp:1000,maxHp:1000,spd:190}},
  log:[{round:1,from:'Joao',fromJid:'b',to:'Diane',toJid:'a',dmg:895,actualDamage:895,
   hp:105,defenseTechnique:'Heavy Metal',defenseBlocked:105}],
  winner:{jid:'b',name:'Joao',hp:100},loser:{jid:'a',name:'Diane',hp:0},roundCount:1,reward:1
 })
 assert.match(report,/Diane ativou \*Heavy Metal\*/)
 assert.match(report,/105 dano/)
})

test('atribuicao de esquiva separa pet de classe e calcula bonus sobre mesmo estado defensivo',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 assert.match(db,/petDodge:dodged,/)
 assert.doesNotMatch(db,/petDodge:dodged\|\|Boolean\(defense\.dodged\)/)
 assert.match(db,/state:heroDefenseStateBefore,gear:to\.heroGear/)
})
