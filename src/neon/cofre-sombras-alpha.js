// Evento de exploração individual; sem timers de combate nem polling.
// Usa o outbox transacional já existente para os dois avisos globais.
import {randomInt} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,grantExpInTransaction} from './db.js'
import {queueAuctionBidNotices,flushAuctionBidNotices} from './auction-notice-outbox.js'
export const COFRE_KEY='cofre_sombras_alpha_20261023_v1'
const DURATION=2*60*60*1000, COOLDOWN=5*60*1000, LATE_JOIN=40*60*1000
const CASH=[8000,11000,13000,16000,17000,19000,17000,19000]
const XP=[600,800,1000,1400,1800,2000,2100,2300]
const MONEY_LIMIT=CASH.reduce((a,b)=>a+b,0),XP_LIMIT=XP.reduce((a,b)=>a+b,0)
const cash=v=>'R$ '+Number(v||0).toLocaleString('pt-BR')
const fmt=v=>Number(v||0).toLocaleString('pt-BR')
const time=t=>new Date(Number(t)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
const safe=s=>String(s||'Jogador').replace(/[\r\n*]/g,' ').replace(/\s+/g,' ').slice(0,40)
const H='🗝️ *COFRE DAS SOMBRAS*'
const doorMenu='\n\n🚪 *TRÊS PORTAS À SUA FRENTE*\n'
 +'1️⃣ ⚔️ *Guardião* — prêmio máximo, dano garantido\n'
 +'2️⃣ 💎 *Tesouro* — 72% a 90% do prêmio, risco de armadilha\n'
 +'3️⃣ 💚 *Santuário* — recupera HP, recebe 40% do prêmio\n'
 +'\n👉 Escolha: *!porta 1*, *!porta 2* ou *!porta 3*.'
let readyPromise=null,activeSocket=null,closingTimer=null,notifying=false
async function ready(){
 if(readyPromise)return readyPromise
 readyPromise=(async()=>{
   await db.query('CREATE TABLE IF NOT EXISTS cofre_shadow_runs(event_key TEXT NOT NULL,jid TEXT NOT NULL,state JSONB NOT NULL,updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),PRIMARY KEY(event_key,jid))')
   const groups=[...new Set((await listGroupLicenses(500)).filter(groupLicenseIsActive)
     .map(x=>x.chat_jid).filter(x=>String(x).endsWith('@g.us')))]
   if(!groups.length)return null
   const c=await db.connect()
   try{
     await c.query('BEGIN')
     await c.query("SET LOCAL statement_timeout='12000ms'")
     await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[COFRE_KEY])
     const {rows}=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[COFRE_KEY])
     let event=rows[0]?.value
     if(!event){
       const now=Date.now()
       event={phase:'running',starts:now,ends:now+DURATION,groups}
       await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)',[COFRE_KEY,JSON.stringify(event)])
       const announce='🗝️🌑 *EVENTO — COFRE DAS SOMBRAS*\n━━━━━━━━━━━━━━━━\n'
        +'🏰 *8 salas* • aventura solo, mesmo progresso nos dois grupos\n'
        +'⏳ Até *'+time(event.ends)+'* (Brasília) • 2 horas\n'
        +'⚔️ Guardião, 💎 Tesouro ou 💚 Santuário\n'
        +'❤️ HP exclusivo da exploração; não altera o HP das Raids.\n\n'
        +'💰 Até *R$ 120.000* • ✨ até *12.000 XP*\n'
        +'🧩 Até *2 fragmentos universais de Raid*\n'
        +'🔐 Checkpoint a cada 2 salas: prêmio garantido.\n'
        +'💀 Se morrer, perde só a etapa incompleta.\n'
        +'🕔 *5 min* por sala • *1 tentativa* por jogador\n'
        +'💚 *!cofrecurar*: +25% HP por R$ 25 mil (2 usos)\n\n'
        +'👉 *!explorar* para começar\n'
        +'🚪 *!porta 1/2/3* para escolher\n'
        +'🏦 *!guardar* para sair nos checkpoints\n'
        +'📋 *!cofre* para consultar.\n\n'
        +'⚔️ As Raids continuam normalmente!'
       await queueAuctionBidNotices(c,{key:COFRE_KEY,version:0,groups,origin:'system',message:announce})
     }
     await c.query('COMMIT')
     return event
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
   finally{c.release()}
 })().catch(e=>{readyPromise=null;throw e})
 return readyPromise
}
async function eventState(){
 const {rows}=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[COFRE_KEY])
 return rows[0]?.value||null
}
async function flush(){
 if(notifying||!activeSocket)return
 notifying=true
 try{await flushAuctionBidNotices(db,activeSocket,COFRE_KEY,{limit:6})}
 catch(e){console.warn('[COFRE] mensagem pendente',String(e?.message||e).slice(0,120))}
 finally{notifying=false}
}
async function closeEvent(){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[COFRE_KEY])
  const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[COFRE_KEY])).rows[0]
  const e=row?.value
  if(e?.phase==='running'&&Date.now()>=Number(e.ends)){
    e.phase='completed';e.finished=Date.now()
    await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key=$1',[COFRE_KEY,JSON.stringify(e)])
    await queueAuctionBidNotices(c,{key:COFRE_KEY,version:1,groups:e.groups||[],origin:'system',
      message:'🏁 *COFRE DAS SOMBRAS — ENCERRADO*\n'
      +'🌑 As oito salas se fecharam.\n'
      +'🔐 Quem ainda tem prêmios de checkpoint pode usar *!guardar* para recebê-los.\n'
      +'💀 Os ganhos da etapa incompleta não são pagos.\n'
      +'🗝️ Obrigado por participar!'})
  }
  await c.query('COMMIT')
 }catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('[COFRE] encerramento',String(e?.message||e))}
 finally{c.release()}
 await flush()
}
export function startCofreDasSombras(sock){
 activeSocket=sock
 if(closingTimer){clearTimeout(closingTimer);closingTimer=null}
 void ready().then(async event=>{
  if(!event)return
  await flush()
  if(Date.now()>=Number(event.ends))await closeEvent()
  else{
    closingTimer=setTimeout(()=>void closeEvent(),Math.max(1000,Number(event.ends)-Date.now()))
    closingTimer.unref?.()
  }
 }).catch(e=>console.error('[COFRE] inicialização',String(e?.stack||e).slice(0,450)))
}
async function tx(jid,fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[COFRE_KEY+':'+jid])
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const row=(await c.query('SELECT state FROM cofre_shadow_runs WHERE event_key=$1 AND jid=$2 FOR UPDATE',[COFRE_KEY,jid])).rows[0]
  const r=row?.state||null
  const result=await fn(c,r)
  await c.query('COMMIT')
  return result
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
async function save(c,jid,r){
 const {rowCount}=await c.query('UPDATE cofre_shadow_runs SET state=$3::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE event_key=$1 AND jid=$2',[COFRE_KEY,jid,JSON.stringify(r)])
 if(rowCount!==1)throw Error('Falha ao gravar sua exploração.')
}
async function award(c,jid,r,status,fragments=0){
 if(r.status!=='active')return null
 const money=Number(r.bankCash),xp=Number(r.bankXp)
 if(money<0||money>MONEY_LIMIT||xp<0||xp>XP_LIMIT||fragments<0||fragments>2)
  throw Error('Prêmio excede os limites de segurança.')
 r.status=status;r.finished=Date.now();r.fragments=fragments
 await save(c,jid,r)
 if(money){
  await c.query('UPDATE wallets SET cash=cash+$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1',[jid,money])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'cofre_sombras',$3)",[jid,money,COFRE_KEY+':'+status])
 }
 if(xp)await grantExpInTransaction(c,jid,xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
 if(fragments)await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'fragmento_universal_raid',$2) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity",[jid,fragments])
 return {money,xp,fragments}
}
const outcome=(r,prize,title)=>
 H+'\n━━━━━━━━━━━━━━━━\n'+title
 +'\n💰 Dinheiro recebido: *'+cash(prize?.money)+'*'
 +'\n✨ Experiência: *'+fmt(prize?.xp)+' XP*'
 +(prize?.fragments?'\n🧩 Fragmentos universais: *×'+prize.fragments+'*':'')
 +'\n💉 Recuperações gastas: *'+cash(r.spent||0)+'*'
 +'\n🏰 Salas vencidas: *'+r.room+'/8*'
 +'\n✅ Prêmios creditados uma única vez.'
const status=(r,event)=>{
 if(!r)return H+'\n🏰 Evento até *'+time(event.ends)+'* (Brasília)\n'
  +'💰 Limite de R$ 120 mil • ✨ 12 mil XP • 🧩 até 2 fragmentos\n'
  +'❤️ HP separado da Raid • 2 recuperações pagas\n'
  +'🔐 1 tentativa global por jogador\n👉 Comece com *!explorar*.'
 let s=H+'\n━━━━━━━━━━━━━━━━\n👤 *'+safe(r.name)+'*'
  +'\n🏰 Salas: *'+r.room+'/8*'
  +'\n❤️ HP: *'+fmt(r.hp)+' / '+fmt(r.maxHp)+'*'
  +'\n💰 Em risco: *'+cash(r.stageCash)+'*'
  +'\n✨ XP em risco: *'+fmt(r.stageXp)+'*'
  +'\n🔐 Garantidos: *'+cash(r.bankCash)+' + '+fmt(r.bankXp)+' XP*'
  +'\n💚 Recuperações: *'+r.cures+'/2*'
 if(r.status!=='active')return s+'\n\n🏁 Sua aventura terminou ('+r.status+').\n✅ Crédito único confirmado.'
 if(Date.now()>=Number(event.ends))return s+'\n\n⌛ Tempo esgotado. Use *!guardar* para resgatar o checkpoint.'
 if(Date.now()<r.nextAt)return s+'\n\n⏳ Próxima sala às *'+time(r.nextAt)+'*. Use *!explorar* depois.'+(r.room>0&&r.room%2===0?'\n🚪 Pode usar *!guardar* agora para sair com o garantido.':'')
 return s+'\n\n🏰 *SALA '+(r.room+1)+'/8*'+doorMenu
}
export async function handleCofreDasSombrasCommand({cmd,args=[],sender,name,chat,reply}){
 if(!['cofre','explorar','porta','guardar','cofrecurar'].includes(cmd))return false
 if(!String(chat).endsWith('@g.us')){await reply('🗝️ Este evento acontece nos grupos do Alpha Bot.');return true}
 try{
  await ready()
  const event=await eventState()
  if(!event){await reply(H+'\nEvento indisponível no momento.');return true}
  const {rows}=await db.query('SELECT state FROM cofre_shadow_runs WHERE event_key=$1 AND jid=$2',[COFRE_KEY,sender])
  const known=rows[0]?.state||null,expired=Date.now()>=Number(event.ends)
  if(cmd==='cofre'){await reply(status(known,event));return true}
  if(cmd==='explorar'&&!known){
   if(Date.now()>Number(event.ends)-LATE_JOIN){
    await reply(H+'\n⌛ Inscrições encerradas. São necessários aproximadamente 35 minutos para percorrer as 8 salas.')
    return true
   }
   const r=await tx(sender,async(c,existing)=>{
    if(existing)return existing
    const stat=(await c.query('SELECT max_hp,def FROM stats WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
    if(!stat)throw Error('Personagem não encontrado.')
    const hp=Math.max(100,Number(stat.max_hp)||100)
    const created={name:safe(name),status:'active',room:0,hp,maxHp:hp,def:Math.max(0,Number(stat.def)||0),
      stageCash:0,stageXp:0,bankCash:0,bankXp:0,cures:0,spent:0,nextAt:0,created:Date.now()}
    await c.query('INSERT INTO cofre_shadow_runs(event_key,jid,state) VALUES($1,$2,$3::jsonb) ON CONFLICT(event_key,jid) DO NOTHING',[COFRE_KEY,sender,JSON.stringify(created)])
    return created
   })
   await reply(H+'\n🔓 *EXPLORAÇÃO INICIADA!*\n'
    +'❤️ O HP do evento é independente das Raids.\n'
    +'🔐 A cada duas salas, você garante os ganhos.\n\n'+status(r,event))
   return true
  }
  if(!known){await reply(H+'\n🔒 Você ainda não entrou. Digite *!explorar*.');return true}
  if(known.status!=='active'){await reply(status(known,event));return true}
  if(expired){
   const done=await tx(sender,async(c,r)=>({r,p:await award(c,sender,r,'expired')}))
   await reply(outcome(done.r,done.p,'⌛ *TEMPO ESGOTADO*\nSeus checkpoints foram preservados.'))
   return true
  }
  if(cmd==='explorar'){await reply(status(known,event));return true}
  if(cmd==='guardar'){
   if(!known.room||known.room%2!==0){await reply(H+'\n🔒 A retirada segura está disponível após as salas *2, 4 ou 6*.');return true}
   const done=await tx(sender,async(c,r)=>{
    if(r.status!=='active')return {r,p:null}
    if(!r.room||r.room%2!==0)throw Error('Espere o próximo checkpoint.')
    return {r,p:await award(c,sender,r,'saved')}
   })
   await reply(outcome(done.r,done.p,'🚪 *VOCÊ SAIU COM SEGURANÇA!*'))
   return true
  }
  if(cmd==='cofrecurar'){
   const done=await tx(sender,async(c,r)=>{
    if(r.status!=='active')return {error:'Sua tentativa já terminou.'}
    if(r.cures>=2)return {error:'As duas recuperações já foram usadas.'}
    if(r.hp>=r.maxHp)return {error:'Seu HP já está cheio.'}
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
    if(!wallet||Number(wallet.cash)+Number(wallet.bank)<25000)return {error:'Saldo insuficiente. Precisa de R$ 25.000.'}
    const usedCash=Math.max(0,Math.min(25000,Number(wallet.cash))),usedBank=25000-usedCash
    await c.query('UPDATE wallets SET cash=cash-$2,bank=bank-$3,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1',[sender,usedCash,usedBank])
    r.hp=Math.min(r.maxHp,r.hp+Math.ceil(r.maxHp*.25));r.cures++;r.spent+=25000
    await save(c,sender,r)
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',25000,'cofre_sombras_heal',$2)",[sender,COFRE_KEY+':heal:'+r.cures])
    return {hp:r.hp,max:r.maxHp,cures:r.cures}
   })
   await reply(done.error?H+'\n❌ '+done.error:
     H+'\n💚 *RECUPERAÇÃO CONCLUÍDA*\n❤️ HP: *'+fmt(done.hp)+'/'+fmt(done.max)+'*'
     +'\n💸 Custo: *R$ 25.000*\n💉 Recuperações: *'+done.cures+'/2*\n⚔️ HP das Raids intacto.')
   return true
  }
  if(cmd==='porta'){
   const door=Number(args[0])
   if(!Number.isInteger(door)||door<1||door>3){await reply(H+'\n🚪 Use *!porta 1*, *!porta 2* ou *!porta 3*.');return true}
   if(Date.now()<known.nextAt){await reply(H+'\n⏳ Próxima sala às *'+time(known.nextAt)+'* (Brasília).');return true}
   const res=await tx(sender,async(c,r)=>{
    if(r.status!=='active')return {error:'Tentativa encerrada.'}
    if(Date.now()>=Number(event.ends))return {error:'Evento encerrado. Use !guardar.'}
    if(Date.now()<r.nextAt)return {error:'Aguarde até '+time(r.nextAt)+' para avançar.'}
    const room=r.room+1
    if(room>8)return {error:'As salas já terminaram.'}
    let damage=0,healed=0,multiplier=1,title=''
    const before=r.hp
    if(door===1){
      const mitig=Math.min(.18,r.def/(r.def+600)*.18)
      damage=Math.max(1,Math.round(r.maxHp*(.13+.014*(room-1))*(.90+randomInt(0,26)/100)*(1-mitig)))
      title='⚔️ *GUARDIÃO DERROTADO!*'
    }else if(door===2){
      multiplier=.72+randomInt(0,19)/100
      const trap=randomInt(0,100)<38
      if(trap)damage=Math.max(1,Math.round(r.maxHp*(.14+.012*(room-1))))
      title=trap?'💎 *TESOURO COM ARMADILHA!*':'💎 *TESOURO ENCONTRADO!*'
    }else{
      multiplier=.40
      healed=Math.max(0,Math.min(r.maxHp-before,Math.ceil(r.maxHp*.18)))
      title='💚 *SANTUÁRIO RESTAURADOR!*'
    }
    r.hp=Math.max(0,Math.min(r.maxHp,before+healed-damage))
    if(r.hp===0){
      const prize=await award(c,sender,r,'dead')
      return {dead:true,room,damage,r,prize}
    }
    const winCash=Math.floor(CASH[room-1]*multiplier),winXp=Math.floor(XP[room-1]*multiplier)
    r.room=room;r.stageCash+=winCash;r.stageXp+=winXp
    if(room%2===0){r.bankCash+=r.stageCash;r.bankXp+=r.stageXp;r.stageCash=0;r.stageXp=0}
    if(r.bankCash+r.stageCash>MONEY_LIMIT||r.bankXp+r.stageXp>XP_LIMIT)
      throw Error('Teto de premiação excedido.')
    r.nextAt=room===8?0:Date.now()+COOLDOWN
    if(room===8){
      const prize=await award(c,sender,r,'completed',door===1?2:door===2?1:0)
      return {finished:true,room,r,prize,title}
    }
    await save(c,sender,r)
    return {room,r,title,winCash,winXp,damage,healed,checkpoint:room%2===0}
   })
   if(res.error){await reply(H+'\n❌ '+res.error);return true}
   if(res.dead){await reply(outcome(res.r,res.prize,'💀 *VOCÊ CAIU NA SALA '+res.room+'!*\n'
     +'Dano sofrido: '+fmt(res.damage)+' HP.\nA etapa incompleta foi perdida.'));return true}
   if(res.finished){await reply(outcome(res.r,res.prize,'🏆 *COFRE ABERTO!*\n'+res.title));return true}
   await reply(H+'\n━━━━━━━━━━━━━━━━\n🏰 *SALA '+res.room+'/8 CONCLUÍDA*\n'+res.title
     +(res.damage?'\n💥 Dano recebido: *-'+fmt(res.damage)+' HP*':'')
     +(res.healed?'\n💚 Cura: *+'+fmt(res.healed)+' HP*':'')
     +'\n💰 Tesouro: *+'+cash(res.winCash)+'*'
     +'\n✨ XP: *+'+fmt(res.winXp)+'*'
     +'\n❤️ HP restante: *'+fmt(res.r.hp)+'/'+fmt(res.r.maxHp)+'*'
     +(res.checkpoint?'\n\n🔐 *CHECKPOINT GARANTIDO!*\n'
       +'💰 Total seguro: *'+cash(res.r.bankCash)+'*\n'
       +'✨ XP seguro: *'+fmt(res.r.bankXp)+'*\n'
       +'🚪 Use *!guardar* para sair ou continue explorando.':
       '\n\n⚠️ Tesouro desta etapa ainda está em risco.')
     +'\n\n⏳ Próxima sala às *'+time(res.r.nextAt)+'*.\n'
     +'👉 Use *!explorar* para consultar.')
   return true
  }
 }catch(e){
  console.error('[COFRE] ação falhou',String(e?.stack||e).slice(0,500))
  try{await reply(H+'\n⚠️ Não foi possível processar sua ação. Nada foi reiniciado.\nConfira *!cofre* antes de tentar novamente.')}
  catch(err){console.warn('[COFRE] resposta não enviada',String(err?.message||err).slice(0,110))}
 }
 return true
}
export const COFRE_BALANCE=Object.freeze({rooms:8,maxCash:MONEY_LIMIT,maxXp:XP_LIMIT,cooldownMs:COOLDOWN,curePrice:25000,cureLimit:2})
