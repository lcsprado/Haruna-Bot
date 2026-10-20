// Leilão Oculto Alpha — edição 20/10/2026: 4 lotes de 2 minutos.
// Os lotes são embaralhados e os prêmios de todos os lotes só são revelados no final.
// Estado, lances reservados e entrega final são transacionais no Neon.
import {randomInt,randomBytes,createHash} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense,grantExpInTransaction} from './db.js'
import {initEnchantments} from './enchantments-alpha.js'

const KEY='leilao_oculto_alpha_20261020_1215_v1'
// Temporary-recovery datasets must not broadcast or revive historical auctions.
// Chave isolada: modo temporário não reativa leilões históricos.
const START=Date.parse('2026-10-20T12:15:00-03:00')
const END=Date.parse('2026-10-20T16:00:00-03:00')
const DURATION=2*60*1000
const OPENING=100000
const STEP=50000
const SEAL_ITEM='selo_poder_5pct_alpha_20261019'
const fmt=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const clean=n=>String(n||'Jogador').replace(/[\r\n*]/g,' ').slice(0,45)
const clock=n=>new Date(Number(n)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
// Os pacotes nunca são exibidos nos anúncios, status ou lances; cada lote
// oferece mais de um item e o pacote de maior valor pode ocupar qualquer posição.
const PACKAGES=[
  [{xp:20000},{id:'pedra_furia_alpha',qty:1},{id:'caixa_epica',qty:2}],
  [{id:'bota_vortice_alpha_20261020',qty:1},{id:'pedra_agilidade_alpha',qty:1},{xp:10000}],
  [{id:'elmo_imperador_alpha_20261020',qty:1},{id:'pedra_precisao_alpha',qty:1},{id:'caixa_lendaria',qty:1}],
  [{id:'elixir_leilao_2h',qty:1},{id:'pedra_fortaleza_alpha',qty:2},{id:'caixa_epica',qty:3},{id:'caixa_lendaria',qty:1}]
]
let timer=null,busy=false,initPromise=null

async function init(){
  if(initPromise)return initPromise
  initPromise=(async()=>{
    await initEnchantments()
    const definitions=[
      [SEAL_ITEM,'Selo de Potência Alpha',
        'Relíquia permanente: +5% de ATK total, inclusive equipamentos e encantamentos; ativo automaticamente enquanto estiver no inventário. Não acumula.','special',false],
      ['pergaminho_leilao_10k','Pergaminho de 10.000 XP',
        '+10.000 XP instantâneo; um pergaminho por dia.','consumable',true]
    ]
    for(const [id,name,description,category,stackable] of definitions){
      await db.query(
        'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,0,$5,FALSE,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,sellable=FALSE,stackable=EXCLUDED.stackable',
        [id,name,description,category,['helmet','boots'].includes(category)?'legendary':'event',stackable]
      )
    }
  })()
  try{await initPromise}catch(e){initPromise=null;throw e}
}
async function licensedGroups(){
  const groups=await listGroupLicenses(500)
  return [...new Set(groups.filter(groupLicenseIsActive).map(g=>g.chat_jid).filter(j=>String(j).endsWith('@g.us')))]
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
  return p.map((prize,index)=>({label:'🎁 Lote Oculto '+(index+1),min:OPENING,step:STEP,prize}))
}
function status(state){
  const lot=state.lots?.[state.lot]
  if(state.phase==='completed')return '🏁 *LEILÃO OCULTO ENCERRADO!*\nOs 4 lotes foram revelados e as recompensas foram entregues.'
  if(!lot)return '🔨 Leilão Oculto Alpha em preparação.'
  const minimum=state.high?Number(state.high.value)+lot.step:lot.min
  return '🔨 *LEILÃO OCULTO ALPHA — LOTE '+(Number(state.lot)+1)+'/4*'+
    '\n🎁 *CAIXA MISTERIOSA* — conteúdo e valor desconhecidos!'+
    '\n🔒 O prêmio só aparece quando os *4 lotes* terminarem.'+
    '\n💰 Lance inicial: '+fmt(lot.min)+
    '\n📈 Próximo lance mínimo: *'+fmt(minimum)+'* (aumentos de '+fmt(lot.step)+' ou mais)'+
    '\n🏆 Maior lance: '+(state.high?fmt(state.high.value)+' — '+clean(state.high.name):'Nenhum')+
    '\n⏳ Encerra às *'+clock(state.ends)+'* (Brasília)'+
    '\n📩 *!lance 100000* ou *!lance +50000*'+
    '\n📋 *!leilao* para consultar'
}
async function prize(c,jid,packageItems){
  const received=[]
  for(const item of packageItems){
    if(item.xp){
      await grantExpInTransaction(c,jid,item.xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
      received.push('✨ '+Number(item.xp).toLocaleString('pt-BR')+' XP instantâneos')
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
  state.ends=now+DURATION
  state.extra=0
}
function finishLot(state){
  const lot=state.lots[state.lot]
  const high=state.high
  state.history.push({lot:state.lot,winner:high?{jid:high.jid,name:high.name,bid:high.value}:null})
  return '🔨 *LOTE '+(state.lot+1)+'/4 ENCERRADO*'+
    '\n🏆 '+(high?'Arrematado por *'+clean(high.name)+'* — '+fmt(high.value):'Sem comprador')+
    '\n🎁 Conteúdo continuará *OCULTO* até o fim do quarto lote.'
}
async function revealAll(state,c){
  let report='\n\n🎉 *REVELAÇÃO FINAL — LEILÃO OCULTO ALPHA*'
  for(const entry of state.history){
    report+='\n\n🎁 *LOTE '+(entry.lot+1)+'*'
    if(!entry.winner){
      report+='\n📭 Sem arremate. Prêmio permaneceu secreto.'
      continue
    }
    const items=state.lots[entry.lot].prize
    const delivered=await prize(c,entry.winner.jid,items)
    await c.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'leilao_oculto_alpha',$3)",
      [entry.winner.jid,entry.winner.bid,KEY+':lot:'+entry.lot]
    )
    report+='\n🏆 *'+clean(entry.winner.name)+'* — '+fmt(entry.winner.bid)+
      '\n✨ Recompensas:\n• '+delivered.join('\n• ')
  }
  state.phase='completed'
  state.finished=Date.now()
  return report+'\n\n✅ Prêmios entregues uma vez só. Valores dos vencedores já estavam reservados desde os lances.'+
    '\n🔐 Integridade do sorteio: '+state.seal+
    '\n🔑 Chave: '+state.salt
}
async function tick(sock){
  if(busy)return
  busy=true
  try{
    const now=Date.now()
    if(now<START||now>END)return
    const current=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    if(current?.phase==='completed'){
      if(timer){clearInterval(timer);timer=null}
      return
    }
    if(current?.phase==='running' && now<Number(current.ends||0))return
    const groups=current?.groups?.length?current.groups:await licensedGroups()
    if(!groups.length)return
    await init()
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
        outgoing='🔨🎁 *LEILÃO OCULTO ALPHA COMEÇOU!*\n\n'+
          '🎭 *4 lotes totalmente secretos*. Até quem organiza não conhece a ordem dos pacotes.'+
          '\n💰 Lance inicial por lote: *'+fmt(OPENING)+'*'+
          '\n📈 Aumentos de pelo menos *'+fmt(STEP)+'*; também vale dar lances maiores.'+
          '\n⏱️ *2 minutos por lote*, sem prorrogação.'+
          '\n✅ Sem taxa de entrada. O lance é reservado e devolvido se for superado.'+
          '\n🔒 Os prêmios de TODOS os lotes serão revelados somente quando o leilão terminar.'+
          '\n\n'+status(state)
      }else if(state.phase==='running' && now>=Number(state.ends||0)){
        outgoing=finishLot(state)
        if(state.lot===PACKAGES.length-1){
          outgoing+=await revealAll(state,c)
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
export async function handleAuctionAlphaCommand({cmd,args,sender,name,chat,reply}){
  if(!['leilao','lance'].includes(cmd))return false
  if(!String(chat||'').endsWith('@g.us')){
    await reply('🔨 O Leilão Oculto acontece nos grupos.')
    return true
  }
  if(!groupLicenseIsActive(await getGroupLicense(chat))){
    await reply('🔒 É necessário ter licença ativa para participar.')
    return true
  }
  if(Date.now()<START){
    await reply('🔨 O Leilão Oculto ainda não começou.')
    return true
  }
  if(cmd==='leilao'){
    const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    await reply(state?.phase==='running'?status(state):
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
      return '✅ *LANCE ACEITO — LOTE '+(state.lot+1)+'/4*\n💰 '+fmt(offered)+
        '\n🔒 Reservado até você vencer ou ser superado.'+
        '\n🎁 O conteúdo só será revelado ao final dos três lotes.'+
        '\n📈 Próximo lance: '+fmt(offered+lot.step)+
        '\n⏳ Encerra: '+clock(state.ends)
    })
    await reply(result)
  }catch(err){await reply('❌ '+String(err?.message||err))}
  return true
}
