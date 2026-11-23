import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const storeSource=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
const waSource=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const carve=(source,begin,end)=>{
 const a=source.indexOf(begin),b=source.indexOf(end,a)
 assert.ok(a>=0&&b>a,`Trecho obrigatório ausente: ${begin}`)
 return source.slice(a,b).replace(/^export /,'')
}
const carpSource=carve(dbSource,'export async function startPlayerCarpinar(', 'export async function leavePlayerCarpinarEarly(')
const loteSource=carve(storeSource,'export async function startTimedRaidLoteSession(', 'export async function getRaidLoteJob(')

test('carpinar recusa Raidlote ativo no banco antes de alterar trabalho/HP',async()=>{
 const sql=[]
 const client={query:async(query,params)=>{
  sql.push(String(query))
  if(String(query).includes('pg_advisory_xact_lock'))return {rows:[]}
  if(String(query).includes('FROM raid_lote_jobs'))return {rows:[{active:true}],rowCount:1}
  throw Error('Consulta após bloqueio: '+query)
 }}
 const start=new Function('ensureUser','CARPINAR_PLANS','transaction','Math','Date',
   carpSource+'\nreturn startPlayerCarpinar;'
 )(async()=>{}, {8:{hours:8,xp:1450,cash:3200}},async run=>run(client),Math,Date)
 await assert.rejects(start('player@s.whatsapp.net',8),/Raidlote ativo/)
 assert.ok(sql[0].includes('pg_advisory_xact_lock'))
 assert.ok(sql[1].includes("status IN ('queued','running')"))
 assert.ok(sql.every(q=>!q.includes('INSERT INTO player_carpinar')))
})

test('raidlote recusa Carpinar ativo usando o mesmo advisory lock',async()=>{
 const sql=[]
 const client={query:async(query,params)=>{
  sql.push(String(query))
  if(String(query).includes('pg_advisory_xact_lock'))return {rows:[]}
  if(String(query).includes('FROM raid_lote_jobs')&&String(query).includes('request_key'))return {rows:[]}
  if(String(query).includes('FROM player_carpinar'))return {rows:[{active:true}]}
  throw Error('Consulta após bloqueio: '+query)
 }}
 const start=new Function('validateRequestKey','classesOnlyRebootEnabled',
  'raidLoteDurationPlan','assertRaid70V2Start','inTransaction','RAID_LOTE_V2_MAX_ATTEMPTS','RAID_LOTE_V1',
  loteSource+'\nreturn startTimedRaidLoteSession'
 )(()=>{},()=>true,h=>({hours:h}),()=>{},async(db,fn)=>fn(client),1000000,{minimumManualWins:3})
 await assert.rejects(start({},{
  jid:'player@s.whatsapp.net',level:25,durationHours:8,requestKey:'wa:'+'a'.repeat(64),confirmed:true
 },{getCatalog:async()=>[{level:25,keyId:'chave_raid_25',keyPrice:6000}]}),/carpindo/)
 assert.ok(sql[0].includes('pg_advisory_xact_lock'))
 assert.ok(sql.some(q=>q.includes('FROM player_carpinar')&&q.includes('ends_at>')))
 assert.ok(sql.every(q=>!q.includes('INSERT INTO raid_lote_jobs')))
})

test('WhatsApp nao oferece Carpinar com Raidlote ativo e revalida confirmacao numerica',()=>{
 assert.match(waSource,/const activeLote=await getRaidLoteJob\(db,sender\)/)
 const matches=waSource.match(/const activeLote=await getRaidLoteJob\(db,sender\)/g)||[]
 assert.ok(matches.length>=2,'menu e escolha numérica precisam bloquear Raidlote')
 const select=waSource.slice(waSource.indexOf("if(flow.stage==='carpinar_select')"),
   waSource.indexOf("if(flow.stage==='carpinar_exit_confirm')"))
 assert.ok(select.indexOf("const activeLote=await getRaidLoteJob")<
   select.indexOf('startPlayerCarpinar(sender,choice.hours)'))
 const cmd=waSource.slice(waSource.indexOf("if(cmd==='carpinar'){",waSource.indexOf("if(cmd==='carpinarsair'){")+500),
   waSource.indexOf('const EVENT_ACTION_CMDS'))
 assert.ok(cmd.includes("const activeLote=await getRaidLoteJob"))
 assert.ok(cmd.indexOf("const activeLote=await getRaidLoteJob")<cmd.indexOf("setQuickFlow(chat,sender,'carpinar_select'"))
})

test('carpinar bloqueia qualquer Raid ativa (raid e raid:25), inclusive lobby',()=>{
 assert.match(carpSource,/game_type='raid' OR game_type LIKE 'raid:%'/)
 assert.match(carpSource,/state->>'status' IN \('lobby','active'\)/)
 assert.match(carpSource,/pg_advisory_xact_lock\(hashtextextended/)
 assert.match(loteSource,/pg_advisory_xact_lock\(hashtextextended/)
})
