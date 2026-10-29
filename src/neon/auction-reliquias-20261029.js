// Leilão das Quatro Relíquias (29/10, 19h) — 4 lotes reais, secretos e com lances públicos.
// Conteúdo oculto até o encerramento. Duração: 2 minutos por lote.
// Estado, lances reservados e entrega final são transacionais no banco ativo.
import {randomInt,randomBytes,createHash} from 'node:crypto'
import {extendAuctionDeadline,LOT_DURATION_MS} from './auction-rules.js'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction,petMaxEnergy,petMaxHp} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'
import {otherAuctionGroups,crossGroupBidNotice} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'

const KEY='leilao_quatro_destinos_20261029_1900_v1'
// Edições anteriores mantêm seus dados e histórico em chaves próprias.
// Edição de 29/10 às 19h, autorizada pelo organizador.
const AUCTION_PAUSED_FOR_AUDIT=false
// Temporary-recovery datasets must not broadcast or revive historical auctions.
// Chave isolada: modo temporário não reativa leilões históricos.
const START=Date.parse('2026-10-29T19:00:00-03:00')
const END=Date.parse('2026-10-29T20:00:00-03:00')
const DURATION=LOT_DURATION_MS
// Exceção limitada a este evento; não modifica licenças nem libera outros comandos.
const EVENT_GROUPS=new Set(['120363410230588690@g.us','120363429534634131@g.us'])
const OPENING=250000
const STEP=100000
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
// Os pacotes são embaralhados criptograficamente; o Web e os comandos mostram só os lances.
// Todos os IDs existem no banco; uma transação reserva o maior lance e entrega o prêmio.
const PACKAGES=[
  // Uma única invocação oficial da collab: 7 essências = 1 baú aleatório.
  [{id:'essencia_pecado_preguica',qty:7},{id:'caixa_lendaria',qty:1}],
  // Pet Coringa original; sua lógica já impede duas sinergias simultâneas.
  [{pet:'guaxinim_errante_20261027',name:'Guaxinim Errante',power:70},{id:'caixa_epica',qty:2}],
  [{id:'armadura_vigia_crepusculo_20261027',qty:1},{id:'caixa_lendaria',qty:2},{id:'pedra_fortaleza_alpha',qty:2}],
  [{id:'fragmento_universal_raid',qty:50},{id:'elixir_leilao_2h',qty:1},{id:'pergaminho_leilao_10k',qty:1},{id:'pergaminho_reclassificacao',qty:1},{id:'pocao_pet_full',qty:3}]
]
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
      // Premiações próprias de 29/10; não modifica equipamentos já entregues nas edições anteriores.
      ['elmo_guardiao_nebular_20261026','Elmo do Guardião Nebular',
        '100 DEF, 330 HP e 3,5% crítico; lendário exclusivo do Leilão 26/10','helmet',false],
      ['botas_cometa_astral_20261026','Botas do Cometa Astral',
        '17 VEL, 35 HP, 18 DEF e 1,5% crítico; lendárias exclusivas do Leilão 26/10','boots',false],
      ['armadura_vigia_crepusculo_20261027','Armadura do Vigia do Crepúsculo',
        '88 DEF, 150 HP e 1% crítico; armadura intermediária abaixo dos equipamentos sagrados da collab','armor',false]
    ]
    for(const [id,name,description,category,stackable] of definitions){
      await db.query(
        'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,0,$5,FALSE,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,sellable=FALSE,stackable=EXCLUDED.stackable',
        [id,name,description,category,id==='armadura_vigia_crepusculo_20261027'?'epic':(['helmet','boots'].includes(category)?'legendary':'event'),stackable]
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
    catch(err){console.warn('[LEILAO OCULTO] aviso falhou',jid,err?.message||err)}
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
function shufflePackages(){
  const p=PACKAGES.map(packageItems=>packageItems.map(item=>({...item})))
  for(let i=p.length-1;i>0;i--){
    const j=randomInt(i+1)
    ;[p[i],p[j]]=[p[j],p[i]]
  }
  return p.map((prize,index)=>({label:'🎁 Lote Misterioso '+(index+1),min:OPENING,step:STEP,prize}))
}
function status(state){
  const lot=state.lots?.[state.lot]
  if(state.phase==='completed')return '🏁 *LEILÃO DAS QUATRO RELÍQUIAS ENCERRADO!* Os 4 lotes foram encerrados.'
  if(!lot)return '🔨 Leilão das Quatro Relíquias em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO DAS QUATRO RELÍQUIAS — LOTE '+(Number(state.lot)+1)+'/'+PACKAGES.length+'*'+
    '\n🎁 *LOTE MISTERIOSO* — conteúdo secreto até o arremate!'+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'*'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n⚡ Lance nos últimos 15s: +20s de prorrogação (máx. 2min extras)'+
    '\n📩 *!lance 100000* ou *!lance +50000* • *!leilao*'
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
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_quatro_destinos_20261029',$3)",
      [high.jid,high.value,KEY+':lot:'+state.lot]
    )
    report+='\n🏆 '+clean(high.name)+' — '+fmt(high.value)+'\n🎁 RECOMPENSAS REVELADAS:\n• '+received.join('\n• ')
  }else{
    report+='\n📭 Sem arremate. O conteúdo deste lote continua secreto.'
  }
  state.history.push(entry)
  return report
}
async function tick(sock){
  if(busy)return
  busy=true
  try{
    const now=Date.now()
    // Anúncio único às 18h50, persistido na fila por grupo; não revela lotes.
    if(now>=START-10*60*1000 && now<START){
      await init()
      const groups=await licensedGroups()
      if(groups.length)await change(async(state,c)=>{
        if(state.phase!=='pending'||state.preAnnounced)return
        state.groups=groups
        state.preAnnounced=true
        await queueAuctionBidNotices(c,{
          key:KEY,version:0,groups,origin:'system',
          message:'🔨💎 *LEILÃO DAS QUATRO RELÍQUIAS EM 10 MINUTOS!*\n\n'+
            '⏰ Abertura *19h00* (Brasília).\n🎭 *4 lotes misteriosos*, com 1 invocação dos 7 Pecados (7 essências), pet Coringa, armadura, caixas lendárias e itens de evolução.\n'+
            '👀 Lances públicos nos grupos e no Web; conteúdo secreto até o arremate.\n'+
            '💰 Lance inicial *R$ 250.000* • incremento *R$ 100.000*.\n'+
            '⏱️ 2 minutos por lote, com prorrogação contra lances de último segundo.\n'+
            '📋 Digite *!leilao* ou abra a aba Leilão do Web.'
        })
      })
      await flushAuctionBidNotices(db,sock,KEY,{limit:8})
      return
    }
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
        state.lots=shufflePackages()
        const ids=[...new Set(state.lots.flatMap(x=>x.prize).map(x=>x.id).filter(Boolean))]
        const rows=(await c.query('SELECT id FROM items WHERE id=ANY($1::text[])',[ids])).rows
        for(const id of ids)if(!rows.some(x=>x.id===id))throw Error('Premiação ausente: '+id)
        state.groups=groups
        state.salt=randomBytes(16).toString('hex')
        state.seal=createHash('sha256').update(JSON.stringify(state.lots.map(x=>x.prize))+':'+state.salt).digest('hex')
        state.lot=0
        beginLot(state,now)
        outgoing='🔨💎 *LEILÃO DAS QUATRO RELÍQUIAS COMEÇOU!*\n\n'+
          '🎭 *4 lotes misteriosos!* Cada prêmio é revelado somente após o arremate.'+
          '\n🎁 Prêmios possíveis: 1 invocação dos 7 Pecados (sorteio entre herói, arma ou armadura), pet Coringa, armadura, caixas lendárias, XP 2x e fragmentos.'+
          '\n💰 Lance inicial: *'+fmt(OPENING)+'*'+
          '\n📈 Incremento mínimo: *'+fmt(STEP)+'*'+
          '\n⏱️ *2 minutos por lote*. Lance nos últimos 15s: +20s, até +2min.'+
          '\n👀 *Lances e líderes são públicos nos grupos*. Somente os prêmios são secretos.'+
          '\n✅ O valor do maior lance é reservado; se superado, é devolvido.'+
          '\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=await finishLot(state,c)
        if(state.lot===PACKAGES.length-1){
          state.phase='completed'
          state.finished=Date.now()
          outgoing+='\n\n🏁 *LEILÃO DAS QUATRO RELÍQUIAS CONCLUÍDO!* Todos os lotes encerrados.'
        }else{
          state.lot++
          beginLot(state,now)
          outgoing+='\n\n'+status(state)
        }
      }
    })
    if(outgoing)await sendGroups(sock,outgoing,groups)
  }catch(err){
    console.error('[LEILAO OCULTO]',err?.stack||err)
  }finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
  // Atualiza o socket após cada reconexão, sem criar um segundo polling.
  auctionSocket=sock
  if(AUCTION_PAUSED_FOR_AUDIT){
    if(timer){clearInterval(timer);timer=null}
    console.log('[LEILAO OCULTO] pausado para auditoria — sem novos leiloes ou avisos')
    return
  }
  if(timer){clearInterval(timer);timer=null}
  if(Date.now()>END){
    console.log('[LEILAO OCULTO] scheduler desativado: recuperação temporária ou evento histórico encerrado')
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
    await reply('🔨 O Leilão Oculto acontece nos grupos.')
    return true
  }
  if(!groupLicenseIsActive(await getGroupLicense(chat))&&!EVENT_GROUPS.has(chat)){
    await reply('🔒 É necessário ter licença ativa para participar.')
    return true
  }
  if(Date.now()<START){
    await reply('🔨💎 *LEILÃO DAS QUATRO RELÍQUIAS AGENDADO*\n⏰ Começa às *19h00* (Brasília) de 29/10.\n🎁 Serão *4 lotes misteriosos*.\n💰 Lance inicial: *'+fmt(OPENING)+'* • incremento: *'+fmt(STEP)+'*.\n📢 Lances públicos e prêmios revelados só após cada lote.\n📋 Volte com *!leilao* às 19h00.')
    return true
  }
  if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sync=state?.phase==='running'?await auctionNoticeSummary(db,KEY,Number(state.bidNoticeVersion||0)):null
    const syncLine=sync?'\n📡 Avisos: '+sync.sent+' enviados, '+sync.pending+' pendentes, '+sync.failed+' falharam.':''
    await reply(state?.phase==='running'?status(state)+syncLine:
      state?.phase==='completed'?'🏁 Leilão Oculto encerrado. Todos os prêmios foram revelados.':
      '⏳ Leilão Oculto sendo aberto. Consulte novamente em instantes.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){
    await reply('❌ Lance inválido. Envie *!lance 100000*, *!lance 150k* ou *!lance +50000*.')
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
          '\n🎁 Conteúdo oculto até encerrar este lote.'+
          '\n📈 Próximo lance: '+fmt(offered+lot.step)+
          '\n⏳ Encerra: '+clock(state.ends),
        version:Number(state.bidNoticeVersion=(Number(state.bidNoticeVersion||0)+1)),
        otherGroups:web?[...new Set(state.groups)]:otherAuctionGroups(state.groups,chat),
        notice:crossGroupBidNotice({
          lot:state.lot+1,totalLots:state.lots.length,bidder:state.high.name,
          value:offered,nextMinimum:offered+lot.step,endsAt:state.ends
        })
      }
      result.notice=result.notice.replace('LEILÃO DAS SOMBRAS','LEILÃO DAS QUATRO RELÍQUIAS')
      if(web)result.notice=result.notice.replace('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!')
      await queueAuctionBidNotices(c,{key:KEY,version:result.version,groups:result.otherGroups,origin:web?'web':chat,message:result.notice})
      return result
    })
    // O lance já foi confirmado no Neon. Uma falha de envio não o desfaz.
    try{await reply(result.confirmation)}
    catch(err){console.warn('[LEILAO OCULTO] lance gravado; confirmação local não enviada',err?.message||err)}
    if(result.otherGroups.length){
      if(auctionSocket?.sendMessage){
        // Delivery is durable: a failed transport does not discard the notice.
        void flushAuctionBidNotices(db,auctionSocket,KEY).then(()=>warnAuctionDeliveryFailures(db,auctionSocket,KEY))
          .catch(err=>console.error('[LEILAO OCULTO] fila de avisos',err?.message||err))
      }else console.warn('[LEILAO OCULTO] lance aceito, avisos pendentes até reconexão')
    }
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}

// The Web API uses the same locked bidding path as WhatsApp; never a second auction.
// These snapshots intentionally omit lots[].prize, salt, and all private player JIDs.
export async function getAuctionWebStatus({chat,sender}){
  if(!String(chat||'').endsWith('@g.us'))throw Error('Vincule seu Web a um grupo com !web no WhatsApp.')
  if(!EVENT_GROUPS.has(chat)&&!groupLicenseIsActive(await getGroupLicense(chat)))throw Error('Grupo sem acesso a este leilão.')
  const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value||stateDefault()
  const now=Date.now()
  const lot=state.lots?.[state.lot]
  const groupAllowed=Array.isArray(state.groups)&&state.groups.includes(chat)
  const acceptingBids=!AUCTION_PAUSED_FOR_AUDIT&&state.phase==='running'&&groupAllowed&&now>=START&&now<END&&now<Number(state.ends||0)
  return {
    title:'Leilão das Quatro Relíquias',phase:now<START?'scheduled':(state.phase||'pending'),
    acceptingBids,serverTime:now,startsAt:START,lotNumber:lot?Number(state.lot)+1:null,
    totalLots:PACKAGES.length,step:lot?.step||STEP,opening:lot?.min||OPENING,
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
