import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {startTimedRaidLoteSession,reserveNextRaidLoteAttempt} from '../src/neon/raid-lote-store.js'

test('Carpinar bloqueia Raidlote em todas as rotas de entrada, com o mesmo lock de usuário',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
  const start=db.slice(db.indexOf('export async function startPlayerCarpinar'),db.indexOf('export async function leavePlayerCarpinarEarly'))
  assert.match(start,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/)
  assert.match(start,/\['raid-membership:'\+jid\]/)
  assert.match(start,/to_regclass\('raid_lote_jobs'\)/)
  assert.match(start,/SELECT 1 FROM raid_lote_jobs WHERE jid=\$1 AND status IN \('queued','running'\)/)
  assert.match(start,/RaidLote em andamento/)
  const timed=store.slice(store.indexOf('export async function startTimedRaidLoteSession'),store.indexOf('export async function getRaidLoteJob'))
  const prepaid=store.slice(store.indexOf('export async function purchaseRaidLote'),store.indexOf('export async function startTimedRaidLoteSession'))
  const reserve=store.slice(store.indexOf('export async function reserveNextRaidLoteAttempt'),store.indexOf('export async function attachRaidLoteAttempt'))
  for(const block of [timed,prepaid,reserve]){
    assert.match(block,/SELECT 1 FROM player_carpinar WHERE jid=\$1 AND ends_at>EXTRACT\(EPOCH FROM NOW\(\)\)::BIGINT/)
  }
  for(const block of [timed,prepaid])assert.match(block,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/)
})

function fakeConnection(run){
  const statements=[]
  return {
    statements,
    db:{connect:async()=>({release(){},async query(sql,params=[]){
      statements.push({sql,params})
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]}
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]}
      return run(sql,params)
    }})}
  }
}

test('carpinar ativo impede iniciar nova sessão Raidlote V2, sem debitar saldo',async()=>{
  const old=process.env.ALPHA_REBOOT_MODE
  process.env.ALPHA_REBOOT_MODE='classes_only'
  try{
    const f=fakeConnection((sql)=>{
      if(sql.includes('SELECT * FROM raid_lote_jobs WHERE jid=$1 AND request_key=$2'))return {rows:[]}
      if(sql.includes('SELECT 1 FROM raid_lote_jobs WHERE jid=$1'))return {rows:[]}
      if(sql.includes('SELECT 1 FROM trevo_games')){
        assert.match(sql,/FROM player_carpinar/)
        return {rows:[{activity:'carpinar'}]}
      }
      throw Error('SQL inesperado: '+sql.slice(0,80))
    })
    await assert.rejects(()=>startTimedRaidLoteSession(f.db,{
      jid:'test-carpinar@s.whatsapp.net',level:20,durationHours:4,
      requestKey:'carpinar-mutual-exclusion-001',confirmed:true
    },{getCatalog:async()=>[{level:20,minLevel:20,keyPrice:2000}]}),/encerre o Carpinar/)
    assert.equal(f.statements.some(({sql})=>/INSERT INTO raid_lote_jobs|UPDATE wallets|UPDATE inventories/.test(sql)),false)
    assert.ok(f.statements.some(({sql})=>sql==='ROLLBACK'))
  }finally{
    if(old===undefined)delete process.env.ALPHA_REBOOT_MODE
    else process.env.ALPHA_REBOOT_MODE=old
  }
})

test('carpinar ativo pausa a reserva do Raidlote e nao cobra tentativa',async()=>{
  const jid='test-carpinar@s.whatsapp.net'
  const job={id:'11111111-1111-4111-8111-111111111111',jid,level:20,
    status:'queued',billing_mode:'per_attempt',session_ends_at:new Date(Date.now()+3600000),
    started:0,requested:1000000,cancel_requested:false,current_attempt_id:null}
  const f=fakeConnection((sql)=>{
    if(sql.includes('SELECT jid FROM raid_lote_jobs WHERE id=$1'))return {rows:[{jid}]}
    if(sql.includes('SELECT * FROM raid_lote_jobs WHERE id=$1'))return {rows:[job]}
    if(sql.includes('SELECT 1 FROM trevo_games')){
      assert.match(sql,/FROM player_carpinar/)
      return {rows:[{}]}
    }
    throw Error('SQL inesperado: '+sql.slice(0,80))
  })
  const result=await reserveNextRaidLoteAttempt(f.db,job.id,{getCatalog:()=>[{level:20,keyId:'chave_raid_20'}]})
  assert.equal(result.status,'player_busy')
  assert.equal(f.statements.some(({sql})=>/INSERT INTO raid_lote_attempts|UPDATE wallets|UPDATE inventories|INSERT INTO transactions/.test(sql)),false)
  assert.ok(f.statements.some(({sql})=>sql==='COMMIT'))
})
