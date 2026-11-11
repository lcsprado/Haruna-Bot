// Simulacao de todo o fluxo sem acesso ao PostgreSQL de producao.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import {COFRE_DESTINO_START,COFRE_DESTINO_END,COFRE_DESTINO_KEY} from '../src/neon/cofre-destino-policy.js'
const root=path.dirname(fileURLToPath(import.meta.url))
const file=path.join(root,'../src/neon/cofre-destino-20261111.js')
const policyUrl=pathToFileURL(path.join(root,'../src/neon/cofre-destino-policy.js')).href
let now=COFRE_DESTINO_START+1000
const realNow=Date.now
Date.now=()=>now
let tick=null
const realTimer=globalThis.setInterval
globalThis.setInterval=fn=>{tick=fn;return {unref(){}}}
globalThis.__cofreRoll=99
const groups=['test-alpha@g.us']
const users=new Map([
 ['p1',{name:'Player 1',hp:1000,max_hp:1000}],
 ['p2',{name:'Player 2',hp:1000,max_hp:1000}],
 ['p3',{name:'Player 3',hp:1000,max_hp:1000}]
])
const wallets=new Map([
 ['p1',{cash:50000,bank:1000000}],
 ['p2',{cash:100000,bank:1000000}],
 ['p3',{cash:0,bank:250000}]
])
const sessions=new Map(),settings=new Map(),inventory=new Map(),notices=[]
let event=null
function result(rows){return {rows,rowCount:rows.length}}
async function query(sql,p=[]){
 const s=sql.replace(/\s+/g,' ').trim()
 if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(s)||s.includes('pg_advisory_xact_lock'))return result([])
 if(s.includes('INSERT INTO cofre_sombras_events(')){
  if(!event)event={event_key:p[0],starts_at:p[1],ends_at:p[2],groups:JSON.parse(p[3]),announced:[]}
  return result([])
 }
 if(s.includes('SELECT * FROM cofre_sombras_events'))return result(event?[event]:[])
 if(s.includes('UPDATE cofre_sombras_events SET announced=')){
  if(event.announced.includes(p[1]))return result([])
  event.announced.push(p[1]);return result([{event_key:COFRE_DESTINO_KEY}])
 }
 if(s.includes('SELECT state FROM cofre_sombras_sessions')){
  const state=sessions.get(p[0]+':'+p[1])
  return result(state?[{state}]:[])
 }
 if(s.includes('INSERT INTO cofre_sombras_sessions')){
  sessions.set(p[0]+':'+p[1],JSON.parse(p[2]))
  return result([{event_key:p[0]}])
 }
 if(s.includes('SELECT hp,max_hp FROM stats')){
  const player=users.get(p[0]);return result(player?[{hp:player.hp,max_hp:player.max_hp}]:[])
 }
 if(s.includes('SELECT cash,bank FROM wallets')){
  const w=wallets.get(p[0]);return result(w?[{cash:w.cash,bank:w.bank}]:[])
 }
 if(s.includes('UPDATE wallets SET cash=$1,bank=$2')){
  const w=wallets.get(p[2]);if(!w)throw Error('missing wallet')
  w.cash=Number(p[0]);w.bank=Number(p[1]);return result([])
 }
 if(s.includes('UPDATE wallets SET cash=cash+$1')){
  const w=wallets.get(p[1]);if(!w)return result([])
  w.cash+=Number(p[0]);return result([{jid:p[1]}])
 }
 if(s.includes('SELECT s.jid,u.push_name AS name,s.state')){
  return result([...sessions].map(([key,state])=>{
   const jid=key.split(':')[1];return {jid,name:users.get(jid)?.name,state}
  }))
 }
 if(s.includes('INSERT INTO trevo_settings(')){
  if(settings.has(p[0]))return result([])
  settings.set(p[0],JSON.parse(p[1]));return result([{key:p[0]}])
 }
 if(s.includes('SELECT value FROM trevo_settings')){
  const value=settings.get(p[0]);return result(value?[{value}]:[])
 }
 if(s.includes('INSERT INTO inventories(')){
  inventory.set(p[0],(inventory.get(p[0])||0)+Number(p[2]));return result([{jid:p[0]}])
 }
 throw Error('Unexpected fake SQL: '+s.slice(0,150))
}
const db={query,connect:async()=>({query,release(){}})}
globalThis.__cofreDbMock=db
globalThis.__cofreGrantMock=async(_client,jid,xp)=>{
 const p=users.get(jid);p.xp=(p.xp||0)+Number(xp);return {awardedGain:Number(xp)}
}
let src=readFileSync(file,'utf8')
const swap=(from,to)=>{if(!src.includes(from))throw Error('Missing import '+from);src=src.replace(from,to)}
swap("import {randomInt} from 'node:crypto'","const randomInt=()=>globalThis.__cofreRoll")
swap("import {db,listGroupLicenses,groupLicenseIsActive,grantExpInTransaction} from './db.js'",
 "const db=globalThis.__cofreDbMock;const listGroupLicenses=async()=>[{chat_jid:'test-alpha@g.us'}];const groupLicenseIsActive=()=>true;const grantExpInTransaction=globalThis.__cofreGrantMock")
swap("import {initCofre} from './cofre-sombras.js'","const initCofre=async()=>{}")
swap("from './cofre-destino-policy.js'","from '"+policyUrl+"'")
const app=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))
const sock={sendMessage:async(group,payload)=>{notices.push({group,message:payload.text});return {key:{id:String(notices.length)}}}}
const replies=[]
const send=async(jid,cmd,args=[])=>{
 const content=[]
 const handled=await app.handleCofreDestinoCommand({cmd,args,sender:jid,chat:groups[0],isGroup:true,reply:async msg=>{content.push(msg);replies.push(msg)}})
 assert.equal(handled,true)
 return content.join('\n')
}
try{
 await app.startCofreDestinoScheduler(sock)
 assert.equal(event.starts_at,COFRE_DESTINO_START)
 assert.equal(event.ends_at,COFRE_DESTINO_END)
 assert.equal(notices.length,1,'one start notice')
 await send('p1','cofre')
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').round,0)
 await send('p1','explorar',['1'])
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').pendingCash,30000)
 assert.equal(wallets.get('p1').cash,50000)
 const duplicate=await send('p1','explorar',['1'])
 assert.match(duplicate,/Próxima escolha/)
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').round,1)
 now+=5*60*1000
 globalThis.__cofreRoll=0
 await send('p1','explorar',['2'])
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').round,2)
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').paidCash,380000)
 assert.equal(wallets.get('p1').cash,430000)
 assert.equal(users.get('p1').xp,2000)
 now+=5*60*1000
 globalThis.__cofreRoll=99
 await send('p1','explorar',['3'])
 assert.equal(wallets.get('p1').cash,180000)
 now+=5*60*1000
 await send('p1','explorar',['2'])
 assert.equal(wallets.get('p1').cash,80000)
 now+=5*60*1000
 await send('p1','explorar',['1'])
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').phase,'finished')
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').paidCash,410000)
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p1').lostCash,350000)
 assert.equal(wallets.get('p1').cash,110000)
 await send('p1','explorar',['3'])
 assert.equal(wallets.get('p1').cash,110000,'no second prize or loss after finish')
 // Another player survives by using the safe door five times.
 await send('p2','cofre')
 for(let i=0;i<5;i++){
  if(i>0)now+=5*60*1000
  await send('p2','explorar',['1'])
 }
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p2').phase,'finished')
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p2').paidCash,150000)
 // Player 3 loses R$ 250k from bank, with wallet never negative.
 await send('p3','cofre')
 globalThis.__cofreRoll=99
 await send('p3','explorar',['3'])
 assert.deepEqual(wallets.get('p3'),{cash:0,bank:0})
 now+=5*60*1000
 const insufficient=await send('p3','explorar',['3'])
 assert.match(insufficient,/Saldo insuficiente/)
 assert.equal(sessions.get(COFRE_DESTINO_KEY+':p3').round,1)
 assert.equal(wallets.get('p3').bank,0)
 // Simulate the 22:00 scheduler tick, then retry to verify prize idempotence.
 now=COFRE_DESTINO_END+1000
 await tick()
 await new Promise(resolve=>setTimeout(resolve,30)) // interval wrapper schedules async tick
 assert.equal(settings.size,1)
 assert.equal(settings.get(COFRE_DESTINO_KEY+':podium_done').winners[0].jid,'p2')
 assert.equal(settings.get(COFRE_DESTINO_KEY+':podium_done').winners[1].jid,'p1')
 assert.equal(wallets.get('p2').cash,100000+150000+2000000)
 assert.equal(wallets.get('p1').cash,110000+1000000)
 assert.equal(inventory.get('p2'),15)
 assert.equal(inventory.get('p1'),10)
 assert.equal(inventory.has('p3'),false)
 assert.equal(notices.length,2)
 await tick()
 await new Promise(resolve=>setTimeout(resolve,30))
 assert.equal(notices.length,2)
 assert.equal(wallets.get('p2').cash,2250000)
 assert.equal(wallets.get('p1').cash,1110000)
 assert.equal(inventory.get('p2'),15)
 assert.equal(inventory.get('p1'),10)
 console.log('✅ Full isolated Cofre flow passed: five rooms, door odds, checkpoints, wallet+bank losses, no double attempts, rank payouts and once-only notices.')
}finally{
 Date.now=realNow
 globalThis.setInterval=realTimer
 delete globalThis.__cofreRoll
 delete globalThis.__cofreDbMock
 delete globalThis.__cofreGrantMock
}
