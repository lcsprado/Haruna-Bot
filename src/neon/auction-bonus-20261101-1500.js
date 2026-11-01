// Leilão Bônus dos Sete Pecados — edição independente de 01/11/2026 às 15h.
// Premiações anunciadas antes e durante o leilão. Duração: 2 minutos por lote.
// Estado, lances reservados e entrega final são transacionais no banco ativo.
import {randomBytes,createHash} from 'node:crypto'
import {extendAuctionDeadline,LOT_DURATION_MS} from './auction-rules.js'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction,petMaxEnergy,petMaxHp} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'
import {PECADOS_ESSENCES} from './sete-pecados-catalog.js'
import {otherAuctionGroups,crossGroupBidNotice} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'

const KEY='leilao_bonus_7_pecados_20261101_1500_v1'
// Edições anteriores mantêm seus dados e histórico em chaves próprias.
// Edição adicional às 15h, sem alterar o leilão das 14h ou seu histórico.
const AUCTION_PAUSED_FOR_AUDIT=false
// Temporary-recovery datasets must not broadcast or revive historical auctions.
// Chave isolada: modo temporário não reativa leilões históricos.
const START=Date.parse('2026-11-01T15:00:00-03:00')
const END=Date.parse('2026-11-01T23:50:00-03:00')
const DURATION=LOT_DURATION_MS
// Exceção limitada a este evento; não modifica licenças nem libera outros comandos.
const EVENT_GROUPS=new Set(['120363429534634131@g.us'])
const OPENING=20000000
const STEP=300000
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
// Ordem fixa e premiação divulgada em WhatsApp e Web, conforme pedido do organizador.
// Todos os IDs existem no banco; uma transação reserva o maior lance e entrega o prêmio.
const PACKAGES=Array.from({length:3},()=>PECADOS_ESSENCES.map(id=>({id,qty:1})))
let timer=null,busy=false,initPromise=null,auctionSocket=null

async function init(){
  if(initPromise)return initPromise
  initPromise=(async()=>{
    console.info('[LEILAO BONUS] init antes da outbox')
    await initAuctionNoticeOutbox(db)
    console.info('[LEILAO BONUS] init outbox pronta')
    if(PECADOS_ESSENCES.length!==7||new Set(PECADOS_ESSENCES).size!==7)throw Error('Sete essências distintas são obrigatórias')
    const rows=(await db.query('SELECT id FROM items WHERE id=ANY($1::text[])',[PECADOS_ESSENCES])).rows
    console.info('[LEILAO BONUS] essencias verificadas',rows.length)
    if(rows.length!==7)throw Error('Essências indisponíveis no catálogo')
  })()
  try{await initPromise}catch(e){initPromise=null;throw e}
}
async function licensedGroups(){return [...EVENT_GROUPS]}
async function sendGroups(sock,msg,groups){
  for(const jid of groups){
    try{await sock.sendMessage(jid,{text:msg})}
    catch(err){console.warn('[LEILAO BONUS] aviso falhou',jid,err?.message||err)}
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
  const items=Array.isArray(prize)?prize:[]
  if(items.length===7&&PECADOS_ESSENCES.every(id=>items.some(x=>x.id===id&&x.qty===1)))
    return '🌈 1 invocação completa dos 7 Pecados — 7 essências diferentes'
  return 'Prêmio inválido'
}
function publicCatalog(lots){
  return (lots||[]).map((lot,i)=>'• *Lote '+(i+1)+':* '+publicPrize(lot.prize)).join('\n')
}
function createPublicLots(){
  return PACKAGES.map((packageItems,index)=>({
    label:'Lote '+(index+1)+' — '+publicPrize(packageItems),
    min:OPENING,step:STEP,prize:packageItems.map(item=>({...item}))
  }))
}
function status(state){
  const lot=state.lots?.[state.lot]
  if(state.phase==='completed')return '🏁 *LEILÃO BÔNUS DOS SETE PECADOS ENCERRADO!* Os 3 lotes foram encerrados.'
  if(!lot)return '🔨 Leilão Bônus dos Sete Pecados em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO BÔNUS DOS SETE PECADOS — LOTE '+(Number(state.lot)+1)+'/'+PACKAGES.length+'*'+
    '\n🎁 *PRÊMIO:* '+publicPrize(lot.prize)+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'*'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n⚡ Lance nos últimos 15s: +20s de prorrogação (máx. 2min extras)'+
    '\n📩 *!lance 20000000* ou *!lance +300000* • *!leilao*'
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
      const metadata=(await c.query('SELECT name FROM items WHERE id=$1',[item.id])).rows[0]
      if(!metadata)throw Error('Item de prêmio não encontrado: '+item.id)
      await c.query(
        'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
        [jid,item.id,item.qty]
      )
      received.push(metadata.name+' ×'+item.qty)
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
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_bonus_7_pecados_20261101',$3)",
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
    if(!globalThis.__bonusAuctionTick1500Logged){globalThis.__bonusAuctionTick1500Logged=true;console.info('[LEILAO BONUS] tick primeiro ciclo',JSON.stringify({now,start:START,end:END}))}
    if(now>=START-20*60*1000&&now<START){
      await init()
      const groups=await licensedGroups()
      if(groups.length)await change(async(state,c)=>{
        if(state.phase!=='pending'||state.publicPreAnnounced)return
        state.groups=groups
        state.publicPreAnnounced=true
        await queueAuctionBidNotices(c,{key:KEY,version:-1,groups,origin:'system',
          message:'🔨🌈 *FALTAM 20 MINUTOS — LEILÃO BÔNUS ÀS 15H!*\n\n🎁 Três lotes de invocação dos Sete Pecados.\n💰 Lance inicial: *R$ 20.000.000* por lote.\n📈 Incrementos de *R$ 300.000*.\n⏱️ 2 minutos por lote.\n📢 Exclusivo do AlphaBot. Digite *!leilao*.'
        })
      })
      await flushAuctionBidNotices(db,sock,KEY,{limit:8})
      return
    }
    if(now<START)return
    if(now>END+5*60*1000){if(timer){clearInterval(timer);timer=null};return}
    // Cria tabela de notificações e valida itens antes do primeiro acesso à fila.
    await init()
    console.info('[LEILAO BONUS] tick init pronto')
    await flushAuctionBidNotices(db,sock,KEY,{limit:8})
    await warnAuctionDeliveryFailures(db,sock,KEY)
    console.info('[LEILAO BONUS] tick outbox processada')
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
    console.info('[LEILAO BONUS] antes da transacao')
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
        outgoing='🔨🌈 *LEILÃO BÔNUS — ÚLTIMO DIA DA COLLAB!*\n\n'+
          '🎁 *3 lotes de invocação dos Sete Pecados*, sete essências diferentes por lote.\n'+
          '💰 Lance inicial: *'+fmt(OPENING)+'* por lote.\n'+
          '📈 Incrementos de *'+fmt(STEP)+'*.\n'+
          '⏱️ 2 minutos por lote; lances nos últimos 15 segundos prorrogam o encerramento.\n'+
          '✅ Lances reservados; o valor retorna automaticamente ao ser superado.\n'+
          '📢 Exclusivo do grupo AlphaBot.\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=await finishLot(state,c)
        if(state.lot===PACKAGES.length-1){
          state.phase='completed'
          state.finished=Date.now()
          outgoing+='\n\n🏁 *LEILÃO BÔNUS DOS SETE PECADOS CONCLUÍDO!* Todos os lotes encerrados.'
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
    console.info('[LEILAO BONUS] apos transacao',Boolean(outgoing))
    if(outgoing)await flushAuctionBidNotices(db,sock,KEY,{limit:8})
  }catch(err){
    console.error('[LEILAO BONUS]',err?.stack||err)
  }finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
  console.info('[LEILAO BONUS] scheduler chamado',JSON.stringify({now:Date.now(),start:START,end:END,socket:!!sock?.sendMessage}))
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
    await reply('🔨 O Leilão Bônus dos Sete Pecados acontece nos grupos.')
    return true
  }
  if(!EVENT_GROUPS.has(chat)){
    await reply('🔒 Esta edição é exclusiva do AlphaBot.')
    return true
  }
  if(Date.now()<START){
    await reply('🔨💎 *LEILÃO BÔNUS DOS SETE PECADOS AGENDADO*\n⏰ Começa às *15h00* (Brasília) de 01/11.\n🎁 *PRÊMIOS PÚBLICOS:*\n'+publicCatalog(createPublicLots())+'\n💰 Lance inicial: *'+fmt(OPENING)+'* • incremento: *'+fmt(STEP)+'*.\n📋 Use *!leilao* para acompanhar a abertura.')
    return true
  }
  if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sync=state?.phase==='running'?await auctionNoticeSummary(db,KEY,Number(state.bidNoticeVersion||0)):null
    const syncLine=sync?'\n📡 Avisos: '+sync.sent+' enviados, '+sync.pending+' pendentes, '+sync.failed+' falharam.':''
    await reply(state?.phase==='running'?status(state)+syncLine:
      state?.phase==='completed'?'🏁 Leilão Bônus dos Sete Pecados encerrado. Consulte os prêmios divulgados antes do evento.':
      '⏳ Leilão Bônus dos Sete Pecados sendo aberto. Consulte novamente em instantes.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){
    await reply('❌ Lance inválido. Envie *!lance 20000000*, *!lance 20300000* ou *!lance +300000*.')
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
      result.notice=result.notice.replace('LEILÃO DAS SOMBRAS','LEILÃO BÔNUS DOS SETE PECADOS')
      if(web)result.notice=result.notice.replace('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!')
      result.notice+='\n🎁 Prêmio do lote: '+publicPrize(lot.prize)
      await queueAuctionBidNotices(c,{key:KEY,version:result.version,groups:result.otherGroups,origin:web?'web':chat,message:result.notice})
      return result
    })
    // O lance já foi confirmado no Neon. Uma falha de envio não o desfaz.
    try{await reply(result.confirmation)}
    catch(err){console.warn('[LEILAO BONUS] lance gravado; confirmação local não enviada',err?.message||err)}
    if(result.otherGroups.length){
      if(auctionSocket?.sendMessage){
        // Delivery is durable: a failed transport does not discard the notice.
        void flushAuctionBidNotices(db,auctionSocket,KEY).then(()=>warnAuctionDeliveryFailures(db,auctionSocket,KEY))
          .catch(err=>console.error('[LEILAO BONUS] fila de avisos',err?.message||err))
      }else console.warn('[LEILAO BONUS] lance aceito, avisos pendentes até reconexão')
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
    title:'Leilão Bônus dos Sete Pecados',phase:now<START?'scheduled':(state.phase||'pending'),
    acceptingBids,serverTime:now,startsAt:START,lotNumber:lot?Number(state.lot)+1:null,
    totalLots:PACKAGES.length,step:lot?.step||STEP,opening:lot?.min||OPENING,
    prizesPublic:true,prize:lot?publicPrize(lot.prize):null,
    lots:(state.lots?.length?state.lots:createPublicLots()).map((x,i)=>({lotNumber:i+1,description:publicPrize(x.prize)})),
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
