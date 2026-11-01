// Leilão dos Sete Pecados (01/11, 12h BRT) — 4 lotes públicos de 2min cada.
// Aviso antecipado restrito ao grupo AlphaBot; catálogo no !leilao e no Web.
// Estado, lances reservados e entrega final são transacionais no banco ativo.
import {randomBytes,createHash} from 'node:crypto'
import {extendAuctionDeadline,LOT_DURATION_MS} from './auction-rules.js'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction,petMaxEnergy,petMaxHp} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'
import {PECADOS_ESSENCES} from './sete-pecados-catalog.js'
import {otherAuctionGroups,crossGroupBidNotice} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'

const KEY='leilao_7_pecados_20261101_1200_v1'
// Edições anteriores mantêm seus dados e histórico em chaves próprias.
// Edição de 01/11 às 12h BRT, autorizada pelo organizador.
const AUCTION_PAUSED_FOR_AUDIT=false
// Temporary-recovery datasets must not broadcast or revive historical auctions.
// Chave isolada: modo temporário não reativa leilões históricos.
const START=Date.parse('2026-11-01T12:00:00-03:00')
const END=Date.parse('2026-11-01T13:00:00-03:00')
const DURATION=LOT_DURATION_MS
// Exceção limitada a este evento; não modifica licenças nem libera outros comandos.
const EVENT_GROUPS=new Set(['120363429534634131@g.us'])
const OPENING=8000000
const STEP=300000
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
// 7 essências diferentes equivalem a uma invocação oficial, não a sete invocações.
// Ordem fixa, premiação pública, entrega transacional.
const PACKAGES=[
  PECADOS_ESSENCES.map(id=>({id,qty:1})),
  [{id:'elixir_leilao_2h',qty:1},{id:'espada_guardiao',qty:1}],
  [{id:'selo_poder_5pct_alpha_20261019',qty:1},{xp:150000}],
  PECADOS_ESSENCES.map(id=>({id,qty:1}))
]
const LOT_OPENINGS=[OPENING,OPENING,OPENING,OPENING]
let timer=null,busy=false,initPromise=null,auctionSocket=null,startupPromise=null
const LOT4_REPLAY_ID='lot4_whatsapp_decryption_20261101_v1'
const REPLAY_NOTICE_DELAY_MS=60_000

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
  // Nunca distribuir avisos ou lances a todos os grupos licenciados.
  return [...EVENT_GROUPS]
}
async function sendGroups(sock,msg,groups){
  for(const jid of groups){
    try{await sock.sendMessage(jid,{text:msg})}
    catch(err){console.warn('[LEILAO 01NOV] aviso falhou',jid,err?.message||err)}
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
  if(items.length===PECADOS_ESSENCES.length&&PECADOS_ESSENCES.every(id=>items.some(x=>x.id===id&&x.qty===1)))
    return '🌈 Invocação oficial dos 7 Pecados: 7 essências diferentes, uma abertura aleatória'
  if(items.some(x=>x.id==='elixir_leilao_2h')&&items.some(x=>x.id==='espada_guardiao'))
    return '⏳ Ampulheta Dourada (XP 2× por 2h) + ⚔️ Espada do Guardião (Épica, +50 ATK e +25 HP)'
  if(items.some(x=>x.id==='selo_poder_5pct_alpha_20261019')&&items.some(x=>x.xp===150000))
    return '🔥 Selo de Potência Alpha (+5% ATK total permanente, ativo no inventário, não acumula) + ✨ 150.000 XP instantâneos'
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
  if(state.phase==='completed')return '🏁 *LEILÃO DOS SETE PECADOS ENCERRADO!* Os 4 lotes foram encerrados.'
  if(!lot)return '🔨 Leilão dos Sete Pecados em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO DOS SETE PECADOS — LOTE '+(Number(state.lot)+1)+'/'+PACKAGES.length+'*'+
    '\n🎁 *PRÊMIO:* '+publicPrize(lot.prize)+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'*'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n⚡ Lance nos últimos 15s: +20s de prorrogação (máx. 2min extras)'+

    '\n📩 *!lance 8000000* ou *!lance +300000* • *!leilao*'
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
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_7_pecados_20261101',$3)",
      [high.jid,high.value,KEY+':lot:'+state.lot+(state.lot===3&&state.replay?.id===LOT4_REPLAY_ID?':replay:'+LOT4_REPLAY_ID:'')]
    )
    report+='\n🏆 '+clean(high.name)+' — '+fmt(high.value)+'\n🎁 PRÊMIO ENTREGUE:\n• '+received.join('\n• ')
  }else{
    report+='\n📭 Sem arremate. Prêmio: '+publicPrize(lot.prize)
  }
  state.history.push(entry)
  return report
}

// Uma única reedição autorizada do 4º lote de 01/11.
// Estorno, reversão de itens, auditoria e anúncio são uma transação atômica.
// Nunca alterar os lotes 1–3 nem executar a compensação duas vezes.
async function reopenFourthLotAfterDeliveryFailure(){
  await init()
  return change(async(state,c)=>{
    if(state.replay?.id===LOT4_REPLAY_ID)
      return {active:Boolean(state.replay.active),alreadyProcessed:true}
    const history=Array.isArray(state.history)?state.history:[]
    const old=history.find(x=>Number(x.lot)===3)
    const high=state.high
    if(state.phase!=='completed'||Number(state.lot)!==3||history.length!==4||
       !old?.winner||!high||old.winner.jid!==high.jid||
       Number(old.winner.bid)!==8000000||Number(high.value)!==8000000||
       Number(high.cash)!==8000000||Number(high.bank)!==0)
      throw Error('Reedição do lote 4: resultado original não corresponde à auditoria; nada alterado')
    const prizeItems=state.lots?.[3]?.prize||[]
    if(prizeItems.length!==7||prizeItems.some(x=>!x.id||Number(x.qty)!==1))
      throw Error('Reedição lote 4: itens não correspondem às sete essências')
    const ids=prizeItems.map(x=>x.id)
    if(new Set(ids).size!==7)throw Error('Reedição lote 4: prêmio duplicado')
    const original=(await c.query(
      "SELECT id,amount,from_jid FROM transactions WHERE type='leilao_7_pecados_20261101' AND note=$1 FOR UPDATE",
      [KEY+':lot:3']
    )).rows
    if(original.length!==1||Number(original[0].amount)!==8000000||original[0].from_jid!==high.jid)
      throw Error('Reedição lote 4: transação de pagamento original não localizada')
    const wallet=(await c.query('SELECT jid FROM wallets WHERE jid=$1 FOR UPDATE',[high.jid])).rows[0]
    if(!wallet)throw Error('Reedição lote 4: carteira original ausente')
    const inventory=(await c.query(
      'SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[]) FOR UPDATE',
      [high.jid,ids]
    )).rows
    if(ids.some(id=>!inventory.some(x=>x.item_id===id&&Number(x.quantity)>=1)))
      throw Error('Reedição lote 4: prêmio já utilizado; estorno automático interrompido')
    const removed=await c.query(
      'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=ANY($2::text[]) AND quantity>=1 RETURNING item_id',
      [high.jid,ids]
    )
    if(removed.rowCount!==7)throw Error('Reedição lote 4: reversão de inventário incompleta')
    await c.query(
      'UPDATE wallets SET cash=cash+$1,bank=bank+$2,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$3',
      [high.cash,high.bank,high.jid]
    )
    await c.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'leilao_7_pecados_20261101_estorno',$3)",
      [high.jid,high.value,KEY+':lot:3:estorno:'+LOT4_REPLAY_ID]
    )
    const now=Date.now()
    state.replay={id:LOT4_REPLAY_ID,active:true,status:'pending',
      startAt:now+REPLAY_NOTICE_DELAY_MS,original:old,originalTransactionId:original[0].id,
      refunded:high.value,refundedCash:high.cash,refundedBank:high.bank,
      revokedItems:ids,createdAt:now}
    state.history=history.filter(x=>Number(x.lot)!==3)
    state.phase='replay_pending'
    state.high=null
    state.recentBids=[]
    state.ends=0
    state.extra=0
    delete state.finished
    state.bidNoticeVersion=Number(state.bidNoticeVersion||0)+1
    await queueAuctionBidNotices(c,{
      key:KEY,version:state.bidNoticeVersion,groups:state.groups,origin:'system',
      message:'⚠️🔨 *LEILÃO DOS SETE PECADOS — 4º LOTE ANULADO*\n\n'+
        'Devido a uma *falha técnica nas mensagens do WhatsApp*, o quarto lote será refeito para garantir igualdade de condições.\n'+
        '✅ *R$ 8.000.000 estornados integralmente* ao vencedor anterior.\n'+
        '↩️ O prêmio do arremate anulado foi revertido. Os lotes 1, 2 e 3 permanecem válidos.\n\n'+
        '⏳ *Novo 4º lote em 1 minuto.* Lance inicial: *R$ 8.000.000*; incremento: *R$ 300.000*.\n'+
        '⚔️ A disputa durará 2 minutos, com prorrogação nos últimos segundos.\n'+
        '📢 *Acompanhem pelo !leilao*.'
    })
    console.log('[LEILAO REPLAY 4] estorno aplicado',JSON.stringify({
      originalTransactionId:original[0].id,refund:high.value,revoked:removed.rowCount,
      opensAt:state.replay.startAt
    }))
    return {active:true,refunded:true}
  })
}

async function tick(sock){
  if(busy)return
  busy=true
  try{
    const now=Date.now()
    // Aviso único no grupo AlphaBot; grava na outbox para reenvio em caso de falha.
    if(now<START){
      if(now>=START-3*60*60*1000){
        await init()
        await change(async(state,c)=>{
          if(state.phase!=='pending'||state.preAnnounced)return
          state.groups=await licensedGroups()
          state.preAnnounced=true
          await queueAuctionBidNotices(c,{
            key:KEY,version:0,groups:state.groups,origin:'system',
            message:`🔨🌈 *LEILÃO DOS SETE PECADOS — HOJE ÀS 12H!*

🎁 *4 LOTES SURPRESA*
✨ Prêmios raros e recompensas especiais.
🔒 O prêmio de cada lote será revelado somente na sua abertura.

💰 Lance inicial: *R$ 8.000.000* por lote.
📈 Incrementos de *R$ 300.000*.
⏱️ 2 minutos por lote, com prorrogação nos últimos segundos.
📢 Exclusivo do grupo AlphaBot.
📋 Use *!leilao* para acompanhar.`
          })
        })
        await flushAuctionBidNotices(db,sock,KEY,{limit:8})
      }
      return
    }
    const current=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const replayActive=current?.replay?.id===LOT4_REPLAY_ID&&current.replay.active===true
    if(now>END+5*60*1000&&!replayActive){if(timer){clearInterval(timer);timer=null};return}
    // Outbox durável: primeiro garante que o cancelamento seja anunciado.
    await init()
    await flushAuctionBidNotices(db,sock,KEY,{limit:8})
    await warnAuctionDeliveryFailures(db,sock,KEY)
    if(now>END&&!replayActive)return
    if(current?.phase==='completed'){
      if(now>Number(current.finished||END)+5*60*1000){if(timer){clearInterval(timer);timer=null}}
      return
    }
    if(current?.phase==='replay_pending' && now<Number(current.replay?.startAt||0))return
    if(current?.phase==='running' && now<Number(current.ends||0))return
    const groups=current?.groups?.length?current.groups:await licensedGroups()
    if(!groups.length)return
    let outgoing=''
    await change(async(state,c)=>{
      if(state.phase==='completed')return
      if(state.phase==='replay_pending'){
        if(now<Number(state.replay?.startAt||0))return
        beginLot(state,now)
        state.replay.status='running'
        state.bidNoticeVersion=Number(state.bidNoticeVersion||0)+1
        await queueAuctionBidNotices(c,{
          key:KEY,version:state.bidNoticeVersion,groups:state.groups,origin:'system',
          message:'🔨🌈 *QUARTO LOTE REABERTO — NOVA DISPUTA!*\n\n'+
            '⚠️ A disputa anterior foi anulada por falha técnica.\n\n'+
            status(state)
        })
        console.log('[LEILAO REPLAY 4] lote reaberto',JSON.stringify({ends:state.ends}))
      }else if(state.phase==='pending'){
        state.lots=createPublicLots()
        const ids=[...new Set(state.lots.flatMap(x=>x.prize).map(x=>x.id).filter(Boolean))]
        const rows=(await c.query('SELECT id FROM items WHERE id=ANY($1::text[])',[ids])).rows
        for(const id of ids)if(!rows.some(x=>x.id===id))throw Error('Premiação ausente: '+id)
        state.groups=groups
        state.salt=randomBytes(16).toString('hex')
        state.seal=createHash('sha256').update(JSON.stringify(state.lots.map(x=>x.prize))+':'+state.salt).digest('hex')
        state.lot=0
        beginLot(state,now)
        outgoing='🔨💎 *LEILÃO DOS SETE PECADOS COMEÇOU!*\n\n'+
           '🎁 *4 LOTES SURPRESA!* O prêmio de cada lote será revelado na sua abertura.'+
          '\n\n💰 Lance inicial: *'+fmt(OPENING)+'*'+
          '\n📈 Incremento mínimo: *'+fmt(STEP)+'*'+
          '\n⏱️ *2 minutos por lote*. Lance nos últimos 15s: +20s, até +2min.'+
           '\n👀 Apenas o prêmio do lote em disputa é divulgado. Lances e líderes são públicos.'+
          '\n✅ O maior lance é reservado; se superado, é devolvido.'+
          '\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=await finishLot(state,c)
        if(state.lot===PACKAGES.length-1){
          state.phase='completed'
          state.finished=Date.now()
          if(state.replay?.id===LOT4_REPLAY_ID){
            state.replay.active=false
            state.replay.status='completed'
            state.replay.finishedAt=state.finished
            state.bidNoticeVersion=Number(state.bidNoticeVersion||0)+1
            await queueAuctionBidNotices(c,{
              key:KEY,version:state.bidNoticeVersion,groups:state.groups,origin:'system',
              message:outgoing+'\n\n✅ *REEDIÇÃO DO 4º LOTE FINALIZADA.* Os demais lotes permaneceram intactos.'
            })
            outgoing=''
          }else outgoing+='\n\n🏁 *LEILÃO DOS SETE PECADOS CONCLUÍDO!* Todos os lotes encerrados.'
        }else{
          state.lot++
          beginLot(state,now)
          outgoing+='\n\n'+status(state)
        }
      }
    })
    if(outgoing)await sendGroups(sock,outgoing,groups)
    if(replayActive)await flushAuctionBidNotices(db,sock,KEY,{limit:8})
  }catch(err){
    console.error('[LEILAO 01NOV]',err?.stack||err)
  }finally{busy=false}
}
export function startAuctionAlphaScheduler(sock){
  // Socket mais recente, sem criar timers concorrentes nem repetir estornos.
  auctionSocket=sock
  if(AUCTION_PAUSED_FOR_AUDIT){
    if(timer){clearInterval(timer);timer=null}
    return
  }
  if(timer||startupPromise)return
  startupPromise=(async()=>{
    const replay=await reopenFourthLotAfterDeliveryFailure()
    if(Date.now()>END&&!replay?.active){
      console.log('[LEILAO 01NOV] edição concluída; replay não está ativo')
      return
    }
    timer=setInterval(()=>{void tick(auctionSocket)},5000)
    timer.unref?.()
    await tick(auctionSocket)
  })().catch(err=>console.error('[LEILAO REPLAY 4] inicialização cancelada com segurança',err?.stack||err))
    .finally(()=>{startupPromise=null})
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
    await reply('🔨 O Leilão dos Sete Pecados acontece somente no grupo AlphaBot.')
    return true
  }
  if(!EVENT_GROUPS.has(chat)){
    await reply('🔒 Esta edição é exclusiva do grupo AlphaBot.')
    return true
  }
  if(Date.now()<START){
    await reply('🔨💎 *LEILÃO DOS SETE PECADOS AGENDADO*\n⏰ Começa às *12h00* (Brasília) de 01/11.\n🎁 *4 LOTES SURPRESA* — cada prêmio será revelado na abertura do respectivo lote.\n💰 Lance inicial: *'+fmt(OPENING)+'* por lote • incremento: *'+fmt(STEP)+'*.\n📋 Volte com *!leilao* às 12h00.')
    return true
  }
  if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sync=state?.phase==='running'?await auctionNoticeSummary(db,KEY,Number(state.bidNoticeVersion||0)):null
    const syncLine=sync?'\n📡 Avisos: '+sync.sent+' enviados, '+sync.pending+' pendentes, '+sync.failed+' falharam.':''
    await reply(state?.phase==='running'?status(state)+syncLine:
      state?.phase==='replay_pending'?'⚠️ *REEDIÇÃO DO 4º LOTE*\nA disputa anterior foi anulada por falha técnica e o valor foi estornado.\n🔨 Abertura: *'+clock(state.replay.startAt)+'* (Brasília).\n💰 Lance inicial: *'+fmt(OPENING)+'*.':
      state?.phase==='completed'?'🏁 Leilão dos Sete Pecados encerrado. Consulte os prêmios divulgados antes do evento.':
      '⏳ Leilão dos Sete Pecados sendo aberto. Consulte novamente em instantes.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){
    await reply('❌ Lance inválido. Envie *!lance 8000000*, *!lance 8300000* ou *!lance +300000*.')
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
      result.notice=result.notice.replace('LEILÃO DAS SOMBRAS','LEILÃO DOS SETE PECADOS')
      if(web)result.notice=result.notice.replace('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!')
      result.notice+='\n🎁 Prêmio do lote: '+publicPrize(lot.prize)
      await queueAuctionBidNotices(c,{key:KEY,version:result.version,groups:result.otherGroups,origin:web?'web':chat,message:result.notice})
      return result
    })
    // O lance já foi confirmado no Neon. Uma falha de envio não o desfaz.
    try{await reply(result.confirmation)}
    catch(err){console.warn('[LEILAO 01NOV] lance gravado; confirmação local não enviada',err?.message||err)}
    if(result.otherGroups.length){
      if(auctionSocket?.sendMessage){
        // Delivery is durable: a failed transport does not discard the notice.
        void flushAuctionBidNotices(db,auctionSocket,KEY).then(()=>warnAuctionDeliveryFailures(db,auctionSocket,KEY))
          .catch(err=>console.error('[LEILAO 01NOV] fila de avisos',err?.message||err))
      }else console.warn('[LEILAO 01NOV] lance aceito, avisos pendentes até reconexão')
    }
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}

// The Web API uses the same locked bidding path as WhatsApp; never a second auction.
// Exposição pública das descrições dos prêmios, sem salt nem dados privados dos jogadores.
export async function getAuctionWebStatus({chat,sender}){
  if(!String(chat||'').endsWith('@g.us'))throw Error('Vincule seu Web a um grupo com !web no WhatsApp.')
  if(!EVENT_GROUPS.has(chat))throw Error('Esta edição é exclusiva do grupo AlphaBot.')
  const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value||stateDefault()
  const now=Date.now()
  const lot=state.lots?.[state.lot]
  const groupAllowed=Array.isArray(state.groups)&&state.groups.includes(chat)
  const acceptingBids=!AUCTION_PAUSED_FOR_AUDIT&&state.phase==='running'&&groupAllowed&&now>=START&&(now<END||state.replay?.active===true)&&now<Number(state.ends||0)
  return {
    title:'Leilão dos Sete Pecados',phase:now<START?'scheduled':(state.phase||'pending'),
    acceptingBids,serverTime:now,startsAt:START,lotNumber:lot?Number(state.lot)+1:null,
    totalLots:PACKAGES.length,step:lot?.step||STEP,opening:lot?.min||OPENING,
    prizesPublic:state.phase==='running',prize:state.phase==='running'&&lot?publicPrize(lot.prize):null,
    lots:(state.lots?.length?state.lots:createPublicLots()).map((x,i)=>({
      lotNumber:i+1,
      description:state.phase==='running'&&i===Number(state.lot)?publicPrize(x.prize):
        state.phase==='completed'||i<Number(state.lot)?(state.history||[]).find(h=>Number(h.lot)===i)?.rewards?.join(', ')||'Lote encerrado':
        '🎁 Lote surpresa — revelado somente na abertura'
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
