import {randomInt} from 'node:crypto'
import {APOSTA_GROUPS} from './aposto-consegue.js'

// Edição única no grupo AlphaBot; paga só no encerramento.
export const ROUBA_KEY='rouba_rouba_alpha_20261030_v1'
export const ROUBA_GROUP_JID=APOSTA_GROUPS[0]
export const ROUBA_MIN_PLAYERS=3
export const ROUBA_MAX_PLAYERS=6
export const ROUBA_TURNS=3
export const ROUBA_CAR={id:'porsche_911',name:'Porsche 911 GT3 RS',price:750000}
export const ROUBA_LOOT=Object.freeze([
 {type:'cash',amount:8000,label:'💰 R$ 8.000'},
 {type:'cash',amount:12000,label:'💰 R$ 12.000'},
 {type:'cash',amount:18000,label:'💰 R$ 18.000'},
 {type:'cash',amount:25000,label:'💰 R$ 25.000'},
 {type:'cash',amount:35000,label:'💰 R$ 35.000'},
 {type:'item',id:'pocao_g',qty:2,label:'🧪 Poção Grande ×2'},
 {type:'item',id:'elixir_supremo',qty:1,label:'🧪 Elixir Supremo ×1'},
 {type:'item',id:'caixa_rara',qty:1,label:'🔵 Caixa Rara ×1'}
])
const TURN_MS=40000,PROPAGATE_MS=3500,RESULT_MS=4000
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const nick=n=>String(n||'Jogador').replace(/[\r\n*_~]/g,' ').trim().slice(0,30)
const canonical=n=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const fresh=now=>({status:'signup',phase:'signup',createdAt:now,order:[],players:{},
 schedule:[],index:0,turn:null,prizes:[],opened:0,carAt:randomInt(2,4),
 carUsed:false,history:[],notices:[],paid:false})
const owned=(s,id)=>s.prizes.filter(p=>p.owner===id)
const stealable=s=>s.prizes.filter(p=>p.owner&&p.steals<2)
const logged=(s,key,message)=>{if(!s.notices.some(n=>n.id===key))s.notices.push({id:key,text:message,sentAt:0,messageId:null})}
const name=(s,id)=>nick(s.players[id]?.name||'Jogador')
const introduction=()=>'🎁 *ROUBA-ROUBA ALPHA!*\n\n'+
 '👥 Inscreva-se com *!participar* no grupo *AlphaBot*.\n'+
 '🎮 *3 jogadas por inscrito*, inclusive quem entrar depois do começo.\n'+
 '📦 Na sua vez: *!abrir* ou *!roubar #N* (número de um prêmio de outra pessoa).\n'+
 '😈 Quem for roubado recebe automaticamente um novo baú.\n'+
 '🔒 Cada prêmio pode ser roubado no máximo 2 vezes.\n'+
 '🚗 *Um Porsche 911 GT3 RS* escondido entre os baús!\n'+
 '💰 Demais prêmios: R$ 8 mil a 35 mil, poções e Caixas Raras.\n'+
 '🏦 Crédito só após o encerramento; sem tirar dinheiro de adversários.\n'+
 '⏳ Começa após 3 inscrições; máximo 6 jogadores. Tudo neste grupo.'
function turnText(s){
 const id=s.turn.jid,p=s.players[id]
 const list=stealable(s).filter(x=>x.owner!==id)
 return '🎁 *ROUBA-ROUBA ALPHA — JOGADA '+(s.index+1)+'/'+s.schedule.length+'*\n'+
 '🎯 Vez de *'+nick(p.name)+'* • '+(p.done+1)+'/3\n'+
 '📦 *!abrir* — ganhar baú misterioso\n'+
 (list.length?'😈 *!roubar #N* — tomar um prêmio revelado\n\n'+list.map(x=>'#'+x.serial+' '+x.label+' — '+name(s,x.owner)+' • '+x.steals+'/2 roubos').join('\n'):
 '🔒 Ainda não há prêmios de outros jogadores disponíveis para roubar.')+
 '\n⏳ *40 segundos* para agir depois do aviso. Sem resposta: baú automático.'
}
function recap(s,a){
 let out=(a.type==='steal'?'😈 *ROUBO CONCLUÍDO!*':'🎁 *BAÚ ABERTO!*')+
 '\n👤 '+name(s,a.player)+(a.type==='steal'?' roubou de '+name(s,a.victim)+': ':' ganhou: ')+a.prize.label+
 (a.type==='steal'?'\n🎁 '+name(s,a.victim)+' recebeu compensação: '+a.replacement.label:'')+
 (a.prize.steals>=2?'\n🔒 Este prêmio não pode mais ser roubado.':'')
 if(a.auto)out+='\n⌛ Jogada automática por tempo esgotado.'
 return out+'\n📊 '+(s.index+1)+'/'+s.schedule.length+' jogadas concluídas.'
}
function finalText(s){
 const standings=s.order.map(jid=>{
  const items=owned(s,jid)
  return '👤 *'+name(s,jid)+'* — '+s.players[jid].done+'/3 jogadas\n'+
   (items.length?items.map(p=>'• '+(p.replacementCash?'💰 R$ 75.000 (no lugar do Porsche)':p.label)).join('\n'):'• Sem prêmios')
 })
 return '🏁 *ROUBA-ROUBA ALPHA ENCERRADO!*\n\n'+standings.join('\n\n')+
 '\n\n✅ Recompensas creditadas uma única vez. Edição encerrada.'
}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function addTurn(s){
 if(s.index>=s.schedule.length){s.status='paying';s.phase='paying';s.turn=null;return}
 s.turn={jid:s.schedule[s.index].jid,deadline:0}
 s.phase='turn-intro'
 logged(s,'turn:'+s.index,turnText(s))
}
function begin(s){
 s.status='active'
 s.schedule=Array.from({length:ROUBA_TURNS},(_,cycle)=>shuffle(s.order).map(jid=>({jid,cycle}))).flat()
 s.index=0;addTurn(s)
}
function prizeOpen(s,id){
 s.opened++
 const car=!s.carUsed&&s.opened===s.carAt
 const base=car?{type:'car',id:ROUBA_CAR.id,label:'🚗 '+ROUBA_CAR.name}:ROUBA_LOOT[randomInt(ROUBA_LOOT.length)]
 if(car)s.carUsed=true
 const p={...base,serial:s.prizes.length+1,owner:id,steals:0}
 s.prizes.push(p)
 return p
}
function chooseTarget(s,id,raw){
 const items=stealable(s).filter(p=>p.owner!==id)
 const value=String(raw||'').replace(/^#/,'').trim()
 if(/^\d+$/.test(value))return items.find(p=>p.serial===Number(value))||null
 const key=canonical(value)
 if(!key)return null
 const matches=items.filter(p=>canonical(name(s,p.owner))===key||canonical(name(s,p.owner)).startsWith(key))
 return matches.length===1?matches[0]:null
}
function resolve(s,actor,kind,target,automatic=false){
 let prize,victim=null,replacement=null
 if(kind==='steal'){
  prize=chooseTarget(s,actor,target)
  if(!prize)return null
  victim=prize.owner
  prize.owner=actor;prize.steals++
  replacement=prizeOpen(s,victim)
 }else prize=prizeOpen(s,actor)
 s.players[actor].done++
 const action={player:actor,type:kind,prize,victim,replacement,auto:automatic}
 s.history.push({player:actor,type:kind,prizeSerial:prize.serial,victim,automatic})
 s.phase='result'
 logged(s,'result:'+s.index,recap(s,action))
 return action
}
async function reward(c,s){
 if(s.paid)return
 for(const id of [...s.order].sort()){
  const wallet=await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[id])
  if(!wallet.rowCount)throw Error('Carteira não encontrada: '+id)
  const garage=await c.query('SELECT car_id FROM user_cars WHERE jid=$1 FOR UPDATE',[id])
  const cars=new Set(garage.rows.map(x=>x.car_id))
  let cash=0
  for(const p of owned(s,id)){
   if(p.type==='cash'){cash+=p.amount;continue}
   if(p.type==='item'){
    const item=await c.query('SELECT id FROM items WHERE id=$1',[p.id])
    if(!item.rowCount)throw Error('Item não cadastrado: '+p.id)
    await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',[id,p.id,p.qty]);continue
   }
   if(p.type==='car'){
    if(cars.has(p.id)||cars.size>=5){cash+=75000;p.replacementCash=true}
    else{
     const granted=await c.query('INSERT INTO user_cars(jid,car_id,price_paid) VALUES($1,$2,$3) ON CONFLICT(jid,car_id) DO NOTHING RETURNING car_id',[id,p.id,ROUBA_CAR.price])
     if(!granted.rowCount)throw Error('Carro não inserido')
     cars.add(p.id)
    }
   }
  }
  if(cash>0){
   await c.query('UPDATE wallets SET cash=cash+$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1',[id,cash])
   await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)', ['event',id,cash,'event_reward',ROUBA_KEY])
  }
 }
 s.paid=true;s.status='completed';s.phase='completed'
 logged(s,'final',finalText(s))
}
export function createRoubaRoubaEngine({db,sendMessage,clock=()=>Date.now(),logger=console,isConnected=()=>true,group=ROUBA_GROUP_JID}){
 if(!db?.connect||typeof sendMessage!=='function')throw Error('Banco e envio obrigatórios')
 let timer=null,busy=false
 async function tx(fn,create=false){
  const c=await db.connect()
  try{
   await c.query('BEGIN')
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ROUBA_KEY])
   const read=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[ROUBA_KEY])
   let s=read.rows[0]?.value
   if(!s&&create){s=fresh(clock());logged(s,'intro',introduction())}
   const prior=s?JSON.stringify(s):null
   const value=await fn(c,s)
   if(s&&JSON.stringify(s)!==prior){
    await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[ROUBA_KEY,JSON.stringify(s)])
   }
   await c.query('COMMIT');return value
  }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}finally{c.release()}
 }
 async function open(){return tx(async(_c,s)=>Boolean(s),true)}
 async function join({chat,sender,name:display}){
  if(chat!==group)return {kind:'other-group'}
  return tx(async(_c,s)=>{
   if(!s||!['signup','active'].includes(s.status))return {kind:'closed'}
   if(s.players[sender])return {kind:'already',done:s.players[sender].done}
   if(s.order.length>=ROUBA_MAX_PLAYERS)return {kind:'full'}
   const late=s.status==='active'
   s.players[sender]={name:nick(display),done:0};s.order.push(sender)
   if(late){
    for(let cycle=0;cycle<ROUBA_TURNS;cycle++){
     const last=s.schedule.findLastIndex((slot,i)=>i>=s.index&&slot.cycle===cycle)
     if(last<0)s.schedule.push({jid:sender,cycle})
     else s.schedule.splice(last+1,0,{jid:sender,cycle})
    }
    if(s.turn&&s.schedule[s.index]?.jid!==s.turn.jid){
     const current=s.schedule.findIndex((slot,i)=>i>=s.index&&slot.jid===s.turn.jid)
     if(current>=0){const [slot]=s.schedule.splice(current,1);s.schedule.splice(s.index,0,slot)}
    }
   }
   return {kind:'joined',count:s.order.length,late}
  })
 }
 async function act({chat,sender,action,target}){
  if(chat!==group)return {kind:'other-group'}
  return tx(async(_c,s)=>{
   if(!s||s.status!=='active'||s.phase!=='turn-open')return {kind:'not-open'}
   if(s.turn.jid!==sender)return {kind:'not-turn'}
   if(clock()>=s.turn.deadline)return {kind:'late'}
   if(!['open','steal'].includes(action))return {kind:'invalid'}
   const out=resolve(s,sender,action,target)
   return out?{kind:'accepted',type:action}:{kind:'bad-target'}
  })
 }
 async function cancel(){
  return tx(async(_c,s)=>{
   if(!s||!['signup','active','paying'].includes(s.status))return false
   if(s.paid)return false
   s.status='cancelled';s.phase='cancelled';s.notices=[]
   logged(s,'cancel','🛑 *ROUBA-ROUBA ALPHA CANCELADO*\nNenhum prêmio foi creditado. O evento foi encerrado sem alterar saldos, inventários ou garagens.')
   return true
  })
 }
 async function status(){
  const row=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[ROUBA_KEY])
  const s=row.rows[0]?.value
  if(!s)return '🎁 Rouba-Rouba ainda não iniciado.'
  if(s.status==='completed')return finalText(s)
  if(s.status==='cancelled')return '🛑 Rouba-Rouba cancelado.'
  return '🎁 *ROUBA-ROUBA ALPHA*\n👥 Inscritos: '+s.order.length+'/'+ROUBA_MAX_PLAYERS+
   '\n🎮 Jogadas: '+s.history.length+'/'+(s.order.length*3)+
   '\n📋 '+s.order.map(id=>name(s,id)+' '+s.players[id].done+'/3').join(' • ')+
   '\n🎯 '+(s.turn?'Vez de '+name(s,s.turn.jid):'Aguardando 3 inscritos')+
   '\n📍 Somente neste grupo: *!participar* para entrar.'
 }
 async function tickCore(){
  await tx(async(c,s)=>{
   if(!s)return
   const now=clock()
   if(s.status==='signup'&&s.order.length>=ROUBA_MIN_PLAYERS){begin(s);return}
   if(s.status==='active'){
    if(s.phase==='turn-intro'){
     const n=s.notices.find(n=>n.id==='turn:'+s.index)
     if(n?.sentAt&&now>=n.sentAt+PROPAGATE_MS){
      s.phase='turn-open';s.turn.deadline=now+TURN_MS
     }
    }else if(s.phase==='turn-open'&&now>=s.turn.deadline){
     resolve(s,s.turn.jid,'open',null,true)
    }else if(s.phase==='result'){
     const n=s.notices.find(n=>n.id==='result:'+s.index)
     if(n?.sentAt&&now>=n.sentAt+RESULT_MS){
      s.index++;addTurn(s)
     }
    }
   }
   if(s.status==='paying')await reward(c,s)
  })
 }
 async function dispatch(){
  if(!isConnected())return
  const read=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[ROUBA_KEY])
  const n=read.rows[0]?.value?.notices?.find(n=>!n.sentAt)
  if(!n)return
  try{
   const out=await sendMessage(group,n.text)
   if(!out?.key?.id)throw Error('WhatsApp não confirmou envio')
   await tx(async(_c,s)=>{
    const item=s?.notices?.find(m=>m.id===n.id)
    if(item&&!item.sentAt){item.sentAt=clock();item.messageId=String(out.key.id)}
   })
  }catch(e){logger.warn?.('[ROUBA] aviso pendente: '+String(e?.message||e))}
 }
 async function tick(){
  if(busy)return
  busy=true
  try{await tickCore();await dispatch();await tickCore()}
  catch(e){logger.error?.('[ROUBA] tick: '+String(e?.stack||e))}
  finally{busy=false}
 }
 return {open,join,act,cancel,status,tick,
  start(){if(timer)return;timer=setInterval(()=>{void tick()},2500);timer.unref?.();void tick()},
  stop(){if(timer)clearInterval(timer);timer=null}}
}
