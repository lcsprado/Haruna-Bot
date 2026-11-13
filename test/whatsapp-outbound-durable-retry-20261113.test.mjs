import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createOutboundRetryStore} from '../src/neon/whatsapp-outbound-retry-store.js'
import {createDurableOutboundRetry} from '../src/neon/whatsapp-outbound-durable-retry.js'

const john='5511999000001@s.whatsapp.net'
const group='120363429534634131@g.us'
const packet=(id,text)=>({key:{id},message:{extendedTextMessage:{text}}})
function mockDatabase(){
  const data=new Map(), queries=[],errors=[]
  const db={query:async(sql,params=[])=>{
    queries.push({sql,params})
    if(sql.includes('CREATE TABLE')||sql.includes('CREATE INDEX')||sql.includes('DELETE FROM'))return {rows:[]}
    if(sql.includes('INSERT INTO')){
      const [id,chat,payload]=params
      if(!data.has(id))data.set(id,{chat,payload:JSON.parse(payload)})
      return {rows:[],rowCount:1}
    }
    if(sql.includes('SELECT payload')){
      const hit=data.get(params[0])
      return {rows:hit?[{payload:hit.payload}]:[]}
    }
    throw new Error('Unexpected query: '+sql.slice(0,60))
  }}
  const instance=()=>createDurableOutboundRetry({db,memory:createOutboundRetryStore(),log:(...args)=>errors.push(args)})
  return {db,data,queries,errors,instance}
}
test('recupera no novo processo o MESMO conteúdo para recriptografia do WhatsApp',async()=>{
  const mock=mockDatabase(),first=mock.instance()
  await first.init()
  const sent=packet('MESSAGE_001','🆘 NOVO CHAMADO ALPHA BOT: SUP-1234')
  assert.equal(await first.remember(sent,{chat:john,content:{text:'🆘 NOVO CHAMADO ALPHA BOT: SUP-1234'}}),true)
  assert.equal(mock.data.size,1)
  assert.equal((await first.lookup({id:'MESSAGE_001'})).source,'memory')
  // Reinicio do Render: novo Map vazio; mesmo banco persistente.
  const reboot=mock.instance()
  await reboot.init()
  const again=await reboot.lookup({id:'MESSAGE_001',remoteJid:john})
  assert.equal(again.source,'database')
  assert.deepEqual(again.message,sent.message)
  assert.equal((await reboot.lookup({id:'MESSAGE_001'})).source,'memory')
  assert.equal(mock.queries.filter(x=>x.sql.includes('INSERT INTO')).length,1)
})
test('recupera privados identificados como @lid e grupos sem depender de identificador da conversa',async()=>{
  const m=mockDatabase(),s=m.instance()
  await s.init()
  await s.remember(packet('M-LID','⚔️ RAIDLOTE — 40 FRAGMENTOS'),{
    chat:john,content:{text:'⚔️ RAIDLOTE — 40 FRAGMENTOS'}
  })
  await s.remember(packet('M-GROUP','🎯 AVISO GRUPO'),{chat:group,content:{text:'🎯 AVISO GRUPO'}})
  const next=m.instance()
  await next.init()
  assert.deepEqual((await next.lookup({id:'M-LID',remoteJid:'182080927494206@lid'})).message,
    {extendedTextMessage:{text:'⚔️ RAIDLOTE — 40 FRAGMENTOS'}})
  assert.equal((await next.lookup({id:'M-GROUP',remoteJid:group})).source,'database')
})
test('não grava mensagens recebidas, mídias, pacotes muito grandes ou destinatários inválidos',async()=>{
  const m=mockDatabase(),s=m.instance()
  await s.init()
  await s.remember(packet('MEDIA','blob'),{chat:john,content:{image:{data:'x'}}})
  await s.remember(packet('INVALID','private'),{chat:'unknown',content:{text:'private'}})
  await s.remember(packet('OVERSIZE','a'.repeat(32001)),{chat:john,content:{text:'a'.repeat(32001)}})
  assert.equal(m.data.size,0)
  const sql=m.queries.map(x=>x.sql).join(' ')
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS.*\b(auth|session|creds)\b/i)
  assert.ok(sql.includes('expires_at'))
  assert.ok(sql.includes("INTERVAL '48 hours'"))
})
test('falha de banco não impede envio nem reenvio na memória',async()=>{
  let fail=false,log=[]
  const m=mockDatabase()
  const db={query:async(...args)=>{if(fail)throw Object.assign(new Error('private text'),{code:'XX007'});return m.db.query(...args)}}
  const s=createDurableOutboundRetry({db,memory:createOutboundRetryStore(),log:(...args)=>log.push(args)})
  await s.init()
  fail=true
  const sent=packet('OFFLINE','mensagem')
  assert.equal(await s.remember(sent,{chat:john,content:{text:'mensagem'}}),true)
  assert.deepEqual((await s.lookup({id:'OFFLINE'})).message,sent.message)
  assert.deepEqual(log,[['write_failed','XX007']])
  assert.ok(!JSON.stringify(log).includes('private text'))
})
test('quando mensagem não existe, nunca fabrica payload vazio',async()=>{
  const m=mockDatabase(),s=m.instance()
  await s.init()
  assert.equal((await s.lookup({id:'nao-existe'})).message,undefined)
  assert.equal((await s.lookup({id:''})).source,'invalid')
})
test('integração: dispatcher armazena original e callback Baileys consulta o banco',()=>{
  const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(src,/await durableOutboundRetry\.init\(\)/)
  assert.match(src,/await lookupOutboundWithGrace\(k=>durableOutboundRetry\.lookup\(k\),key\)/)
  assert.match(src,/await durableOutboundRetry\.remember\(sent,\{chat:route\.chat,content\}\)/)
  assert.match(src,/return recovered\.message/)
  assert.doesNotMatch(src,/const original=outboundRetryStore\.getMessage\(key\)/)
})

test('PostgreSQL real: mensagem sobrevive ao reinicio e expira por SQL',async t=>{
  if(!process.env.OUTBOUND_RETRY_DB_URL){t.skip('Postgres opcional na execução local');return}
  const {default:pg}=await import('pg')
  const pool=new pg.Pool({connectionString:process.env.OUTBOUND_RETRY_DB_URL})
  const first=createDurableOutboundRetry({db:pool,memory:createOutboundRetryStore()})
  const second=createDurableOutboundRetry({db:pool,memory:createOutboundRetryStore()})
  try{
    await first.init()
    const id='retry-integration-'+Date.now()
    const sent=packet(id,'Recibo do RaidLote — sem recompensar novamente')
    await first.remember(sent,{chat:john,content:{text:'Recibo do RaidLote — sem recompensar novamente'}})
    await second.init()
    assert.deepEqual((await second.lookup({id,remoteJid:john})).message,sent.message)
    const found=await pool.query('SELECT chat_jid,expires_at>NOW() AS valid FROM whatsapp_outbound_retry WHERE message_id=$1',[id])
    assert.equal(found.rows[0].chat_jid,john)
    assert.equal(found.rows[0].valid,true)
    await pool.query("UPDATE whatsapp_outbound_retry SET expires_at=NOW()-INTERVAL '1 second' WHERE message_id=$1",[id])
    const third=createDurableOutboundRetry({db:pool,memory:createOutboundRetryStore()})
    await third.init()
    assert.equal((await third.lookup({id,remoteJid:john})).message,undefined)
  }finally{
    await pool.query("DELETE FROM whatsapp_outbound_retry WHERE message_id LIKE 'retry-integration-%'").catch(()=>{})
    await pool.end()
  }
})
