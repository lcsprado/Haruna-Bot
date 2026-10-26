import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 HALLOWEEN_TICK_MS,halloweenAttackInterval,halloweenAttackDue,
 halloweenNextAttackAt,halloweenOrderedAttackers
} from '../src/neon/halloween-combat.js'

const halloween=readFileSync(new URL('../src/neon/halloween-alpha.js',import.meta.url),'utf8')
function countAttacks(speed,ticks=240){
 let last=0,count=0
 for(let n=1;n<=ticks;n++){
  const now=n*HALLOWEEN_TICK_MS
  const due=halloweenAttackDue(now,last,speed)
  for(let k=0;k<due.slots;k++){
   last=halloweenNextAttackAt(now,last,due.interval)
   count++
  }
 }
 return count
}
test('VEL aumenta frequência moderadamente, sem encurtar o tick global nem gerar ataque infinito',()=>{
 assert.equal(halloweenAttackInterval(100),10000)
 assert.ok(halloweenAttackInterval(250)<halloweenAttackInterval(100))
 assert.equal(halloweenAttackInterval(400),8000)
 assert.equal(halloweenAttackInterval(100000),8000)
 const low=countAttacks(100),high=countAttacks(350)
 assert.ok(high>low, `VEL maior não gerou golpes adicionais: ${low}/${high}`)
 assert.ok(high<=Math.ceil(low*1.25)+1)
})
test('esquiva consome tempo de ataque; delay longo não concede 12 rodadas retroativas',()=>{
 assert.equal(halloweenAttackDue(25000,0,250).slots,1)
 assert.equal(halloweenAttackDue(50000,33000,400).slots,2)
 assert.equal(halloweenAttackDue(80000,10000,400).slots,1)
 assert.equal(halloweenNextAttackAt(80000,10000,8000),80000)
 assert.equal(halloweenAttackDue(15000,10000,100).slots,0)
})
test('ao menos um ataque por jogador precede o segundo da mesma rodada',()=>{
 const tick=halloween.split('async function tickHalloween(){')[1].split('async function buyCorcel(')[0]
 assert.match(tick,/for\(let pass=0;pass<2&&hp>0;pass\+\+\)/)
 assert.match(tick,/if\(pass>=entry.due.slots\)continue/)
 assert.match(tick,/halloweenNextAttackAt\(now,Number\(row.last_attack\|\|0\),entry.due.interval\)/)
 assert.doesNotMatch(tick,/LIMIT 30/)
})
test('VEL desempata oportunidades simultâneas; empates perfeitos se alternam a cada tick',()=>{
 const now=100000
 const fast={jid:'fast',speed:400,last_attack:now-8000}
 const slow={jid:'slow',speed:100,last_attack:now-10000}
 assert.equal(halloweenOrderedAttackers([slow,fast],now)[0].jid,'fast')
 const a=[{jid:'A',speed:200,last_attack:now-9000},{jid:'B',speed:200,last_attack:now-9000}]
 assert.notEqual(halloweenOrderedAttackers(a,100000)[0].jid,halloweenOrderedAttackers(a,110000)[0].jid)
})
test('combat snapshot inclui velocidade real, encantamentos, sinergia e bônus de pet',()=>{
 const snapshot=halloween.split('async function snapshotPower(c,jid){')[1].split('async function savePowerSnapshot(')[0]
 assert.match(snapshot,/spd,class_id,class_applied/)
 assert.match(snapshot,/getEquippedEnchants\(c,jid,ids\)/)
 assert.match(snapshot,/profileCombatPetBonuses\(primary,pets\)/)
 assert.match(snapshot,/petTeamSynergy\(pets\)/)
 assert.match(snapshot,/petCombatSpecialty\(activePet.species\)\.speed/)
 assert.match(snapshot,/classCritBonus\(st.class_id,st.class_applied,awakeningStage,'boss'\)/)
 assert.match(snapshot,/activeRelic\(c,jid\)/)
})
test('pet e classe podem esquivar da retaliação, sem receber dano; ataque do boss esquivado não gera golpe',()=>{
 const retaliation=halloween.split('async function applyRetaliation(')[1].split('async function tickHalloween(')[0]
 const tick=halloween.split('async function tickHalloween(')[1].split('async function buyCorcel(')[0]
 assert.match(retaliation,/const petDodged=Math.random\(\)</)
 assert.match(retaliation,/classDefense\(\{/)
 assert.match(retaliation,/player_evades=player_evades\+1/)
 assert.match(retaliation,/if\(petDodged\|\|defense.dodged\)/)
 assert.match(tick,/boss_evades=boss_evades\+\$1/)
 assert.match(tick,/attempts=attempts\+1/)
 assert.match(tick,/if\(hit>0\)await applyRetaliation/)
 assert.match(tick,/classAttack\(\{/)
})
test('migração aditiva preserva pontos, XP, inventário e prêmios históricos',()=>{
 const init=halloween.split('export async function initHalloweenAlpha(){')[1].split('async function ensureDay(')[0]
 assert.match(init,/ADD COLUMN IF NOT EXISTS attempts/)
 assert.match(init,/UPDATE halloween_players_2026 SET attempts=hits WHERE attempts<hits/)
 assert.doesNotMatch(init,/DELETE FROM halloween_/)
 assert.doesNotMatch(init,/TRUNCATE/)
 const tick=halloween.split('async function tickHalloween(')[1].split('async function buyCorcel(')[0]
 assert.match(tick,/await milestoneReward\(/)
 assert.match(tick,/await maybeDrop\(/)
 assert.match(tick,/round_damage=0 WHERE active=TRUE/)
})

test('retaliação real usa o dano definido e atualiza HP do pet sem erro de execução',async()=>{
 const body=halloween.slice(halloween.indexOf('async function applyRetaliation('),halloween.indexOf('async function tickHalloween('))
 assert.doesNotMatch(body,/\bamount\b/)
 const math=Object.create(Math)
 math.random=()=>.99
 const calls=[]
 const query=async (sql,params=[])=>{
  calls.push({sql,params})
  if(sql.includes('SELECT hp,max_hp FROM stats'))return {rows:[{hp:650,max_hp:1000}]}
  if(sql.includes('SELECT hp,max_hp,energy FROM pets'))return {rows:[{hp:430,max_hp:600,energy:50}]}
  return {rows:[],rowCount:0}
 }
 const defense=({damage,awakeningState})=>({damage,dodged:false,awakeningState})
 const retaliate=new Function('classDefense','Math','return ('+body.trim()+')')(defense,math)
 await retaliate({query},{
  jid:'test-jid',hits:12,defense:100,mitigation:.03,mystic_guard:0,
  dodge:0,awakening_state:{},effective_max_hp:1000,class_id:'paladin',
  class_applied:true,awakening_stage:0
 },{atk:255},1)
 const petUpdate=calls.find(c=>c.sql.includes('UPDATE pets SET hp='))
 assert.ok(petUpdate,'pet must receive an actual retaliation update')
 assert.ok(petUpdate.params[0]<430)
})
test('esquiva de classe impede perda de HP e de energia do pet',async()=>{
 const body=halloween.slice(halloween.indexOf('async function applyRetaliation('),halloween.indexOf('async function tickHalloween('))
 const math=Object.create(Math)
 math.random=()=>.99
 const calls=[]
 const query=async(sql,params=[])=>{
  calls.push({sql,params})
  if(sql.includes('SELECT hp,max_hp FROM stats'))return {rows:[{hp:650,max_hp:1000}]}
  return {rows:[],rowCount:0}
 }
 const defense=({awakeningState})=>({damage:0,dodged:true,awakeningState})
 const retaliate=new Function('classDefense','Math','return ('+body.trim()+')')(defense,math)
 await retaliate({query},{
  jid:'test-jid',hits:12,defense:100,dodge:0,mitigation:0,
  awakening_state:{},effective_max_hp:1000,class_id:'monk',
  class_applied:true,awakening_stage:1
 },{atk:255},1)
 assert.ok(calls.some(c=>c.sql.includes('player_evades=player_evades+1')))
 assert.ok(!calls.some(c=>c.sql.includes('UPDATE pets SET hp=')))
})
