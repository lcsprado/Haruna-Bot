// Evento global, único e persistente em 18/10/2026, 17h (Brasília).
import {randomInt,randomBytes,createHash} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,petMaxHp} from './db.js'
const KEY='leilao_alpha_20261018_1700_v1'
const START=Date.parse('2026-10-18T17:00:00-03:00')
const PREVIEW=Date.parse('2026-10-18T16:55:00-03:00')
const DURATION=180000
const amount=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const cleanName=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const LOTS=[
 {name:'📦 Caixa do Viajante',min:50000,step:10000,secret:true,rewards:[
   [{id:'pergaminho_leilao_10k',qty:1}],[{id:'elixir_leilao_30m',qty:1}],[{id:'caixa_epica',qty:2}],[{id:'caixa_rara',qty:3}]]},
 {name:'👢 Equipamento do Aventureiro',min:150000,step:25000,secret:true,rewards:[
   [{id:'bota_relampago',qty:1}],[{id:'elmo_aurora',qty:1}],[{id:'armadura_celestial',qty:1}]]},
 {name:'💎 Encantamento de Combate',min:300000,step:25000,secret:false,rewards:[
   [{id:'pedra_furia_alpha',qty:1},{id:'pedra_forca_alpha',qty:1}]]},
 {name:'🎁 Cofre da Fortuna',min:500000,step:50000,secret:true,rewards:[
   [{id:'pergaminho_leilao_10k',qty:1},{id:'pedra_precisao_alpha',qty:1}],
   [{id:'elixir_leilao_30m',qty:1},{id:'pedra_furia_alpha',qty:1}],
   [{id:'bota_relampago',qty:1},{id:'caixa_epica',qty:2}]]},
 {name:'🦊 Raposa Astral',min:1000000,step:100000,secret:false,rewards:[[{pet:'raposa_astral'}]]}
]
let timer,busy=false,ready=false
async function init(){
 if(ready)return
 for(const [id,name,desc] of [
  ['elixir_leilao_30m','Elixir do Leilão','+20% XP por 30 min; até 5.000 XP extra; não acumula.'],
  ['pergaminho_leilao_10k','Pergaminho de 10.000 XP','+10.000 XP instantâneo; um pergaminho por dia.']
 ]){
  await db.query('INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,0,$5,FALSE,TRUE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sellable=FALSE',[id,name,desc,'consumable','event'])
 }
 ready=true
}
async function groupList(){
 const x=await listGroupLicenses(500)
 return [...new Set(x.filter(groupLicenseIsActive).map(y=>y.chat_jid).filter(y=>String(y).endsWith('@g.us')))]
}
async function broadcast(sock,message,targets){
 for(const jid of targets){try{await sock.sendMessage(jid,{text:message})}catch(e){console.warn('[LEILAO] envio',jid,e?.message||e)}await new Promise(r=>setTimeout(r,250))}
}
async function change(fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
  const s=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]?.value||{phase:'pending',announced:false,groups:[],lot:0,history:[]}
  const result=await fn(s,c)
  await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[KEY,JSON.stringify(s)])
  await c.query('COMMIT')
  return result
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
function selectLots(){
 return LOTS.map(x=>({name:x.name,min:x.min,step:x.step,secret:x.secret,prize:x.rewards[randomInt(x.rewards.length)]}))
}
function notice(s){
 const l=s.lots?.[s.lot]
 if(!l)return '🔨 *LEILÃO ALPHA ENCERRADO!*'
 const high=s.high
 return '🔨 *LEILÃO ALPHA — LOTE '+(s.lot+1)+'/5*\n'+l.name+
 '\n🎁 '+(l.secret?'CONTEÚDO MISTERIOSO 🔒':s.lot===4?'🦊 Raposa Astral — habilidade Segunda Chance, 25% na Raid':'💎 Pedra da Fúria + Pedra da Força')+
 '\n💰 Lance inicial: '+amount(l.min)+' • Mín. de aumento: '+amount(l.step)+
 '\n🏆 Maior lance: '+(high?amount(high.value)+' — '+cleanName(high.name):'Nenhum')+
 '\n⏳ Encerra: '+new Date(s.ends).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+
 '\n📩 *!lance 350000* | *!leilao*\n🔐 Selo: '+String(s.seal||'').slice(0,12)
}
async function award(c,jid,lot){
 const received=[]
 for(const p of lot.prize){
  if(p.pet){
   const hp=petMaxHp(1,0,'raposa_astral')
   await c.query('INSERT INTO pet_collection(jid,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,last_action,last_rest,active,hp,max_hp,purchase_price) VALUES($1,$2,$3,1,0,100,100,100,40,0,0,0,0,FALSE,$4,$4,0)',[jid,'raposa_astral','🦊 Raposa Astral',hp])
   received.push('🦊 Raposa Astral (na coleção)')
  }else{
   await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',[jid,p.id,p.qty])
   const meta=(await c.query('SELECT name FROM items WHERE id=$1',[p.id])).rows[0]
   received.push((meta?.name||p.id)+' ×'+p.qty)
  }
 }
 return received
}
function open(s,now){
 s.phase='running';s.high=null;s.ends=now+DURATION;s.extra=0
}
async function close(s,c){
 const current=s.lots[s.lot],high=s.high
 let report='🔨 *LOTE '+(s.lot+1)+' FINALIZADO* — '+current.name
 if(high){
  const gifts=await award(c,high.jid,current)
  await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',[high.jid,'system',high.value,'leilao_alpha',KEY+':'+s.lot])
  report+='\n🏆 '+cleanName(high.name)+' — '+amount(high.value)+'\n🎁 '+gifts.join(' + ')
 }else report+='\n📭 Lote sem comprador.'
 s.history.push({lot:s.lot,prize:current.prize,winner:high?{name:high.name,jid:high.jid,bid:high.value}:null})
 return report
}
async function tick(sock){
 if(busy)return
 busy=true
 try{
  const now=Date.now()
  if(now<PREVIEW||now>START+70*60000)return
  await init()
  const existing=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
  if(existing?.phase==='completed'||(existing?.announced&&now<START))return
  const dest=existing?.groups?.length?existing.groups:await groupList()
  if(!dest.length)return
  let message=''
  await change(async(s,c)=>{
   if(s.phase==='completed')return
   if(now<START){
    if(!s.announced){
     s.announced=true;s.groups=dest
     message='🔨 *LEILÃO MISTERIOSO ALPHA*\n📆 HOJE 18/10/2026 às *17h* (Brasília).\n🎁 5 lotes: caixas de XP, boost 30 min, equipamentos, pedras de encantamento e Raposa Astral.\n📩 *!leilao* consulta | *!lance valor* a partir das 17h.'
    }
    return
   }
   if(s.phase==='pending'){
    s.lots=selectLots()
    const ids=[...new Set(s.lots.flatMap(l=>l.prize).map(p=>p.id).filter(Boolean))]
    const stored=(await c.query('SELECT id FROM items WHERE id=ANY($1::text[])',[ids])).rows
    for(const id of ids)if(!stored.some(v=>v.id===id))throw Error('Prêmio inexistente: '+id)
    s.salt=randomBytes(12).toString('hex')
    s.seal=createHash('sha256').update(JSON.stringify(s.lots.map(l=>l.prize))+':'+s.salt).digest('hex')
    s.groups=dest;s.lot=0;open(s,now)
    message='🔨 *LEILÃO ALPHA INICIADO!*\n\n'+notice(s)
   }else if(s.phase==='running'&&now>=s.ends){
    message=await close(s,c)
    if(s.lot===4){
     s.phase='completed';s.finished=now
     message+='\n\n🏁 *LEILÃO ENCERRADO!* Prêmios creditados.\n🔐 Selo: '+s.seal+' | chave: '+s.salt
    }else{
     s.lot++;open(s,now)
     message+='\n\n'+notice(s)
    }
   }
  })
  if(message)await broadcast(sock,message,dest)
 }catch(e){console.error('[LEILAO]',e?.stack||e)}finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
 if(timer)clearInterval(timer)
 if(Date.now()>START+70*60000)return
 timer=setInterval(()=>tick(sock),5000)
 timer.unref?.()
 tick(sock)
}
function bidAmount(raw){
 const m=/^(\d+)(k|mil|m|mi)?$/i.exec(String(raw||'').replace(/\./g,'').trim())
 if(!m)return NaN
 const n=Number(m[1])*(m[2]==='k'||m[2]==='mil'?1000:m[2]==='m'||m[2]==='mi'?1000000:1)
 return Number.isSafeInteger(n)?n:NaN
}
export async function handleAuctionAlphaCommand({cmd,args,sender,name,chat,reply}){
 if(!['leilao','lance'].includes(cmd))return false
 if(!chat?.endsWith('@g.us')){await reply('🔨 O Leilão Alpha acontece nos grupos.');return true}
 if(!groupLicenseIsActive(await getGroupLicense(chat))){await reply('🔒 O grupo precisa de licença ativa.');return true}
 const now=Date.now()
 if(now<PREVIEW){await reply('🔨 Leilão Alpha: hoje, 18/10, às *17h*.');return true}
 if(cmd==='leilao'){
  const s=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
  await reply(s?.phase==='running'?notice(s):s?.phase==='completed'?'🏁 Leilão encerrado. Prêmios entregues.':'⏰ Leilão Alpha começa às 17h (Brasília).')
  return true
 }
 const offered=bidAmount(args?.[0])
 if(!Number.isSafeInteger(offered)||offered<=0||offered>2000000000){await reply('❌ Lance inválido. Exemplo: *!lance 350000* ou *!lance 350k*.');return true}
 if(now<START){await reply('🔒 Os lances abrem às 17h.');return true}
 try{
  const receipt=await change(async(s,c)=>{
   if(s.phase!=='running'||Date.now()>=Number(s.ends||0))throw Error('Lote encerrado. Consulte !leilao.')
   const lot=s.lots[s.lot],old=s.high
   const minimum=old?old.value+lot.step:lot.min
   if(offered<minimum)throw Error('Lance mínimo: '+amount(minimum))
   const incremental=old?.jid===sender?offered-old.value:offered
   if(old&&old.jid!==sender)await c.query('UPDATE wallets SET cash=cash+$1,bank=bank+$2 WHERE jid=$3',[old.cash,old.bank,old.jid])
   const bal=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
   if(!bal||Number(bal.cash)+Number(bal.bank)<incremental)throw Error('Saldo insuficiente para reservar '+amount(incremental))
   const cash=Math.min(incremental,Number(bal.cash)),bank=incremental-cash
   await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2 WHERE jid=$3',[cash,bank,sender])
   s.high={jid:sender,name:cleanName(name),value:offered,cash:cash+(old?.jid===sender?old.cash:0),bank:bank+(old?.jid===sender?old.bank:0)}
   if(s.ends-Date.now()<=15000&&s.extra<120000){
    const ext=Math.min(20000,120000-s.extra)
    s.ends+=ext;s.extra+=ext
   }
   return '✅ Lance registrado no '+lot.name+': *'+amount(offered)+'*.\n🔒 Valor reservado até você ser superado ou ganhar.\n📋 *!leilao* mostra o maior lance global.'
  })
  await reply(receipt)
 }catch(e){await reply('❌ '+String(e.message||e))}
 return true
}
