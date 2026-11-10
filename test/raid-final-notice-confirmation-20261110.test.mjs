import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const begin=source.indexOf('async function safeRaidNotify(')
const end=source.indexOf("const raidFinalNoticePrefix=",begin)
assert.ok(begin>0&&end>begin,'precisa localizar somente a função de aviso')
const warnings=[]
const timers=[]
const fakeSetTimeout=(fn,ms)=>{
 timers.push(ms)
 // Escala temporal: 2,5 s reais -> 5 ms; 12 s reais -> 30 ms
 const id=setTimeout(fn,ms===2500?5:ms===12000?30:100)
 return {id,unref(){}}
}
const fakeClearTimeout=timer=>clearTimeout(timer.id)
const logger={warn:x=>warnings.push(String(x)),error:x=>warnings.push('error:'+String(x))}
const safeRaidNotify=new Function('RAID_NOTIFY_TIMEOUT_MS','console','setTimeout','clearTimeout',
 source.slice(begin,end)+'\nreturn safeRaidNotify')(2500,logger,fakeSetTimeout,fakeClearTimeout)

test('Raid: avisos de rodada continuam com timeout de 2,5 s',async()=>{
 timers.length=0
 const slow=()=>new Promise(resolve=>setTimeout(()=>resolve(true),12))
 assert.equal(await safeRaidNotify(slow,'Rodada'),false)
 assert.ok(timers.includes(2500))
})
test('Raid: aviso final aguarda transporte lento, mas confirmado em menos de 12 s',async()=>{
 timers.length=0
 const slow=()=>new Promise(resolve=>setTimeout(()=>resolve(true),12))
 assert.equal(await safeRaidNotify(slow,'Raid concluída',12000),true)
 assert.ok(timers.includes(12000))
})
test('Raid: envio final sem confirmação continua NÃO entregue; sem reenvio automático',async()=>{
 assert.equal(await safeRaidNotify(()=>new Promise(()=>{}),'Raid concluída',12000),false)
 assert.match(source,/COALESCE\(value->>'deliveryAttempted','false'\)='false'/)
 assert.match(source,/reenvio automático bloqueado para evitar duplicação/)
 assert.match(source,/const delivered=await safeRaidNotify\(text=>raidAutoReply\(msg.chat,text\),msg.text,RAID_FINAL_NOTIFY_TIMEOUT_MS\)/)
 assert.match(source,/if\(delivered\)\{\s*await db\.query/)
})
test('Raid: erro explícito não vira sucesso, mesmo com timeout maior',async()=>{
 assert.equal(await safeRaidNotify(async()=>false,'Final',12000),false)
 assert.equal(await safeRaidNotify(async()=>{throw new Error('network')},'Final',12000),false)
})
test('Raid: somente final usa 12 s; queda no persist segue política sem duplicação',()=>{
 assert.match(source,/const RAID_NOTIFY_TIMEOUT_MS=2500/)
 assert.match(source,/const RAID_FINAL_NOTIFY_TIMEOUT_MS=12000/)
 assert.match(source,/await safeRaidNotify\(reply,text,RAID_FINAL_NOTIFY_TIMEOUT_MS\)/)
 assert.match(source,/void safeRaidNotify\(reply,text\)/)
 assert.match(source,/const raidFinalNoticePrefix='raid_final_notice_v2:'/)
})
