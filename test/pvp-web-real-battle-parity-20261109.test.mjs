import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {heroCombatStats,heroEffectiveCombatHp,heroHpToPersistent,heroCollabGearBonus,heroPvpAttack,heroPvpDefense} from '../src/neon/playable-heroes-core.js'
import {classPvpAttack,classPvpDefense} from '../src/neon/pvp-class-powers.js'
import {classCombatStats,classCombatHp,classPersistentHp} from '../src/neon/class-combat-balance.js'
import {pvpCritChance} from '../src/neon/pvp-crit.js'
import {antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier,ANTI_CRIT_SHIELDS} from '../src/neon/anti-crit-shields.js'
import {applyVitalCombatHp,vitalPulseHeal} from '../src/neon/vital-pets.js'

const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const battleSource=source.split('export async function battle(')[1]?.split('export async function ')[0]
assert.ok(battleSource,'battle() deveria existir em src/neon/db.js')

function fixture({attackerHero=null,defenderHero=null,attackerClass='samurai',defenderClass='paladin',
 attackerShield=null,defenderShield='escudo_runico',weaponCrit=0,starred=true,seed=0.31}={}){
 const ids=['alpha_a','alpha_b']
 const users=Object.fromEntries(ids.map((jid,i)=>[jid,{jid,push_name:i?'Defensor':'Atacante',level:500,exp:1000}]))
 const stats={
  alpha_a:{jid:'alpha_a',hp:6500,max_hp:6500,atk:1250,def:800,spd:480,class_id:attackerClass,class_applied:true,weapon_id:weaponCrit?'test_weapon':null,armor_id:null,boot_id:null,helmet_id:null,shield_id:attackerShield,win:0,loss:0},
  alpha_b:{jid:'alpha_b',hp:6500,max_hp:6500,atk:1100,def:910,spd:410,class_id:defenderClass,class_applied:true,weapon_id:null,armor_id:null,boot_id:null,helmet_id:null,shield_id:defenderShield,win:0,loss:0}
 }
 const heroRows=[
  ...(attackerHero?[{jid:'alpha_a',hero_species:attackerHero,mastery_stage:5,hero_level:100}]:[]),
  ...(defenderHero?[{jid:'alpha_b',hero_species:defenderHero,mastery_stage:4,hero_level:100}]:[])
 ]
 const sqls=[]
 const client={async query(sql,params=[]){
  const q=String(sql).replace(/\s+/g,' ').trim()
  sqls.push({q,params})
  if(q.includes('FROM player_sleep')||q.includes('FROM player_carpinar'))return {rows:[]}
  if(q.startsWith('SELECT jid,push_name,level,exp FROM users WHERE jid=$1'))return {rows:[users[params[0]]]}
  if(q.startsWith('SELECT * FROM stats WHERE jid=$1'))return {rows:[stats[params[0]]]}
  if(q.startsWith('SELECT jid,name,species,level,hp,energy FROM pets'))return {rows:[]}
  if(q.includes('FROM pet_team t')&&q.includes('JOIN pet_collection p'))return {rows:[]}
  if(q.includes('FROM player_hero_mode m'))return {rows:heroRows}
  if(q.includes('FROM player_awakenings'))return {rows:[{jid:'alpha_a',stage:5},{jid:'alpha_b',stage:3}]}
  if(q.includes('FROM player_class_levels'))return {rows:[{jid:'alpha_a',class_id:attackerClass,level:100},{jid:'alpha_b',class_id:defenderClass,level:100}]}
  if(q.includes('FROM equipment_upgrades'))return {rows:[
   ...(weaponCrit?[{jid:'alpha_a',item_id:'test_weapon',level:10}]:[]),
   ...(attackerShield?[{jid:'alpha_a',item_id:attackerShield,level:10}]:[]),
   ...(defenderShield?[{jid:'alpha_b',item_id:defenderShield,level:10}]:[])
  ]}
  if(q.includes('FROM equipment_enchantments'))return {rows:[]}
  if(q.includes('FROM equipment_star_forges'))return {rows:starred?[
   ...(attackerShield?[{jid:'alpha_a',item_id:attackerShield,stars:5,level:10}]:[]),
   ...(defenderShield?[{jid:'alpha_b',item_id:defenderShield,stars:5,level:10}]:[])
  ]:[]}
  if(q.startsWith('UPDATE stats SET hp=')||q.startsWith('UPDATE wallets SET cash=')||q.startsWith('INSERT INTO transactions'))return {rows:[],rowCount:1}
  throw new Error('SQL da fixture nao reconhecido: '+q.slice(0,220))
 }}
 let sequence=0
 const rng=()=>{sequence++;return (seed+(sequence*0.031))%1}
 const fakeMath=Object.create(Math)
 Object.defineProperty(fakeMath,'random',{value:rng})
 const dependencies={
  ensureUser:async()=>{},
  transaction:async callback=>callback(client),
  claimCooldown:async()=>({ok:true}),
  petTeamSynergy:()=>({}),
  petPvpSpecialty:()=>({}),
  petSpeedBonus:()=>0,
  equipmentStatsAtLevel:(id)=>id==='test_weapon'?{atk:0,def:0,hp:0,spd:0,crit:weaponCrit}:null,
  getDoubleEventMultiplier:async()=>1,
  getPetXpEventMultiplier:async()=>1,
  applyExp:async(_client,jid,xp)=>({jid,xp}),
  heroCombatStats,heroEffectiveCombatHp,heroHpToPersistent,heroCollabGearBonus,heroPvpAttack,heroPvpDefense,
  classPvpAttack,classPvpDefense,classCombatStats,classCombatHp,classPersistentHp,pvpCritChance,
  antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier,ANTI_CRIT_SHIELDS,
  applyVitalCombatHp,vitalPulseHeal,nowSql:'(EXTRACT(EPOCH FROM NOW())::BIGINT)',
  Math:fakeMath
 }
 const battle=vm.runInNewContext('async function battle('+battleSource+'\nbattle',dependencies)
 return {battle:()=>battle('alpha_a','alpha_b'),sqls,stats}
}

test('PvP transacional: classes recebem Despertar e multiplicadores atuais',async()=>{
 const f=fixture({weaponCrit:.73,defenderShield:null})
 const r=await f.battle()
 assert.equal(r.ok,true)
 assert.equal(r.opening.attacker.heroId,null)
 assert.ok(r.opening.attacker.crit>.40,'critical nao pode permanecer com cap .40')
 assert.ok(r.roundCount>=1)
 assert.ok(r.log.length>0)
 assert.ok(r.pvpMetrics.alpha_a)
 assert.ok(f.sqls.some(x=>x.q.includes('FROM player_awakenings')))
 assert.ok(f.sqls.some(x=>x.q.includes('FROM player_class_levels')))
 assert.ok(f.sqls.filter(x=>x.q.startsWith('UPDATE stats SET hp=')).length===2)
})

test('PvP transacional: heroi substitui classe com maestria propria',async()=>{
 const f=fixture({attackerHero:'pecado_diane',defenderHero:'pecado_ban',defenderShield:null})
 const r=await f.battle()
 assert.equal(r.opening.attacker.heroId,'pecado_diane')
 assert.equal(r.opening.attacker.heroMasteryStage,5)
 assert.equal(r.opening.defender.heroId,'pecado_ban')
 assert.equal(r.opening.defender.heroMasteryStage,4)
 assert.ok(Number.isFinite(r.opening.attacker.maxHp))
 assert.ok(r.opening.attacker.maxHp>0)
 assert.ok(r.pvpMetrics.alpha_a)
})

test('PvP transacional: escudo forjado aplica resistencias reais',async()=>{
 const f=fixture({weaponCrit:.90,defenderShield:'escudo_runico',starred:true})
 const r=await f.battle()
 assert.equal(r.opening.defender.shieldName,'Escudo Rúnico')
 assert.equal(r.opening.defender.shieldCritResist,.1044)
 assert.equal(r.opening.defender.shieldCritGuard,.174)
 assert.ok(r.opening.attacker.crit>=1)
 assert.ok(r.log.some(x=>x.hasOwnProperty('crit')))
})

test('PvP transacional: recompensa registrada uma vez, sem acesso ao banco',async()=>{
 const f=fixture({attackerHero:'pecado_meliodas',defenderShield:'escudo_ferro'})
 const r=await f.battle()
 assert.equal(r.winXpGain,40)
 assert.equal(r.loseXpGain,15)
 assert.equal(f.sqls.filter(x=>x.q.startsWith('INSERT INTO transactions')).length,1)
 assert.equal(f.sqls.filter(x=>x.q.startsWith('UPDATE wallets SET cash=')).length,1)
 assert.equal(f.sqls.filter(x=>x.q.startsWith('UPDATE stats SET hp=')).length,2)
 assert.ok(r.winner.jid==='alpha_a'||r.winner.jid==='alpha_b')
})
