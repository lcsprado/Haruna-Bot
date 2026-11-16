// Leilão Alpha — edição independente de 01/11/2026 às 15h.
// Premiações anunciadas antes e durante o leilão. Duração: 5 minutos por lote.
// Estado, lances reservados e entrega final são transacionais no banco ativo.
import {randomBytes,createHash} from 'node:crypto'
import {initAuction15Rewards,REWARDS_15} from './auction-20261115-rewards.js'
import {grantAuctionInventoryItem} from './auction-forged-rewards.js'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction,petMaxEnergy,petMaxHp} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'
import {PECADOS_ESSENCES} from './sete-pecados-catalog.js'
import {otherAuctionGroups,crossGroupBidNotice} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'

const KEY='leilao_alpha_20261115_2100_v1'
const AUCTION_PAUSED_FOR_AUDIT=false
const START=Date.parse('2026-11-15T21:00:00-03:00')
const END=Date.parse('2026-11-15T22:30:00-03:00')
const DURATION=5*60*1000
const EVENT_GROUPS=new Set(['120363429534634131@g.us'])
const OPENING=10000000,STEP=1000000,LOT_OPENINGS=[10000000,25000000,10000000]
const extendAuctionDeadline=(ends,extra,now)=>{
 const remain=Number(ends)-now,n=Number(extra)||0
 if(remain<=0||remain>30000||n>=120000)return {ends,extra:n,extended:false}
 const add=Math.min(30000,120000-n)
 return {ends:Number(ends)+add,extra:n+add,extended:true}
}
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
const PACKAGES=REWARDS_15.map(r=>[{id:r.id,qty:1}])
let timer=null,busy=false,initPromise=null,auctionSocket=null

async function init(){
 if(initPromise)return initPromise
 initPromise=(async()=>{await initAuctionNoticeOutbox(db);await initAuction15Rewards()})()
 try{await initPromise}catch(e){initPromise=null;throw e}
}
async function licensedGroups(){return [...EVENT_GROUPS]}
async function sendGroups(sock,msg,groups){
  for(const jid of groups){
    try{await sock.sendMessage(jid,{text:msg})}
    catch(err){console.warn('[LEILAO ALPHA] aviso falhou',jid,err?.message||err)}
    await new Promise(resolve=>setTimeout(resolve,250))
  }
}
const stateDefault=()=>({phase:'pending',groups:[],lot:0,history:[],lots:[],high:null,seal:null,salt:null})
async function change(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
    const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]
    const state=row?.value||stateDefault()
    const result=await fn(state,c)
    await c.query(
      'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',
      [KEY,JSON.stringify(state)]
    )
    await c.query('COMMIT')
    return result
  }catch(err){
    await c.query('ROLLBACK').catch(()=>{})
    throw err
  }finally{c.release()}
}
function publicPrize(prize){
 const id=Array.isArray(prize)?prize[0]?.id:null
 if(id===REWARDS_15[0].id)return '⚔️ Decreto do Arsenal Supremo — escolha arma, armadura ou bota de drop de Raid, ★★★★★ Lv.1'
 if(id===REWARDS_15[1].id)return '✨ Essência da Perfeição — evolua um equipamento próprio para ★★★★★ Lv.10'
 if(id===REWARDS_15[2].id)return '🎟️ Passe Supremo de Raid Lote — até 3 pacotes !raidlote em 24h, custos e recompensas normais'
 return 'Premiação inválida'
}
function createPublicLots(){
  return PACKAGES.map((packageItems,index)=>({
    label:'Lote '+(index+1)+' — '+publicPrize(packageItems),
    min:LOT_OPENINGS[index],step:STEP,prize:packageItems.map(item=>({...item}))
  }))
}
function status(state){
  const lot=state.lots?.[state.lot]
  if(state.phase==='completed')return '🏁 *LEILÃO ALPHA ENCERRADO!* Os 3 lotes foram encerrados.'
  if(!lot)return '🔨 Leilão Alpha em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO ALPHA — LOTE '+(Number(state.lot)+1)+'/'+PACKAGES.length+'*'+
    '\n🎁 *PRÊMIO:* '+publicPrize(lot.prize)+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'*'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n⚡ Lance nos últimos 30s: +30s de prorrogação (máx. 2min extras)'+
    '\n📩 *!lance '+minimum+'* ou *!lance +1000000* • *!leilao*'
}
async function prize(c,jid,packageItems){
  const received=[]
  for(const item of packageItems){
    if(item.xp){
      await grantExpInTransaction(c,jid,item.xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
      received.push('✨ '+Number(item.xp).toLocaleString('pt-BR')+' XP instantâneos')
    }else if(item.pet){
      const species=String(item.pet)
      const hp=petMaxHp(1,0,species)
      const energy=petMaxEnergy(1,species)
      await c.query(
        'INSERT INTO pet_collection(jid,species,name,level,xp,energy,power,hp,max_hp,active) VALUES($1,$2,$3,1,0,$4,$5,$6,$6,FALSE)',
        [jid,species,String(item.name),energy,Number(item.power),hp]
      )
      received.push('🐾 '+String(item.name)+' Nv.1')
    }else{
      const awarded=await grantAuctionInventoryItem(c,jid,item.id,item.qty)
      received.push(awarded.description)
    }
  }
  return received
}
function beginLot(state,now){
  state.phase='running'
  state.high=null
  state.recentBids=[]
  state.ends=now+DURATION
  state.extra=0
}
async function finishLot(state,c){
  const lot=state.lots[state.lot]
  const high=state.high
  let report='🔨 *LOTE '+(state.lot+1)+'/'+PACKAGES.length+' ENCERRADO*'
  const entry={lot:state.lot,winner:high?{jid:high.jid,name:high.name,bid:high.value}:null}
  if(high){
    const received=await prize(c,high.jid,lot.prize)
    entry.rewards=received
    await c.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_alpha_20261115',$3)",
      [high.jid,high.value,KEY+':lot:'+state.lot]
    )
    report+='\n🏆 '+clean(high.name)+' — '+fmt(high.value)+'\n🎁 PRÊMIO ENTREGUE:\n• '+received.join('\n• ')
  }else{
    report+='\n📭 Sem arremate. Prêmio: '+publicPrize(lot.prize)
  }
  state.history.push(entry)
  return report
}
async function tick(sock){
  if(busy)return
  busy=true
  try{
    const now=Date.now()
    if(!globalThis.__auctionNov15TickLogged){globalThis.__auctionNov15TickLogged=true;console.info('[LEILAO ALPHA] tick primeiro ciclo',JSON.stringify({now,start:START,end:END}))}
    if(now>=START-20*60*1000&&now<START){
      await init()
      const groups=await licensedGroups()
      if(groups.length)await change(async(state,c)=>{
        if(state.phase!=='pending'||state.publicPreAnnounced)return
        state.groups=groups
        state.publicPreAnnounced=true
        await queueAuctionBidNotices(c,{key:KEY,version:-1,groups,origin:'system',
          message:'🔨 *LEILÃO ALPHA — HOJE ÀS 21H!*\n\n🎁 3 lotes, prêmios revelados um por vez na abertura de cada lote.\n📈 Incremento: R$ 1 milhão.\n⏱️ 5 minutos por lote, com prorrogação.\n📢 !leilao no grupo.'
        })
      })
      await flushAuctionBidNotices(db,sock,KEY,{limit:8})
      return
    }
    if(now<START)return
    if(now>END+5*60*1000){if(timer){clearInterval(timer);timer=null};return}
    // Cria tabela de notificações e valida itens antes do primeiro acesso à fila.
    await init()
    console.info('[LEILAO ALPHA] tick init pronto')
    await flushAuctionBidNotices(db,sock,KEY,{limit:8})
    await warnAuctionDeliveryFailures(db,sock,KEY)
    console.info('[LEILAO ALPHA] tick outbox processada')
    if(now>END)return
    const current=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    if(current?.phase==='completed'){
      if(now>Number(current.finished||END)+5*60*1000){if(timer){clearInterval(timer);timer=null}}
      return
    }
    if(current?.phase==='running' && now<Number(current.ends||0))return
    const groups=current?.groups?.length?current.groups:await licensedGroups()
    if(!groups.length)return
    let outgoing=''
    console.info('[LEILAO ALPHA] antes da transacao')
    await change(async(state,c)=>{
      if(state.phase==='completed')return
      if(state.phase==='pending'){
        state.lots=createPublicLots()
        const ids=[...new Set(state.lots.flatMap(x=>x.prize).map(x=>x.id).filter(Boolean))]
        const rows=(await c.query('SELECT id FROM items WHERE id=ANY($1::text[])',[ids])).rows
        for(const id of ids)if(!rows.some(x=>x.id===id))throw Error('Premiação ausente: '+id)
        state.groups=groups
        state.salt=randomBytes(16).toString('hex')
        state.seal=createHash('sha256').update(JSON.stringify(state.lots.map(x=>x.prize))+':'+state.salt).digest('hex')
        state.lot=0
        beginLot(state,now)
        outgoing='🔨 *LEILÃO ALPHA ABERTO AGORA!*\n\n'+
 '🎁 3 lotes; prêmio do lote seguinte só será revelado depois do atual.\n'+
 '📈 Incremento: R$ 1 milhão.\n'+
 '⏱️ 5 minutos por lote; +30s em lances nos últimos 30s.\n'+
 '✅ O lance fica reservado e é devolvido ao ser superado.\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=await finishLot(state,c)
        if(state.lot===PACKAGES.length-1){
          state.phase='completed'
          state.finished=Date.now()
          outgoing+='\n\n🏁 *LEILÃO ALPHA CONCLUÍDO!* Todos os lotes encerrados.'
        }else{
          state.lot++
          beginLot(state,now)
          outgoing+='\n\n'+status(state)
        }
      }
      if(outgoing){
        state.bidNoticeVersion=Number(state.bidNoticeVersion||0)+1
        await queueAuctionBidNotices(c,{key:KEY,version:state.bidNoticeVersion,groups:state.groups,origin:'system',message:outgoing})
      }
    })
    console.info('[LEILAO ALPHA] apos transacao',Boolean(outgoing))
    if(outgoing)await flushAuctionBidNotices(db,sock,KEY,{limit:8})
  }catch(err){
    console.error('[LEILAO ALPHA]',err?.stack||err)
  }finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
  console.info('[LEILAO ALPHA] scheduler chamado',JSON.stringify({now:Date.now(),start:START,end:END,socket:!!sock?.sendMessage}))
  auctionSocket=sock
  if(AUCTION_PAUSED_FOR_AUDIT||timer||Date.now()>END)return
  timer=setInterval(()=>{void tick(auctionSocket)},5000)
  timer.unref?.()
  void tick(auctionSocket)
}
function parseAmount(raw){
  const text=String(raw||'').replace(/\./g,'').replace(/\s/g,'').toLowerCase()
  const match=/^(\+)?(\d+)(k|mil|m|mi)?$/.exec(text)
  if(!match)return null
  const mult=['k','mil'].includes(match[3])?1000:['m','mi'].includes(match[3])?1000000:1
  const value=Number(match[2])*mult
  return Number.isSafeInteger(value)&&value>0?{relative:Boolean(match[1]),value}:null
}
export async function handleAuctionAlphaCommand({cmd,args,sender,name,chat,reply,web=false}){
  if(!['leilao','lance'].includes(cmd))return false
  // Até às 15h, manter o leilão anterior no comando !lance/!leilao.
  if(Date.now()<START-20*60*1000)return false
  if(AUCTION_PAUSED_FOR_AUDIT){
    await reply('🔒 Os leilões de hoje foram cancelados e estão pausados até a auditoria. Lances foram estornados; prêmios serão revisados. Nenhuma nova cobrança será feita.')
    return true
  }
  if(!String(chat||'').endsWith('@g.us')){
    await reply('🔨 O Leilão Alpha acontece nos grupos.')
    return true
  }
  if(!EVENT_GROUPS.has(chat)){
    await reply('🔒 Esta edição é exclusiva do AlphaBot.')
    return true
  }
  if(Date.now()<START){
 await reply('🔨 *LEILÃO ALPHA — 15/11 às 21h (Brasília)*\n🎁 3 lotes, revelados um por vez na abertura.\n📈 Incremento R$ 1 milhão.\n⏱️ 5 minutos por lote.\nUse !leilao para consultar o lote atual.')
 return true
 }
 if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sync=state?.phase==='running'?await auctionNoticeSummary(db,KEY,Number(state.bidNoticeVersion||0)):null
    const syncLine=sync?'\n📡 Avisos: '+sync.sent+' enviados, '+sync.pending+' pendentes, '+sync.failed+' falharam.':''
    await reply(state?.phase==='running'?status(state)+syncLine:
      state?.phase==='completed'?'🏁 Leilão Alpha encerrado. Resultados publicados lote a lote.':
      '⏳ Leilão Alpha sendo aberto. Consulte novamente em instantes.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){
    await reply('❌ Lance inválido. Use !leilao para o lance mínimo e !lance VALOR ou !lance +1000000.')
    return true
  }
  try{
    const result=await change(async(state,c)=>{
      if(state.phase!=='running'||Date.now()>=Number(state.ends||0))throw Error('Lote não está recebendo lances. Consulte !leilao.')
      if(!Array.isArray(state.groups)||!state.groups.includes(chat))throw Error('Este grupo não participa desta edição do leilão.')
      const lot=state.lots[state.lot]
      const old=state.high
      const minimum=old?Number(old.value)+lot.step:lot.min
      const offered=parsed.relative?(old?Number(old.value):lot.min-lot.step)+parsed.value:parsed.value
      if(!Number.isSafeInteger(offered)||offered>2000000000||offered<minimum)throw Error('Próximo lance mínimo: '+fmt(minimum))
      if((offered-lot.min)%lot.step!==0)throw Error('Lances em incrementos de '+fmt(lot.step)+'.')
      const incremental=old?.jid===sender?offered-Number(old.value):offered
      if(old&&old.jid!==sender){
        await c.query('UPDATE wallets SET cash=cash+$1,bank=bank+$2 WHERE jid=$3',[old.cash,old.bank,old.jid])
      }
      const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
      if(!wallet||Number(wallet.cash)+Number(wallet.bank)<incremental){
        throw Error('Saldo insuficiente para reservar '+fmt(incremental))
      }
      const cash=Math.min(incremental,Number(wallet.cash))
      const bank=incremental-cash
      await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$3',[cash,bank,sender])
      state.high={
        jid:sender,name:clean(name),value:offered,
        cash:cash+(old?.jid===sender?Number(old.cash):0),
        bank:bank+(old?.jid===sender?Number(old.bank):0)
      }
      state.recentBids=[...(state.recentBids||[]),{name:clean(name),value:offered,at:Date.now()}].slice(-12)
      const overtime=extendAuctionDeadline(state.ends,state.extra,Date.now())
      state.ends=overtime.ends
      state.extra=overtime.extra
      const result={
        confirmation:'✅ *LANCE ACEITO — LOTE '+(state.lot+1)+'/'+PACKAGES.length+'*\n💰 '+fmt(offered)+
          '\n🔒 Reservado até você vencer ou ser superado.'+
          '\n🎁 Prêmio: '+publicPrize(lot.prize)+
          '\n📈 Próximo lance: '+fmt(offered+lot.step)+
          '\n⏳ Encerra: '+clock(state.ends),
        version:Number(state.bidNoticeVersion=(Number(state.bidNoticeVersion||0)+1)),
        otherGroups:web?[...new Set(state.groups)]:otherAuctionGroups(state.groups,chat),
        notice:crossGroupBidNotice({
          lot:state.lot+1,totalLots:state.lots.length,bidder:state.high.name,
          value:offered,nextMinimum:offered+lot.step,endsAt:state.ends
        })
      }
      result.notice=result.notice.replace('LEILÃO DAS SOMBRAS','LEILÃO ALPHA')
      if(web)result.notice=result.notice.replace('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!')
      result.notice+='\n🎁 Prêmio do lote: '+publicPrize(lot.prize)
      await queueAuctionBidNotices(c,{key:KEY,version:result.version,groups:result.otherGroups,origin:web?'web':chat,message:result.notice})
      return result
    })
    // O lance já foi confirmado no Neon. Uma falha de envio não o desfaz.
    try{await reply(result.confirmation)}
    catch(err){console.warn('[LEILAO ALPHA] lance gravado; confirmação local não enviada',err?.message||err)}
    if(result.otherGroups.length){
      if(auctionSocket?.sendMessage){
        // Delivery is durable: a failed transport does not discard the notice.
        void flushAuctionBidNotices(db,auctionSocket,KEY).then(()=>warnAuctionDeliveryFailures(db,auctionSocket,KEY))
          .catch(err=>console.error('[LEILAO ALPHA] fila de avisos',err?.message||err))
      }else console.warn('[LEILAO ALPHA] lance aceito, avisos pendentes até reconexão')
    }
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}

// The Web API uses the same locked bidding path as WhatsApp; never a second auction.
// Exposição pública das descrições dos prêmios, sem salt nem dados privados dos jogadores.
export async function getAuctionWebStatus({chat,sender}){
  if(!String(chat||'').endsWith('@g.us'))throw Error('Vincule seu Web a um grupo com !web no WhatsApp.')
  if(!EVENT_GROUPS.has(chat))throw Error('Esta edição é exclusiva do AlphaBot.')
  const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value||stateDefault()
  const now=Date.now()
  const lot=state.lots?.[state.lot]
  const groupAllowed=Array.isArray(state.groups)&&state.groups.includes(chat)
  const acceptingBids=!AUCTION_PAUSED_FOR_AUDIT&&state.phase==='running'&&groupAllowed&&now>=START&&now<Number(state.ends||0)
  return {
    title:'Leilão Alpha',phase:now<START?'scheduled':(state.phase||'pending'),
    acceptingBids,serverTime:now,startsAt:START,lotNumber:lot?Number(state.lot)+1:null,
    totalLots:PACKAGES.length,step:lot?.step||STEP,opening:lot?.min||OPENING,
    prizesPublic:state.phase==='running',prize:state.phase==='running'&&lot?publicPrize(lot.prize):null,
    lots:(state.lots?.length?state.lots:createPublicLots()).map((x,i)=>({
      lotNumber:i+1,
      description:state.phase==='completed'||(state.phase==='running'&&i<=Number(state.lot))
        ?publicPrize(x.prize)
        :'🔒 Prêmio revelado somente na abertura do lote'
    })),
    nextMinimum:lot?(state.high?Number(state.high.value)+lot.step:lot.min):OPENING,
    currentBid:state.high?Number(state.high.value):null,
    leader:state.high?clean(state.high.name):null,
    isLeading:Boolean(state.high&&state.high.jid===sender),
    endsAt:lot?Number(state.ends||0):null,
    recentBids:(state.recentBids||[]).slice(-12).map(b=>({name:clean(b.name),value:Number(b.value),at:Number(b.at)})),
    history:(state.history||[]).map(x=>({lotNumber:Number(x.lot)+1,
      winner:x.winner?{name:clean(x.winner.name),bid:Number(x.winner.bid)}:null,
      rewards:Array.isArray(x.rewards)?x.rewards.map(r=>String(r).slice(0,120)):[]
    }))
  }
}

export async function placeAuctionWebBid({chat,sender,name,amount}){
  const raw=String(amount??'')
  if(!/^\+?\d{1,10}$/.test(raw))throw Error('Informe um valor inteiro válido em reais.')
  let confirmation=''
  await handleAuctionAlphaCommand({cmd:'lance',args:[raw],chat,sender,name,web:true,
    reply:async message=>{confirmation=String(message||'')}
  })
  if(!confirmation.startsWith('✅'))throw Error(confirmation.replace(/^❌\s*/, '')||'Lance não aceito.')
  return {accepted:true,confirmation}
}
