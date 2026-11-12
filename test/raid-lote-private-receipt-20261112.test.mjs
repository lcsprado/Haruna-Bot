import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatRaidLotePrivateReceipt,flushRaidLoteNotices,createRaidLoteNoticeWorker} from '../src/neon/raid-lote-notice-outbox.js'

const job={id:'5aa5b58e-1f08-4ddf-921e-c9a1f7f896ae',jid:'5511987308687@s.whatsapp.net',
 status:'won',level:75,requested:10,started:10,won_count:10,total_paid:5_280_000}
const records=Array.from({length:10},(_,i)=>({seq:i+1,status:'won',
 reward_summary:{rewards:[{cash:506880,exp:17400,petXp:1680,masteryXp:0,
   material:{id:'fragmento_ascensao_pecados_20261024',name:'Fragmento da Ascensão',qty:4}}]}}))

test('recibo detalhado confere as 10 raids reais, sem inventar premios',()=>{
 const text=formatRaidLotePrivateReceipt(job,records)
 assert.match(text,/10\/10 vitórias/)
 assert.match(text,/R\$ 5\.068\.800/)
 assert.match(text,/XP do jogador: \+174\.000/)
 assert.match(text,/XP dos pets: \+16\.800/)
 assert.match(text,/Fragmentos\/materiais ganhos: \+40/)
 assert.match(text,/Fragmento da Ascensão ×40/)
 assert.match(text,/recompensas já contabilizadas/i)
 assert.match(text,/5aa5b58e/)
})
test('relatorio ignora tentativas perdidas e nao duplica XP de bonus',()=>{
 const r=[{status:'won',reward_summary:{rewards:[{cash:100,exp:150,baseExp:100,xpBoostBonus:50,material:{id:'x',name:'X',qty:2}}]}},
          {status:'lost',reward_summary:{rewards:[{cash:10000,exp:10000,material:{id:'x',name:'X',qty:100}}]}}]
 const text=formatRaidLotePrivateReceipt({...job,status:'lost',requested:2,started:2},r)
 assert.match(text,/XP do jogador: \+150/)
 assert.match(text,/Bônus de ampulheta\/elixir: \+50 XP \(incluído/)
 assert.match(text,/Fragmentos\/materiais ganhos: \+2/)
 assert.doesNotMatch(text,/10\.000 XP|Fragmentos\/materiais ganhos: \+102/)
})
function fakeDb(){
 const state={sent:false,attempts:0,claimable:true,updates:[]}
 const db={async query(sql,params=[]){
  state.updates.push(sql)
  if(sql.includes('WITH chosen AS')){
   if(!state.claimable||state.sent)return {rows:[]}
   state.attempts++;state.claimable=false
   return {rows:[{job_id:job.id,jid:job.jid,attempts:state.attempts}]}
  }
  if(sql.includes('FROM raid_lote_jobs WHERE id=$1 AND jid=$2'))return {rows:[job]}
  if(sql.includes('FROM raid_lote_attempts'))return {rows:records}
  if(sql.includes("SET status='retry'")){state.claimable=true;return {rows:[],rowCount:1}}
  if(sql.includes("SET status='sent'")){state.sent=true;return {rows:[],rowCount:1}}
  throw new Error('Unexpected query '+sql.slice(0,100))
 }}
 return {db,state}
}
test('conexao fechada nao tenta mandar nem consome aviso',async()=>{
 const {db,state}=fakeDb()
 const sent=[]
 const result=await flushRaidLoteNotices({db,sendMessage:async(...args)=>sent.push(args),isConnected:()=>false})
 assert.deepEqual(result,{sent:0,retry:0,pending:0})
 assert.equal(state.updates.length,0)
 assert.equal(sent.length,0)
})
test('Connection Closed gera retry e envio posterior unico, sem repetir recompensas',async()=>{
 const {db,state}=fakeDb()
 let connected=true,fail=true
 const sent=[]
 const sendMessage=async(jid,report)=>{
   if(fail)throw new Error('Connection Closed')
   sent.push({jid,report})
 }
 const context={db,sendMessage,isConnected:()=>connected}
 const first=await flushRaidLoteNotices(context,{max:1})
 assert.equal(first.retry,1)
 assert.equal(state.sent,false)
 assert.equal(sent.length,0)
 connected=false
 const offline=await flushRaidLoteNotices(context)
 assert.equal(offline.sent,0)
 assert.equal(state.attempts,1)
 connected=true;fail=false
 const recovered=await flushRaidLoteNotices(context)
 assert.equal(recovered.sent,1)
 assert.equal(state.sent,true)
 assert.equal(sent.length,1)
 assert.equal(sent[0].jid,job.jid)
 assert.match(sent[0].report,/XP do jogador: \+174\.000/)
 assert.match(sent[0].report,/Fragmentos\/materiais ganhos: \+40/)
 const duplicate=await flushRaidLoteNotices(context)
 assert.equal(duplicate.sent,0)
 assert.equal(sent.length,1)
})
test('so envia para JID privado telefonico validado',async()=>{
 const {db}=fakeDb()
 const sent=[]
 db.query=async(sql)=>{
  if(sql.includes('WITH chosen AS'))return {rows:[{job_id:job.id,jid:'182080927494206@lid',attempts:1}]}
  if(sql.includes("SET status='retry'"))return {rows:[],rowCount:1}
  throw new Error('Nao deve consultar report ou enviar a LID')
 }
 const r=await flushRaidLoteNotices({db,sendMessage:async(...args)=>sent.push(args),isConnected:()=>true},{max:1})
 assert.equal(r.retry,1)
 assert.equal(sent.length,0)
})
test('runner segura execucao simultanea e exige intervalo real',async()=>{
 const {db}=fakeDb()
 const runner=createRaidLoteNoticeWorker({db,sendMessage:async()=>{},isConnected:()=>false})
 assert.throws(()=>runner.start({intervalMs:100}),/8 segundos/)
 assert.deepEqual(await runner.tickOnce(),{sent:0,retry:0,pending:0})
})
test('o credito da Raid e aviso sao transacionais e independentes de WhatsApp',()=>{
 const store=readFileSync(new URL('../src/neon/raid-lote-store.js',import.meta.url),'utf8')
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const p=store.indexOf('export async function settleRaidLoteAttempt')
 const fn=store.slice(p)
 assert.ok(p>=0)
 assert.match(fn,/await enqueueRaidLoteNotice\(c,job.id,job.jid\)/)
 assert.ok(fn.indexOf('enqueueRaidLoteNotice(c,job.id,job.jid)')<fn.indexOf('return {status:finishedStatus'))
 assert.match(store,/await initRaidLoteNoticeOutbox\(db\)/)
 assert.match(index,/createRaidLoteNoticeWorker\(/)
 assert.match(index,/isConnected:\(\)=>trevoHealth.whatsapp==='open'/)
 assert.doesNotMatch(index,/onFinished:async\(jid,jobId,result\)/)
 assert.match(index,/\['recibo','comprovante'\]\.includes\(action\)/)
 assert.match(index,/formatRaidLoteMaterials\(reports\)/)
 assert.match(index,/XP jogador: \+/)
})
