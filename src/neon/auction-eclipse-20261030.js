// Leilão Eclipse dos Pecados (30/10, 14h) — 4 lotes públicos e 2min por lote.
// Sem anúncio prévio; catálogo visível em !leilao e no Web desde o agendamento.
// Estado, lances reservados e entrega final são transacionais no banco ativo.
import {randomBytes,createHash} from 'node:crypto'
import {extendAuctionDeadline,LOT_DURATION_MS} from './auction-rules.js'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction,petMaxEnergy,petMaxHp} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'
import {PECADOS_ESSENCES} from './sete-pecados-catalog.js'
import {otherAuctionGroups,crossGroupBidNotice} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'

const KEY='leilao_eclipse_pecados_20261030_1400_v1'
// Edições anteriores mantêm seus dados e histórico em chaves próprias.
// Edição de 30/10 às 14h, autorizada pelo organizador.
const AUCTION_PAUSED_FOR_AUDIT=false
// Temporary-recovery datasets must not broadcast or revive historical auctions.
// Chave isolada: modo temporário não reativa leilões históricos.
const START=Date.parse('2026-10-30T14:00:00-03:00')
const END=Date.parse('2026-10-30T15:00:00-03:00')
const DURATION=LOT_DURATION_MS
// Exceção limitada a este evento; não modifica licenças nem libera outros comandos.
const EVENT_GROUPS=new Set(['120363410230588690@g.us','120363429534634131@g.us'])
const OPENING=10000000
const STEP=500000
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
// Ordem fixa e premiação divulgada em WhatsApp e Web, conforme pedido do organizador.
// Todos os IDs existem no banco; uma transação reserva o maior lance e entrega o prêmio.
// Ordem pública fixa: pet, cofre, arma, invocação; duração 2 min/lote.
const PACKAGES=[
  [{pet:'manticora_eclipse_20261030',name:'Mantícora do Eclipse',power:320}],
  [{id:'caixa_lendaria',qty:4},{id:'caixa_epica',qty:3},{id:'pedra_fortaleza_alpha',qty:3},{id:'pedra_precisao_alpha',qty:3},{id:'pergaminho_reclassificacao',qty:1}],
  [{id:'foice_eclipse_mistico_20261030',qty:1}],
  PECADOS_ESSENCES.map(id=>({id,qty:1}))
]
const LOT_OPENINGS=[10000000,6000000,12000000,8000000]
let timer=null,busy=false,initPromise=null,auctionSocket=null

async function init(){
  if(initPromise)return initPromise
  initPromise=(async()=>{
    await initEnchantments()
    await initAuctionNoticeOutbox(db)
    const definitions=[
      ['pergaminho_leilao_10k','Pergaminho de 10.000 XP',
        '+10.000 XP instantâneo; um pergaminho por dia.','consumable',true],
      ['elixir_leilao_2h','Ampulheta Dourada XP 2x',
        'Ative via buffxp por duas horas','consumable',true],
      ['elixir_leilao_1h_20261024','Ampulheta Prateada XP 2x — 1 hora',
        'Ative via buffxp por uma hora; não acumula','consumable',true],
      // Premiações próprias de 30/10; não modifica equipamentos já entregues nas edições anteriores.
      ['elmo_guardiao_nebular_20261026','Elmo do Guardião Nebular',
        '100 DEF, 330 HP e 3,5% crítico; lendário exclusivo do Leilão 26/10','helmet',false],
      ['botas_cometa_astral_20261026','Botas do Cometa Astral',
        '17 VEL, 35 HP, 18 DEF e 1,5% crítico; lendárias exclusivas do Leilão 26/10','boots',false],
      ['armadura_vigia_crepusculo_20261027','Armadura do Vigia do Crepúsculo',
        '88 DEF, 150 HP e 1% crítico; armadura intermediária abaixo dos equipamentos sagrados da collab','armor',false],
      ['foice_eclipse_mistico_20261030','Foice do Eclipse',
        'Arma Lendária Mística exclusiva do leilão 30/10: 140 ATK, 10 VEL, 4% crítico (Nv.1).','weapon',false]
    ]
    for(const [id,name,description,category,stackable] of definitions){
      await db.query(
        'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,0,$5,FALSE,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,sellable=FALSE,stackable=EXCLUDED.stackable',
        [id,name,description,category,id==='armadura_vigia_crepusculo_20261027'?'epic':(['helmet','boots','weapon'].includes(category)?'legendary':'event'),stackable]
      )
    }
  })()
  try{await initPromise}catch(e){initPromise=null;throw e}
}
async function licensedGroups(){
  const groups=await listGroupLicenses(500)
  return [...new Set([...groups.filter(groupLicenseIsActive).map(g=>g.chat_jid),...EVENT_GROUPS].filter(j=>String(j).endsWith('@g.us')))]
}
async function sendGroups(sock,msg,groups){
  for(const jid of groups){
    try{await sock.sendMessage(jid,{text:msg})}
    catch(err){console.warn('[LEILAO RELIQUIAS] aviso falhou',jid,err?.message||err)}
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
  if(items.some(x=>x.pet==='manticora_eclipse_20261030'))
    return '🦂 Mantícora do Eclipse — Pet Lendário Místico, sinergia 🐾 Predador (dano, crítico e velocidade)'
  if(items.some(x=>x.id==='foice_eclipse_mistico_20261030'))
    return '⚔️ Foice do Eclipse — arma Lendária Mística exclusiva (+140 ATK, +10 VEL, +4% CRIT no Nv.1)'
  if(items.length===PECADOS_ESSENCES.length&&PECADOS_ESSENCES.every(id=>items.some(x=>x.id===id&&x.qty===1)))
    return '🌈 Invocação dos 7 Pecados: 1 essência de cada Pecado (7 diferentes, 1 abertura oficial)'
  if(items.some(x=>x.id==='caixa_lendaria'&&x.qty===4))
    return '👑 Cofre do Imperador: 4 Caixas Lendárias + 3 Épicas + 3 Pedras de Fortaleza + 3 de Precisão + 1 Pergaminho de Reclassificação'
  return 'Prêmio não identificado — consulte o administrador'
}
function publicCatalog(lots){
  return (lots||[]).map((lot,i)=>'• *Lote '+(i+1)+':* '+publicPrize(lot.prize)).join('\n')
}
function createPublicLots(){
  return PACKAGES.map((packageItems,index)=>({
    label:'Lote '+(index+1)+' — '+publicPrize(packageItems),
    min:LOT_OPENINGS[index],step:STEP,prize:packageItems.map(item=>({...item}))
  }))
}
function status(state){
  const lot=state.lots?.[state.lot]
  if(state.phase==='completed')return '🏁 *LEILÃO ECLIPSE DOS PECADOS ENCERRADO!* Os 4 lotes foram encerrados.'
  if(!lot)return '🔨 Leilão Eclipse dos Pecados em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO ECLIPSE DOS PECADOS — LOTE '+(Number(state.lot)+1)+'/'+PACKAGES.length+'*'+
    '\n🎁 *PRÊMIO:* '+publicPrize(lot.prize)+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'*'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n⚡ Lance nos últimos 15s: +20s de prorrogação (máx. 2min extras)'+
    '\n📋 *Prêmios dos 4 lotes:*\n'+publicCatalog(state.lots)+
    '\n📩 *!lance 10000000* ou *!lance +500000* • *!leilao*'
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
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_eclipse_pecados_20261030',$3)",
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
    // Sem anúncio antecipado: prêmios continuam públicos no !leilao/Web.
    if(now<START)return
    if(now>END+5*60*1000){if(timer){clearInterval(timer);timer=null};return}
    // Cria tabela de notificações e valida itens antes do primeiro acesso à fila.
    await init()
    await flushAuctionBidNotices(db,sock,KEY,{limit:8})
    await warnAuctionDeliveryFailures(db,sock,KEY)
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
        outgoing='🔨💎 *LEILÃO ECLIPSE DOS PECADOS COMEÇOU!*\n\n'+
          '🎁 *PRÊMIOS DIVULGADOS — 4 LOTES:*\n'+publicCatalog(state.lots)+
          '\n\n💰 Lance inicial: *'+fmt(OPENING)+'*'+
          '\n📈 Incremento mínimo: *'+fmt(STEP)+'*'+
          '\n⏱️ *2 minutos por lote*. Lance nos últimos 15s: +20s, até +2min.'+
          '\n👀 Prêmios, lances e líderes são públicos nos grupos e no Web.'+
          '\n✅ O maior lance é reservado; se superado, é devolvido.'+
          '\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=await finishLot(state,c)
        if(state.lot===PACKAGES.length-1){
          state.phase='completed'
          state.finished=Date.now()
          outgoing+='\n\n🏁 *LEILÃO ECLIPSE DOS PECADOS CONCLUÍDO!* Todos os lotes encerrados.'
        }else{
          state.lot++
          beginLot(state,now)
          outgoing+='\n\n'+status(state)
        }
      }
    })
    if(outgoing)await sendGroups(sock,outgoing,groups)
  }catch(err){
    console.error('[LEILAO RELIQUIAS]',err?.stack||err)
  }finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
  // Atualiza o socket após cada reconexão, sem criar um segundo polling.
  auctionSocket=sock
  if(AUCTION_PAUSED_FOR_AUDIT){
    if(timer){clearInterval(timer);timer=null}
    console.log('[LEILAO RELIQUIAS] pausado para auditoria — sem novos leiloes ou avisos')
    return
  }
  if(timer){clearInterval(timer);timer=null}
  if(Date.now()>END){
    console.log('[LEILAO ECLIPSE] edição encerrada; scheduler desativado')
    return
  }
  timer=setInterval(()=>tick(sock),5000)
  timer.unref?.()
  void tick(sock)
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
  if(AUCTION_PAUSED_FOR_AUDIT){
    await reply('🔒 Os leilões de hoje foram cancelados e estão pausados até a auditoria. Lances foram estornados; prêmios serão revisados. Nenhuma nova cobrança será feita.')
    return true
  }
  if(!String(chat||'').endsWith('@g.us')){
    await reply('🔨 O Leilão Eclipse dos Pecados acontece nos grupos.')
    return true
  }
  if(!groupLicenseIsActive(await getGroupLicense(chat))&&!EVENT_GROUPS.has(chat)){
    await reply('🔒 É necessário ter licença ativa para participar.')
    return true
  }
  if(Date.now()<START){
    await reply('🔨💎 *LEILÃO ECLIPSE DOS PECADOS AGENDADO*\n⏰ Começa às *14h00* (Brasília) de 30/10.\n🎁 *PRÊMIOS PÚBLICOS:*\n'+publicCatalog(createPublicLots())+'\n💰 Aberturas: *'+LOT_OPENINGS.map(fmt).join(' / ')+'* • incremento: *'+fmt(STEP)+'*.\n📋 Volte com *!leilao* às 14h00.')
    return true
  }
  if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sync=state?.phase==='running'?await auctionNoticeSummary(db,KEY,Number(state.bidNoticeVersion||0)):null
    const syncLine=sync?'\n📡 Avisos: '+sync.sent+' enviados, '+sync.pending+' pendentes, '+sync.failed+' falharam.':''
    await reply(state?.phase==='running'?status(state)+syncLine:
      state?.phase==='completed'?'🏁 Leilão Eclipse dos Pecados encerrado. Consulte os prêmios divulgados antes do evento.':
      '⏳ Leilão Eclipse dos Pecados sendo aberto. Consulte novamente em instantes.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){
    await reply('❌ Lance inválido. Envie *!lance 10000000*, *!lance 10500k* ou *!lance +500000*.')
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
      result.notice=result.notice.replace('LEILÃO DAS SOMBRAS','LEILÃO ECLIPSE DOS PECADOS')
      if(web)result.notice=result.notice.replace('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!')
      result.notice+='\n🎁 Prêmio do lote: '+publicPrize(lot.prize)
      await queueAuctionBidNotices(c,{key:KEY,version:result.version,groups:result.otherGroups,origin:web?'web':chat,message:result.notice})
      return result
    })
    // O lance já foi confirmado no Neon. Uma falha de envio não o desfaz.
    try{await reply(result.confirmation)}
    catch(err){console.warn('[LEILAO RELIQUIAS] lance gravado; confirmação local não enviada',err?.message||err)}
    if(result.otherGroups.length){
      if(auctionSocket?.sendMessage){
        // Delivery is durable: a failed transport does not discard the notice.
        void flushAuctionBidNotices(db,auctionSocket,KEY).then(()=>warnAuctionDeliveryFailures(db,auctionSocket,KEY))
          .catch(err=>console.error('[LEILAO RELIQUIAS] fila de avisos',err?.message||err))
      }else console.warn('[LEILAO RELIQUIAS] lance aceito, avisos pendentes até reconexão')
    }
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}

// The Web API uses the same locked bidding path as WhatsApp; never a second auction.
// Exposição pública das descrições dos prêmios, sem salt nem dados privados dos jogadores.
export async function getAuctionWebStatus({chat,sender}){
  if(!String(chat||'').endsWith('@g.us'))throw Error('Vincule seu Web a um grupo com !web no WhatsApp.')
  if(!EVENT_GROUPS.has(chat)&&!groupLicenseIsActive(await getGroupLicense(chat)))throw Error('Grupo sem acesso a este leilão.')
  const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value||stateDefault()
  const now=Date.now()
  const lot=state.lots?.[state.lot]
  const groupAllowed=Array.isArray(state.groups)&&state.groups.includes(chat)
  const acceptingBids=!AUCTION_PAUSED_FOR_AUDIT&&state.phase==='running'&&groupAllowed&&now>=START&&now<END&&now<Number(state.ends||0)
  return {
    title:'Leilão Eclipse dos Pecados',phase:now<START?'scheduled':(state.phase||'pending'),
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
