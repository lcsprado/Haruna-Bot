import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {classCombatStats,classCombatHp} from '../src/neon/class-combat-balance.js'
import {antiCritShieldStats,ANTI_CRIT_SHIELDS} from '../src/neon/anti-crit-shields.js'
import {getClassPassive,getPlayerClass,classCritBonus} from '../src/neon/game-catalog.js'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const web=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const body=db.split('export async function getCombatProfile(')[1]?.split('export async function ')[0]
assert.ok(body,'perfil de combate da Web deve existir')

const p=Object.freeze({
 jid:'fixture',level:500,class_id:'samurai',class_applied:true,class_level:100,
 max_hp:3000,hp:3000,atk:600,def:400,spd:240,
 weapon_id:'test_weapon',armor_id:null,boot_id:null,helmet_id:null,
 shield_id:'escudo_runico'
})

async function combatProfile(heroActive=false){
 const queries=[]
 const fakeDb={async query(sql){
  const statement=String(sql).replace(/\s+/g,' ').trim()
  queries.push(statement)
  if(statement.includes('FROM equipment_enchantments'))return {rows:[]}
  if(statement.startsWith('SELECT quantity FROM inventories'))return {rows:[{quantity:0}]}
  if(statement.includes('FROM player_hero_mode'))return {rows:heroActive?[{'?column?':1}]:[]}
  throw Error('consulta de perfil não simulada: '+statement.slice(0,150))
 }}
 const dependencies={
  getProfile:async()=>p,
  getEquipmentLevels:async()=>({test_weapon:10,escudo_runico:10}),
  getEquipmentStarLevels:async()=>({test_weapon:1,escudo_runico:5}),
  equipmentStatsAtLevel:(id,level,stars)=>id==='test_weapon'?{atk:20,def:0,hp:0,spd:0,crit:.35,name:'Arma Teste',level,stars}:null,
  classCombatStats,classCombatHp,antiCritShieldStats,ANTI_CRIT_SHIELDS,getClassPassive,getPlayerClass,
  classCritBonus,db:fakeDb,nowSql:'(EXTRACT(EPOCH FROM NOW())::BIGINT)'
 }
 const fn=vm.runInNewContext('async function getCombatProfile('+body+'\ngetCombatProfile',dependencies)
 return {profile:await fn(p.jid),queries}
}

test('perfil Web exibe critico acima de 40% e escudo ★5 correto',async()=>{
 const {profile}=await combatProfile(false)
 assert.ok(profile.effective_crit>.40)
 assert.equal(profile.shield_name,'Escudo Rúnico')
 assert.equal(profile.shield_stars,5)
 assert.equal(profile.shield_crit_resist,.1044)
 assert.equal(profile.shield_crit_guard,.174)
 assert.ok(profile.base_atk>p.atk)
})

test('perfil Web desliga bônus de classe com heroi ativo, sem tocar HP persistido',async()=>{
 const {profile,queries}=await combatProfile(true)
 assert.equal(profile.base_atk,p.atk)
 assert.ok(queries.some(q=>q.includes('FROM player_hero_mode')))
 assert.ok(queries.every(q=>!q.startsWith('UPDATE ')),'leitura de perfil nao deve atualizar HP valido')
})

test('perfil de grupo Web deixou de aplicar o cap 40% e detecta Despertar',()=>{
 const group=web.slice(web.indexOf('async function groupSnapshot('),web.indexOf('async function playerBootstrap('))
 assert.ok(group.includes('pvpCritChance('))
 assert.ok(group.includes('awakening_stage'))
 assert.ok(group.includes('player_hero_mode'))
 assert.doesNotMatch(group,/effective_crit:Math\.min\(\.40/)
})
