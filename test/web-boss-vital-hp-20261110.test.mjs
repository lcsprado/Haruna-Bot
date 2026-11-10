import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {projectBossVitalCombatHp} from '../src/neon/pve-vital-boss-projection.js'
import {restoreVitalPersistentHp,vitalPulseHeal} from '../src/neon/vital-pets.js'
import {persistHeroHpDelta} from '../src/neon/playable-heroes-core.js'
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const args={heroId:'pecado_diane',baseMaxHp:10000,baseHp:5000,petHpRate:.12,teamHpRate:.08,
 storedHp:5000,heroBaseMaxHp:10000,persistentMaxHp:10000}

test('AB-01 Boss: Vital aumenta HP temporário uma vez e 100 ataques não reboostam vida',()=>{
 const first=projectBossVitalCombatHp(args)
 assert.equal(first.maxHp,12000)
 assert.equal(first.hp,6000)
 assert.equal(first.reused,false)
 const prior={heroHpProjectionVersion:3,heroStoredHp:5000,heroLastHp:6000,
  heroCombatMaxHp:10000,heroPersistentMaxHp:10000,vitalCombatMaxHp:12000}
 for(let i=0;i<100;i++){
  const next=projectBossVitalCombatHp({...args,baseHp:6000,prior})
  assert.equal(next.hp,6000,'não multiplicar HP do herói em ataques consecutivos')
  assert.equal(next.maxHp,12000)
  assert.equal(next.reused,true)
 }
 assert.equal(restoreVitalPersistentHp(first.hp,first.maxHp,10000),5000)
})

test('AB-01 Boss: dano persiste como delta, sem bônus Vital virar cura',()=>{
 const prior={heroHpProjectionVersion:3,heroStoredHp:5000,heroLastHp:6000,
  heroCombatMaxHp:10000,heroPersistentMaxHp:10000,vitalCombatMaxHp:12000}
 const settled=persistHeroHpDelta({
  previousPersistentHp:5000,previousCombatHp:6000,currentCombatHp:5800,
  combatMaxHp:12000,persistentMaxHp:10000,remainder:0
 })
 assert.ok(settled.hp<5000)
 prior.heroStoredHp=settled.hp
 prior.heroLastHp=5800
 const next=projectBossVitalCombatHp({...args,storedHp:settled.hp,baseHp:5800,prior})
 assert.equal(next.hp,5800)
 assert.equal(next.reused,true)
})

test('AB-01 Boss: alterar pet ou sinergia conserva porcentagem, não multiplica HP',()=>{
 const prior={heroHpProjectionVersion:3,heroStoredHp:5000,heroLastHp:6000,
  heroCombatMaxHp:10000,heroPersistentMaxHp:10000,vitalCombatMaxHp:12000}
 const next=projectBossVitalCombatHp({...args,baseHp:6000,teamHpRate:0,prior})
 assert.equal(next.maxHp,11200)
 assert.equal(next.hp,5600,'de 6000/12000 para 5600/11200')
 assert.equal(next.reprojected,true)
 const external=projectBossVitalCombatHp({...args,storedHp:3500,baseHp:3500,prior})
 assert.equal(external.reused,false,'cura externa do HP persistido invalida cache')
 assert.equal(external.hp,4200)
})

test('AB-01 Boss: classe sem cache aplica HP apenas proporcional ao estado persistido',()=>{
 const first=projectBossVitalCombatHp({...args,heroId:null,prior:{},baseHp:3200,baseMaxHp:8000,petHpRate:.10,teamHpRate:.08})
 assert.equal(first.maxHp,9440)
 assert.equal(first.hp,3776)
 assert.equal(restoreVitalPersistentHp(first.hp,first.maxHp,8000),3200)
 const next=projectBossVitalCombatHp({...args,heroId:null,baseHp:3200,baseMaxHp:8000,petHpRate:.10,teamHpRate:.08,prior:{heroHpProjectionVersion:3,heroLastHp:6000,vitalCombatMaxHp:12000}})
 assert.equal(next.hp,3776)
})

test('AB-01 Boss: Coração Eterno é único, não ressuscita e nunca gera HP acima do teto',()=>{
 const heart=vitalPulseHeal(2500,10000,false,.05)
 assert.equal(heart.heal,500)
 assert.equal(vitalPulseHeal(heart.hp,10000,true,.05).heal,0)
 assert.equal(vitalPulseHeal(0,10000,false,.05).heal,0)
})

test('AB-01 Boss: produção fixa versão 3 compartilhada com WhatsApp e expõe o efeito no resultado',()=>{
 assert.match(games,/const vital=projectBossVitalCombatHp\(\{/)
 assert.match(games,/hero\.hp=heroCombatHp/)
 assert.match(games,/hero\.maxHp=effectiveMaxHp/)
 assert.match(games,/hero\.heroLastHp=heroCombatHp/)
 assert.match(games,/heroHpProjectionVersion:heroId\?3:undefined/)
 assert.match(games,/vitalCombatMaxHp:effectiveMaxHp/)
 assert.match(games,/vitalPulseHeal\(php,effectiveMaxHp,/)
 assert.match(games,/s\.participants\[jid\]\.vitalPulseUsed=true/)
 assert.match(games,/vitalPulseEvent,\s*petSwitch/)
 assert.match(games,/restoreVitalPersistentHp\(php,effectiveMaxHp,Number\(st\.max_hp\)\+gearHp\)/)
})
