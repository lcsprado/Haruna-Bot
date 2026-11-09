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
const waSource=readFileSync(new URL('./fixtures/wa-pvp-engine-e431d8a2.txt',import.meta.url),'utf8')
const battleSource=source.split('export async function battle(')[1]?.split('export async function ')[0]
assert.ok(battleSource,'battle() deveria existir em src/neon/db.js')
const waBattleSource=waSource.split('export async function battle(')[1]?.split('export async function ')[0]
assert.ok(waBattleSource,'snapshot independente do WhatsApp deve existir')

function fixture({attackerHero=null,defenderHero=null,attackerClass='samurai',defenderClass='paladin',
 attackerShield=null,defenderShield='escudo_runico',weaponCrit=0,starred=true,seed=0.31,engine='web',attackerPet=null,defenderPet=null,teamSynergy=null}={}){
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
 const petRows=[
  ...(attackerPet?[{jid:'alpha_a',name:'Pet Atacante',species:attackerPet,level:100,hp:1000,energy:100}]:[]),
  ...(defenderPet?[{jid:'alpha_b',name:'Pet Defensor',species:defenderPet,level:100,hp:1000,energy:100}]:[])
 ]
 const teamRows=teamSynergy?[
  {jid:'alpha_a',species:attackerPet||'fenix_alpha',slot:1,level:100},
  {jid:'alpha_b',species:defenderPet||'lince_astral',slot:1,level:100}
 ]:[]
 const sqls=[]
 const client={async query(sql,params=[]){
  const q=String(sql).replace(/\s+/g,' ').trim()
  sqls.push({q,params})
  if(q.includes('FROM player_sleep')||q.includes('FROM player_carpinar'))return {rows:[]}
  if(q.startsWith('SELECT jid,push_name,level,exp FROM users WHERE jid=$1'))return {rows:[users[params[0]]]}
  if(q.startsWith('SELECT * FROM stats WHERE jid=$1'))return {rows:[stats[params[0]]]}
  if(q.startsWith('SELECT jid,name,species,level,hp,energy FROM pets'))return {rows:petRows}
  if(q.includes('FROM pet_team t')&&q.includes('JOIN pet_collection p'))return {rows:teamRows}
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
  petTeamSynergy:()=>teamSynergy?{collabCrit:.07,collabAttack:.09,speed:16,hp:.03,defense:.02,vitalPulse:.04}:{},
  petPvpSpecialty:species=>species===attackerPet?{crit:.20,damage:.08,defense:.03,dodge:.02,healPct:.10,healCooldown:3}:{crit:.05,damage:.03,defense:.04,dodge:.03,healPct:.08,healCooldown:4},
  petSpeedBonus:()=>0,
  equipmentStatsAtLevel:(id)=>{
   if(id==='test_weapon')return {atk:0,def:0,hp:0,spd:0,crit:weaponCrit}
   const shield=ANTI_CRIT_SHIELDS.find(s=>s.id===id)
   if(shield)return {...shield,...antiCritShieldStats(id,10,starred?5:1)}
   return null
  },
  getDoubleEventMultiplier:async()=>1,
  getPetXpEventMultiplier:async()=>1,
  applyExp:async(_client,jid,xp)=>({jid,xp}),
  heroCombatStats,heroEffectiveCombatHp,heroHpToPersistent,heroCollabGearBonus,heroPvpAttack,heroPvpDefense,
  classPvpAttack,classPvpDefense,classCombatStats,classCombatHp,classPersistentHp,pvpCritChance,
  antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier,ANTI_CRIT_SHIELDS,
  applyVitalCombatHp,vitalPulseHeal,nowSql:'(EXTRACT(EPOCH FROM NOW())::BIGINT)',
  Math:fakeMath
 }
 const battle=vm.runInNewContext('async function battle('+(engine==='wa'?waBattleSource:battleSource)+'\nbattle',dependencies)
 return {battle:()=>battle('alpha_a','alpha_b'),sqls,stats}
}


const normalized=result=>JSON.parse(JSON.stringify({
 opening:result.opening,
 ending:result.ending,
 log:result.log,
 pvpMetrics:result.pvpMetrics,
 roundCount:result.roundCount,
 decidedByLimit:result.decidedByLimit,
 winner:result.winner?.jid,
 loser:result.loser?.jid,
 reward:result.reward,
 winXpGain:result.winXpGain,
 loseXpGain:result.loseXpGain,
 final:result.final
}))
const scenarios=[
 {name:'Samurai e Paladino com Despertar e crítico 90%',attackerClass:'samurai',defenderClass:'paladin',weaponCrit:.80,defenderShield:null,seed:.28},
 {name:'Samurai enfrenta escudo Rúnico 5 estrelas',attackerClass:'samurai',defenderClass:'berserker',weaponCrit:.90,defenderShield:'escudo_runico',starred:true,seed:.35},
 {name:'Diane e Ban heróis 100 com maestrias',attackerHero:'pecado_diane',defenderHero:'pecado_ban',defenderShield:null,seed:.41},
 {name:'Meliodas e Diane com escudos forjados',attackerHero:'pecado_meliodas',defenderHero:'pecado_diane',defenderShield:'egide_celestial',attackerShield:'escudo_ferro',starred:true,seed:.51},
 {name:'Samurai crítico 100% contra Bastião do Eclipse ★5',attackerClass:'samurai',defenderClass:'samurai',weaponCrit:1,defenderShield:'bastiao_eclipse',seed:.62},
 {name:'Diane com pet crítico contra Paladino com pet de suporte',attackerHero:'pecado_diane',defenderClass:'paladin',attackerPet:'fenix_alpha',defenderPet:'lince_astral',defenderShield:'escudo_ferro',seed:.24},
 {name:'Samurai e Ban com sinergia, cura, defesa e crítico de pets',attackerClass:'samurai',defenderHero:'pecado_ban',attackerPet:'fenix_alpha',defenderPet:'lince_astral',teamSynergy:true,defenderShield:'egide_celestial',weaponCrit:.65,seed:.44}
]
for(const scenario of scenarios){
 test('paridade independente WA/Web: '+scenario.name,async()=>{
  const wa=fixture({...scenario,engine:'wa'})
  const web=fixture({...scenario,engine:'web'})
  const [oldResult,newResult]=await Promise.all([wa.battle(),web.battle()])
  assert.deepEqual(normalized(newResult),normalized(oldResult))
  assert.equal(wa.sqls.filter(x=>x.q.startsWith('UPDATE stats SET hp=')).length,2)
  assert.equal(web.sqls.filter(x=>x.q.startsWith('UPDATE stats SET hp=')).length,2)
  assert.equal(web.sqls.filter(x=>x.q.startsWith('INSERT INTO transactions')).length,1)
 })
}
