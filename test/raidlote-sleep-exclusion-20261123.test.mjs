import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {startTimedRaidLoteSession} from '../src/neon/raid-lote-store.js'
const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const a=source.indexOf('export async function startPlayerSleep(')
const b=source.indexOf('const CARPINAR_PLANS=',a)
assert.ok(a>=0&&b>a,'Funcao de dormir precisa existir')
const sleepSource=source.slice(a,b).replace(/^export /,'')
function makeSleep({raidActive=false,carpinarActive=false}={}){
 const statements=[]
 const client={query:async(sql)=>{
  statements.push(String(sql))
  if(String(sql).includes('pg_advisory_xact_lock'))return {rows:[]}
  if(String(sql).includes('FROM raid_lote_jobs'))return {rows:raidActive?[{active:true}]:[]}
  if(String(sql).includes('FROM player_carpinar'))return {rows:carpinarActive?[{ends_at:Math.floor(Date.now()/1000)+3600}]:[]}
  throw Error('Bloqueio deveria ocorrer antes da consulta: '+String(sql).slice(0,70))
 }}
 const start=new Function('ensureUser','SLEEP_CHOICES','transaction',
  sleepSource+'\nreturn startPlayerSleep;')(
   async()=>{},[1,4,8],async fn=>fn(client)
  )
 return {start,statements}
}

test('!dormir recusa Raidlote ativo antes de aluguel, XP e INSERT de sono',async()=>{
 const f=makeSleep({raidActive:true})
 await assert.rejects(f.start('player@s.whatsapp.net',1),/Raidlote ativo/)
 assert.match(f.statements[0],/pg_advisory_xact_lock/)
 assert.match(f.statements[1],/status IN \('queued','running'\)/)
 assert.equal(f.statements.some(x=>/player_sleep|UPDATE wallets|INSERT INTO transactions/.test(x)),false)
})

test('sono e Raidlote compartilham o mesmo advisory lock e verificam status aberto',()=>{
 const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
 const startV1=store.slice(store.indexOf('export async function purchaseRaidLote('),store.indexOf('export async function startTimedRaidLoteSession('))
 const startV2=store.slice(store.indexOf('export async function startTimedRaidLoteSession('),store.indexOf('export async function getRaidLoteJob('))
 for(const part of [startV1,startV2]){
  assert.match(part,/pg_advisory_xact_lock/)
  assert.match(part,/FROM player_sleep WHERE jid=\$1 AND ends_at>/)
  assert.match(part,/Você está dormindo/)
  assert.ok(part.indexOf('pg_advisory_xact_lock')<part.indexOf('FROM player_sleep'))
  assert.ok(part.indexOf('FROM player_sleep')<part.indexOf('INSERT INTO raid_lote_jobs'))
 }
 assert.match(sleepSource,/pg_advisory_xact_lock/)
 assert.ok(sleepSource.indexOf('FROM raid_lote_jobs')<sleepSource.indexOf('INSERT INTO player_sleep'))
})

test('Raidlote V2 recusa sono ativo antes de qualquer débito ou criação de job',async()=>{
 const calls=[]
 const db={connect:async()=>({release(){},async query(sql){
  calls.push(String(sql))
  if(['BEGIN','ROLLBACK','COMMIT'].includes(sql))return {rows:[]}
  if(String(sql).includes('pg_advisory_xact_lock'))return {rows:[]}
  if(String(sql).includes('SELECT * FROM raid_lote_jobs')&&String(sql).includes('request_key'))return {rows:[]}
  if(String(sql).includes('FROM player_carpinar'))return {rows:[]}
  if(String(sql).includes('FROM player_sleep'))return {rows:[{active:true}]}
  throw Error('Consulta indevida apos bloqueio: '+sql)
 }})}
 const old=process.env.ALPHA_REBOOT_MODE
 process.env.ALPHA_REBOOT_MODE='classes_only'
 try{
  await assert.rejects(startTimedRaidLoteSession(db,{jid:'player@s.whatsapp.net',level:25,durationHours:4,
   requestKey:'sleep-conflict-20261123',confirmed:true},{
   getCatalog:()=>[{level:25,keyId:'chave_raid_25',keyPrice:5000,minLevel:25}]
  }),/está dormindo/)
  assert.ok(calls.includes('ROLLBACK'))
  assert.ok(calls.some(x=>x.includes('FROM player_sleep')))
  assert.ok(calls.every(x=>!x.includes('UPDATE wallets')&&!x.includes('INSERT INTO raid_lote_jobs')))
 }finally{
  if(old===undefined)delete process.env.ALPHA_REBOOT_MODE
  else process.env.ALPHA_REBOOT_MODE=old
 }
})
