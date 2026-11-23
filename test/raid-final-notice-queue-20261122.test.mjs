import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const flushStart=src.indexOf('async function flushRaidFinalNotices()')
const persistStart=src.indexOf('async function persistRaidFinalNotice(',flushStart)
const flushEnd=persistStart
const persistEnd=src.indexOf('let raidAutoWatchdogBusy=',persistStart)
assert.ok(flushStart>=0&&persistStart>flushStart&&persistEnd>persistStart)

test('fila manual ignora registros tentados e salas internas, sem bloquear proximos avisos',async()=>{
  const sent=[],sql=[]
  const db={query:async(statement,params)=>{
    sql.push(statement)
    if(statement.startsWith('SELECT key,value FROM trevo_settings'))return {rows:[
      {key:'raid_final_notice_v2:123456789012@g.us:25',value:{chat:'123456789012@g.us',text:'🏆 Raid concluída',createdAt:1}},
      // Defesa em profundidade: mesmo se o banco retornar uma sala interna,
      // a rotina jamais pode tentar entrega WhatsApp para um JID fictício.
      {key:'raid_final_notice_v2:__alpha_raid_lote__:test:20',value:{chat:'__alpha_raid_lote__:test',text:'AVISO INVÁLIDO'}}
    ]}
    if(statement.startsWith('UPDATE trevo_settings'))return {rowCount:1,rows:[{key:params[0]}]}
    if(statement.startsWith('DELETE FROM trevo_settings'))return {rowCount:1}
    throw Error('SQL inesperado: '+statement)
  }}
  const flush=new Function('db','raidFinalNoticePrefix','safeRaidNotify',
    'raidAutoReply','trevoHealth','RAID_FINAL_NOTIFY_TIMEOUT_MS','console',
    "let raidFinalFlushBusy=false;\n"+src.slice(flushStart,flushEnd)+'\nreturn flushRaidFinalNotices'
  )(db,'raid_final_notice_v2:',async(send,message)=>send(message),
     async(chat,message)=>{sent.push({chat,message});return true},
     {whatsapp:'open'},12000,console)
  await flush()
  assert.deepEqual(sent,[{chat:'123456789012@g.us',message:'🏆 Raid concluída'}])
  assert.match(sql[0],/COALESCE\(value->>'deliveryAttempted','false'\)='false'/)
  assert.match(sql[0],/value->>'chat' LIKE '%@g\.us'/)
  assert.equal(sql.filter(x=>x.startsWith('UPDATE trevo_settings')).length,1)
  assert.equal(sql.filter(x=>x.startsWith('DELETE FROM trevo_settings')).length,1)
})

test('um aviso por batalha, nunca salvar nem publicar salas Raidlote internas',async()=>{
  const inserted=[]
  const db={query:async(statement,params)=>{
    if(!statement.startsWith('INSERT INTO trevo_settings'))throw Error('SQL inesperado')
    inserted.push({sql:statement,key:params[0],body:JSON.parse(params[1])})
    return {rowCount:1}
  }}
  const persist=new Function('db','raidFinalNoticePrefix','flushRaidFinalNotices',
    'safeRaidNotify','RAID_FINAL_NOTIFY_TIMEOUT_MS','console',
    src.slice(persistStart,persistEnd)+'\nreturn persistRaidFinalNotice'
  )(db,'raid_final_notice_v2:',async()=>{},async()=>true,12000,console)
  assert.equal(await persist('__alpha_raid_lote__:internal',20,1795395208339,()=>true,'Falso'),false)
  assert.equal(inserted.length,0)
  await persist('123456789012@g.us',25,1795395208339,()=>true,'Raid 1')
  await persist('123456789012@g.us',25,1795395209340,()=>true,'Raid 2')
  assert.equal(inserted.length,2)
  assert.notEqual(inserted[0].key,inserted[1].key)
  assert.equal(inserted[0].body.raidId,1795395208339)
  assert.equal(inserted[1].body.raidId,1795395209340)
  assert.ok(inserted.every(x=>x.sql.includes('ON CONFLICT(key) DO NOTHING')))
})

test('watchdog consulta avisos pendentes mesmo com neonEcoMode, sem alterar rodadas',()=>{
  assert.match(src,/setInterval\(\(\)=>\{void flushRaidFinalNotices\(\)\},neonEcoMode\?60000:20000\)/)
  assert.match(src,/void persistRaidFinalNotice\(chat,level,r\.raidId,reply,text\)/)
  assert.match(src,/void persistRaidFinalNotice\(chat,level,r\.raidId,reply,`💀/)
  assert.match(games,/return \{failed:true,reason:'timeout',config:cfg,raidId:s\.startedAt/)
  assert.match(games,/return \{failed:true,reason:'party_wipe',config:cfg,raidId:s\.startedAt/)
})
