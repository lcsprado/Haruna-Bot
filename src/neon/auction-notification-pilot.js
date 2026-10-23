// One-time live WhatsApp delivery exercise. SIMULATED bids only: no wallets,
// transactions, inventories, experience, or gameplay rewards are modified.
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense} from './db.js'
import {otherAuctionGroups} from './auction-bid-notice.js'
import {initAuctionNoticeOutbox,queueAuctionBidNotices,auctionNoticeSummary,flushAuctionBidNotices,warnAuctionDeliveryFailures} from './auction-notice-outbox.js'
const KEY='leilao_aviso_global_teste_20261023_v1'
const DURATION_MS=15*60*1000
const MINIMUM=100000
const STEP=50000
let timer=null,activeSocket=null,busy=false,initializing=null
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').replace(/\s+/g,' ').trim().slice(0,45)
const clock=ms=>new Date(Number(ms)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
async function setup(){
  if(!initializing)initializing=initAuctionNoticeOutbox(db).catch(err=>{initializing=null;throw err})
  await initializing
}
async function mutate(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY])
    const r=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])
    const state=r.rows[0]?.value||null
    const result=await fn(state,c)
    if(result?.save){
      await c.query(`
        INSERT INTO trevo_settings(key,value,updated_at)
        VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
      `,[KEY,JSON.stringify(result.save)])
    }
    await c.query('COMMIT')
    return result?.value
  }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}
  finally{c.release()}
}
async function getState(){
  const r=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])
  return r.rows[0]?.value||null
}
function show(state,sync){
  const high=state.high
  const minimum=high?Number(high.value)+STEP:MINIMUM
  const delivery=sync
    ?'\n📡 Avisos: '+sync.sent+' aceito(s), '+sync.pending+' pendente(s), '+sync.failed+' com falha.'
    :''
  const status=state.phase==='running'?'🟢 Em andamento':'🏁 Encerrado'
  return '🧪 *LEILÃO TESTE — SEM DINHEIRO REAL*\n'
    +'🔬 Rodada de validação entre grupos. Nenhum saldo, XP ou item será alterado.\n'
    +'📍 '+status
    +'\n🏆 Maior lance no Aiven: '+(high?fmt(high.value)+' — '+clean(high.name):'Nenhum')
    +'\n📈 Próximo lance mínimo: '+fmt(minimum)
    +'\n👥 Grupos participantes: '+state.groups.length
    +'\n⏳ Encerra: '+clock(state.ends)+' (Brasília)'
    +delivery
    +(state.phase==='running'?'\n📩 *!lance '+minimum+'* ou *!lance +50000*':'\n✅ Apenas simulação; nenhuma cobrança realizada.')
}
function parseAmount(raw){
  const s=String(raw||'').replace(/\./g,'').replace(/\s/g,'').toLowerCase()
  const m=/^(\+)?(\d+)(k|mil|m|mi)?$/.exec(s)
  if(!m)return null
  const multi=['k','mil'].includes(m[3])?1000:['m','mi'].includes(m[3])?1000000:1
  const value=Number(m[2])*multi
  return Number.isSafeInteger(value)&&value>0?{relative:!!m[1],value}:null
}
async function tick(){
  if(busy)return
  busy=true
  try{
    await setup()
    let state=await getState()
    if(!state){
      const groups=(await listGroupLicenses(500))
        .filter(groupLicenseIsActive).map(g=>g.chat_jid)
        .filter(j=>String(j).endsWith('@g.us'))
      const unique=[...new Set(groups)]
      if(unique.length){
        const result=await mutate(async(existing,c)=>{
          if(existing)return {value:existing}
          const now=Date.now()
          const fresh={phase:'running',groups:unique,startedAt:now,ends:now+DURATION_MS,high:null,version:0,bids:0}
          const opening='🧪 *LEILÃO TESTE GLOBAL INICIADO*\n'
             +'⚠️ Apenas simulação! Não desconta dinheiro e não entrega itens ou XP.\n'
             +'📢 Vamos conferir se os lances de um grupo chegam aos outros.\n'
             +'💰 Lance inicial fictício: '+fmt(MINIMUM)
             +'\n📈 Incremento mínimo: '+fmt(STEP)
             +'\n⏱️ Duração: 15 minutos\n📩 Use *!leilao* e *!lance 100000*.'
          // Opening is delivered using the same persisted notification system.
          await queueAuctionBidNotices(c,{key:KEY,version:0,groups:unique,origin:'system',message:opening})
          return {save:fresh,value:fresh}
        })
        state=result
        console.log('[AUCTION PILOT] start',{groups:state.groups.length,ends:state.ends})
      }
    }
    if(!state)return
    if(state.phase==='completed' && Date.now()>Number(state.finished||state.ends)+3*60*1000){
      if(timer){clearInterval(timer);timer=null}
      return
    }
    if(state.phase==='running'&&Date.now()>=Number(state.ends)){
      const closed=await mutate(async(s,c)=>{
        if(!s||s.phase!=='running'||Date.now()<Number(s.ends))return {value:false}
        s.phase='completed';s.finished=Date.now();s.version=Number(s.version||0)+1
        const ending='🏁 *LEILÃO TESTE ENCERRADO*\n'
          +'🧪 Nenhum dinheiro, XP ou item foi movimentado.\n'
          +'🏆 Maior lance fictício: '+(s.high?fmt(s.high.value)+' — '+clean(s.high.name):'Nenhum')
          +'\n📋 Use *!leilao* para conferir o resultado.'
        await queueAuctionBidNotices(c,{key:KEY,version:s.version,groups:s.groups,origin:'system',message:ending})
        return {save:s,value:true}
      })
      if(closed)console.log('[AUCTION PILOT] completed')
    }
    await flushAuctionBidNotices(db,activeSocket,KEY,{limit:8})
    await warnAuctionDeliveryFailures(db,activeSocket,KEY)
  }catch(err){console.error('[AUCTION PILOT]',String(err?.stack||err).slice(0,800))}
  finally{busy=false}
}
export function startAuctionNotificationPilot(sock){
  activeSocket=sock
  if(timer)clearInterval(timer)
  timer=setInterval(()=>{void tick()},10000)
  timer.unref?.()
  void tick()
}
export async function handleAuctionNotificationPilotCommand({cmd,args,sender,name,chat,reply}){
  if(!['leilao','lance','leilaoteste','lanceteste'].includes(cmd))return false
  const state=await getState()
  if(!state)return false
  if(state.phase==='completed' && Date.now()>Number(state.finished||state.ends)+3*60*1000)return false
  if(!String(chat||'').endsWith('@g.us')){await reply('🧪 O leilão teste acontece nos grupos.');return true}
  if(!groupLicenseIsActive(await getGroupLicense(chat)) || !state.groups.includes(chat)){
    await reply('🧪 Este grupo não participa desta rodada teste.');return true
  }
  if(cmd==='leilao'||cmd==='leilaoteste'){
    const sync=await auctionNoticeSummary(db,KEY,Number(state.version||0))
    await reply(show(state,sync))
    return true
  }
  if(state.phase!=='running'||Date.now()>=Number(state.ends)){
    await reply('🏁 Leilão teste encerrado. Não houve movimentação de dinheiro.')
    return true
  }
  const parsed=parseAmount(args?.[0])
  if(!parsed){await reply('❌ Teste: use *!lance 100000* ou *!lance +50000*. Não desconta dinheiro.');return true}
  try{
    const result=await mutate(async(s,c)=>{
      if(!s||s.phase!=='running'||Date.now()>=Number(s.ends))
        throw Error('O leilão teste terminou. Consulte !leilao.')
      if(!s.groups.includes(chat))throw Error('Grupo não participante.')
      const minimum=s.high?Number(s.high.value)+STEP:MINIMUM
      const offered=parsed.relative?(s.high?Number(s.high.value):MINIMUM-STEP)+parsed.value:parsed.value
      if(!Number.isSafeInteger(offered)||offered<minimum||offered>100000000)
        throw Error('Próximo lance mínimo: '+fmt(minimum))
      s.high={jid:sender,name:clean(name),value:offered}
      s.version=Number(s.version||0)+1
      s.bids=Number(s.bids||0)+1
      const otherGroups=otherAuctionGroups(s.groups,chat)
      const notice='🧪 *LEILÃO TESTE — LANCE DE OUTRO GRUPO*\n'
        +'⚠️ Simulação: não há descontos nem prêmios.\n'
        +'👤 Jogador: *'+clean(s.high.name)+'*\n'
        +'💰 Maior lance fictício: *'+fmt(offered)+'*\n'
        +'📈 Próximo lance mínimo: *'+fmt(offered+STEP)+'*\n'
        +'⏳ Encerra às *'+clock(s.ends)+'* (Brasília)\n'
        +'📩 Use *!lance '+(offered+STEP)+'* para testar ou *!leilao* para conferir.'
      await queueAuctionBidNotices(c,{key:KEY,version:s.version,groups:otherGroups,origin:chat,message:notice})
      return {save:s,value:{offered,version:s.version,targets:otherGroups.length}}
    })
    await reply('✅ *LANCE TESTE ACEITO GLOBALMENTE*\n'
      +'💰 '+fmt(result.offered)+'\n📈 Próximo mínimo: '+fmt(result.offered+STEP)
      +'\n📡 Outros grupos a avisar: '+result.targets
      +'\n🧪 Simulação: R$ 0 debitado; nenhum prêmio.')
    // Start delivery without delaying subsequent WhatsApp commands.
    void tick()
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}