import test from 'node:test'
import assert from 'node:assert/strict'
import {
  purchaseRaidLote,reserveNextRaidLoteAttempt,cancelRaidLote,raidLoteRoomId
} from '../src/neon/raid-lote-store.js'

const catalog=()=>[{level:75,minLevel:70,keyPrice:480000}]
const order={jid:'test-player@s.whatsapp.net',level:75,attempts:10,requestKey:'wamsg-unique-0001',confirmed:true}
function dbForPurchase({cash=2000000,bank=4000000,purchased=0,wins=3,prior=null,active=false,publicRaid=false,failOnLog=false}={}){
  const statements=[],amounts={wallet:null,city:null,keys:null,service:null},events=[]
  let tx=false
  const db={connect:async()=>({
    release(){events.push('RELEASE')},
    async query(sql,params=[]){
      statements.push({sql,params})
      if(sql==='BEGIN'){tx=true;events.push('BEGIN');return {rows:[]}}
      if(sql==='COMMIT'){tx=false;events.push('COMMIT');return {rows:[]}}
      if(sql==='ROLLBACK'){tx=false;events.push('ROLLBACK');return {rows:[]}}
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]}
      if(sql.includes('SELECT * FROM raid_lote_jobs WHERE jid=$1 AND request_key=$2'))return {rows:prior?[prior]:[]}
      if(sql.includes('SELECT 1 FROM raid_lote_jobs'))return {rows:active?[{exists:1}]:[]}
      if(sql.includes('COALESCE(SUM(requested),0)'))return {rows:[{purchased}]}
      if(sql.includes('SELECT 1 FROM trevo_games'))return {rows:publicRaid?[{}]:[]}
      if(sql.includes('SELECT level FROM users'))return {rows:[{level:500}]}
      if(sql.includes('SELECT hp FROM stats'))return {rows:[{hp:5000}]}
      if(sql.includes('COUNT(*)::int AS n FROM transactions'))return {rows:[{n:wins}]}
      if(sql.includes('SELECT cash,bank FROM wallets'))return {rows:[{cash,bank}]}
      if(sql.includes('UPDATE wallets SET cash=')){amounts.wallet=params;return {rows:[]}}
      if(sql.includes('INSERT INTO raid_lote_jobs')){amounts.job=params;return {rows:[]}}
      if(sql.includes('UPDATE raid_lote_municipality')){amounts.city=params;return {rows:[]}}
      if(sql.includes('INSERT INTO transactions')){
        if(failOnLog)throw new Error('injected ledger failure')
        amounts.keys=params[1];amounts.service=params[2]
        return {rows:[]}
      }
      throw new Error('SQL not mocked: '+sql.slice(0,75))
    }
  })}
  return {db,statements,events,amounts,get inTransaction(){return tx}}
}
test('compra antecipada debita tudo uma vez e credita taxa na Prefeitura',async()=>{
  const f=dbForPurchase()
  const r=await purchaseRaidLote(f.db,order,{getCatalog:catalog})
  assert.equal(r.quote.totalPrice,5280000)
  assert.equal(r.alreadyPurchased,false)
  assert.deepEqual(f.amounts.wallet,[2000000,3280000,order.jid])
  assert.deepEqual(f.amounts.city,[480000])
  assert.equal(f.amounts.keys,4800000)
  assert.equal(f.amounts.service,480000)
  assert.equal(f.amounts.job[8],5280000)
  assert.deepEqual(f.events,['BEGIN','COMMIT','RELEASE'])
  assert.equal(f.inTransaction,false)
  assert.equal(f.statements.filter(x=>x.sql.includes('UPDATE wallets SET cash=')).length,1)
})
test('mesmo ID de compra nao debita novamente apos retry',async()=>{
  const f=dbForPurchase({prior:{id:'job-1',jid:order.jid,level:75,requested:10,
    key_price:480000,keys_total:4800000,fee_total:480000,total_paid:5280000,status:'lost'}})
  const r=await purchaseRaidLote(f.db,order,{getCatalog:catalog})
  assert.equal(r.alreadyPurchased,true)
  assert.equal(r.quote.totalPrice,5280000)
  assert.equal(f.amounts.wallet,null)
  assert.deepEqual(f.events,['BEGIN','COMMIT','RELEASE'])
})
test('replay com parametros alterados e rejeitado',async()=>{
  const f=dbForPurchase({prior:{id:'job-1',level:75,requested:3}})
  await assert.rejects(()=>purchaseRaidLote(f.db,order,{getCatalog:catalog}),/divergente/)
  assert.deepEqual(f.events,['BEGIN','ROLLBACK','RELEASE'])
})
test('saldo insuficiente causa rollback sem cobrar taxa ou chaves',async()=>{
  const f=dbForPurchase({cash:100,bank:200})
  await assert.rejects(()=>purchaseRaidLote(f.db,order,{getCatalog:catalog}),/Saldo insuficiente/)
  assert.equal(f.amounts.wallet,null)
  assert.equal(f.amounts.city,null)
  assert.deepEqual(f.events,['BEGIN','ROLLBACK','RELEASE'])
})
test('falha no registro financeiro reverte a transacao',async()=>{
  const f=dbForPurchase({failOnLog:true})
  await assert.rejects(()=>purchaseRaidLote(f.db,order,{getCatalog:catalog}),/ledger failure/)
  assert.deepEqual(f.events,['BEGIN','ROLLBACK','RELEASE'])
})
test('limite de pacotes se aplica a TODAS as tentativas compradas',async()=>{
  const f=dbForPurchase({purchased:1})
  await assert.rejects(()=>purchaseRaidLote(f.db,order,{getCatalog:catalog}),/Limite de 10/)
  assert.equal(f.amounts.wallet,null)
})
test('exige tres vitorias manuais; bloqueia quando jogador ja esta ocupado',async()=>{
  const f=dbForPurchase({wins:2})
  await assert.rejects(()=>purchaseRaidLote(f.db,order,{getCatalog:catalog}),/3 vitorias/)
  const b=dbForPurchase({publicRaid:true})
  await assert.rejects(()=>purchaseRaidLote(b.db,order,{getCatalog:catalog}),/Raid em andamento/)
})
test('nao permite compra silenciosa sem confirmacao',async()=>{
  const f=dbForPurchase()
  await assert.rejects(()=>purchaseRaidLote(f.db,{...order,confirmed:false},{getCatalog:catalog}),/confirmacao/)
  assert.equal(f.statements.length,0)
})
test('reserva de tentativa usa sala privada e nao realiza nova cobranca',async()=>{
  const job={id:'job-1',jid:order.jid,status:'queued',started:0,requested:10,
    current_attempt_id:null,cancel_requested:false,level:75}
  let updates=0
  const seen=[]
  const db={connect:async()=>({
    release(){},
    async query(sql,params=[]){
      seen.push(sql)
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]}
      if(sql.includes('SELECT jid FROM raid_lote_jobs'))return {rows:[{jid:job.jid}]}
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]}
      if(sql.includes('SELECT * FROM raid_lote_jobs WHERE id='))return {rows:[job]}
      if(sql.includes('SELECT 1 FROM trevo_games'))return {rows:[]}
      if(sql.includes('INSERT INTO raid_lote_attempts'))return {rows:[]}
      if(sql.includes('UPDATE raid_lote_jobs')){updates++;return {rows:[]}}
      throw new Error('Not mocked: '+sql.slice(0,60))
    }
  })}
  const r=await reserveNextRaidLoteAttempt(db,job.id)
  assert.equal(r.status,'reserved')
  assert.equal(r.attempt.seq,1)
  assert.ok(r.attempt.raid_chat.startsWith('__alpha_raid_lote__:'))
  assert.equal(raidLoteRoomId(r.attempt.id),r.attempt.raid_chat)
  assert.equal(updates,1)
  assert.equal(seen.some(s=>/UPDATE wallets|INSERT INTO transactions/.test(s)),false)
})
test('ID de sala sintética exige UUID',()=>{
  assert.throws(()=>raidLoteRoomId('123'),/invalido/)
})
test('cancelamento nao altera carteira nem reembolsa tentativas',async()=>{
  const seen=[]
  const db={connect:async()=>({
    release(){},
    async query(sql){
      seen.push(sql)
      if(sql.includes('UPDATE raid_lote_jobs'))return {rows:[{id:'job',status:'cancelled',total_paid:5280000}]}
      return {rows:[]}
    }
  })}
  const r=await cancelRaidLote(db,order.jid)
  assert.equal(r.total_paid,5280000)
  assert.equal(seen.some(s=>/UPDATE wallets|INSERT INTO transactions/.test(s)),false)
})
