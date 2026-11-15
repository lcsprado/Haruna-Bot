import {randomInt} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense} from './db.js'

// Bingo Alpha de 15/11/2026, às 19h30 de Brasília, cartela grátis por pessoa.
const KEY='bingo_alpha_20261115_1930_v1'
const ANNOUNCE=Date.parse('2026-11-15T19:00:00-03:00')
const EVENT_END=Date.parse('2026-11-15T23:00:00-03:00')
const EVENT_START=Date.parse('2026-11-15T19:30:00-03:00')
const BALL_INTERVAL_MS=25000
const NUMBER_LIMIT=40
const REWARD={full:5000000}
let busy=false
let timer=null
const num=x=>Number(x||0)
const formatMoney=v=>'R$ '+num(v).toLocaleString('pt-BR')
const shuffle=list=>{
  const a=[...list]
  for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}
  return a
}
const pick=a=>a[randomInt(a.length)]
const basicState=()=>({phase:'registration',players:{},drawn:[],prizes:{},bonusPayDone:false,stage:0,startAt:EVENT_START})
const localClock=ms=>new Date(Number(ms)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})

// A edição de 15/11 não cria nem distribui troféus.
async function ensureTrophy(){}
async function mutate(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
    const found=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])
    const s=found.rows[0]?.value||basicState()
    if(!Number(s.startAt))s.startAt=Date.now()+REGISTRATION_MS
    const r=await fn(s,c)
    await c.query(`INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)
      ON CONFLICT(key) DO UPDATE SET
      value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[KEY,JSON.stringify(s)])
    await c.query('COMMIT')
    return r
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{})
    throw e
  }finally{c.release()}
}
function cover(card,p,s){
  const drawn=new Set(s.drawn||[])
  const wild=new Set(p.wild||[])
  return card.map((value,i)=>value===null || drawn.has(value) || wild.has(i))
}
function rowCount(marked){
  return [[0,1,2],[3,4,5],[6,7,8]].filter(row=>row.every(i=>marked[i])).length
}
function cardText(p,s){
  // ● marcado automaticamente; ○ pendente; LIV é a casa grátis.
  // Símbolos de largura fixa garantem alinhamento no WhatsApp.
  const marked=cover(p.card,p,s)
  const cell=i=>{
    if(p.card[i]===null)return ' LIV '
    const n=String(p.card[i]).padStart(2,'0')
    return ' '+(marked[i]?'●':'○')+n+' '
  }
  const line=from=>'│'+[0,1,2].map(k=>cell(from+k)).join('│')+'│'
  const safeName=String(p.name||'Jogador').replace(/[\r\n*`]/g,' ').slice(0,50)
  const situation=s.phase==='completed'?'🏁 Sorteio encerrado':s.phase==='running'?'🟢 Sorteio em andamento':'⏰ Sorteio às '+localClock(s.startAt)+' (Brasília)'
  const called=(s.drawn||[]).slice(-6).map(v=>String(v).padStart(2,'0')).join(' • ')
  return [
    '🎟️ *BINGO ALPHA — SUA CARTELA*',
    '👤 *'+safeName+'*',
    '',
    '```',
    '┌─────┬─────┬─────┐',
    line(0),
    '├─────┼─────┼─────┤',
    line(3),
    '├─────┼─────┼─────┤',
    line(6),
    '└─────┴─────┴─────┘',
    '```',
    '🟢 ● Marcado   ⚪ ○ Pendente   ⭐ LIV Grátis',
    '🔢 Últimos sorteados: '+(called||'Aguardando'),
    '📊 Bolas: *'+(s.drawn?.length||0)+'/40*  •  ✅ Linhas: *'+rowCount(marked)+'/3*',
    situation
  ].join('\n')
}
function ticket(){
  const values=shuffle(Array.from({length:NUMBER_LIMIT},(_,i)=>i+1)).slice(0,8)
  return [...values.slice(0,4),null,...values.slice(4)]
}
async function eligibleGroups(){
  const licenses=await listGroupLicenses(500)
  return [...new Set(licenses.filter(groupLicenseIsActive).map(l=>l.chat_jid).filter(x=>String(x).endsWith('@g.us')))]
}
async function announce(sock,text,targets){
  // O grupo AlphaBot é o principal, e deve receber o aviso antes dos demais.
  const primary='120363429534634131@g.us'
  const ordered=[...new Set(targets)].sort((a,b)=>Number(b===primary)-Number(a===primary))
  for(const jid of ordered){
    let timeout
    try{
      const result=await Promise.race([
        sock.sendMessage(jid,{text}),
        new Promise((_,reject)=>{
          timeout=setTimeout(()=>reject(new Error('timeout de 12 segundos no envio')),12000)
          timeout.unref?.()
        })
      ])
      console.log('[BINGO] aviso aceito pelo transporte',JSON.stringify({
        group:jid,messageId:result?.key?.id||null,hasMessageId:Boolean(result?.key?.id)
      }))
    }catch(e){
      console.error('[BINGO] anúncio falhou no grupo',jid,e?.message||e)
    }finally{
      if(timeout)clearTimeout(timeout)
    }
    await new Promise(r=>setTimeout(r,300))
  }
}
function buildQueue(){
  return shuffle(Array.from({length:NUMBER_LIMIT},(_,i)=>i+1)).map(value=>({kind:'number',value}))
}
async function credit(c,jid,amount,type,note){
  const result=await c.query(
    'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2',
    [amount,jid]
  )
  if(result.rowCount!==1)throw Error('Carteira ausente: '+jid)
  await c.query(
    "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,$3,$4)",
    [jid,amount,type,KEY+':'+note]
  )
}
// Sem troféu ou recompensa paralela nessa edição.
async function checkPrizes(s,c){
  if(s.prizes.full)return ''
  const qualified=Object.entries(s.players||{}).filter(([,p])=>cover(p.card,p,s).every(Boolean))
  if(!qualified.length)return ''
  // Empate no mesmo número sorteado: seleção aleatória, sem priorizar contas.
  const [jid,player]=pick(qualified)
  await credit(c,jid,REWARD.full,'bingo_full_20261115','full_card')
  s.prizes.full={jid,name:player.name,amount:REWARD.full,at:Date.now()}
  return '\n🏆 *CARTELA CHEIA!* '+player.name+' venceu e recebeu '+formatMoney(REWARD.full)+'!'
}
async function processBall(s,c){
  const ball=s.queue?.[s.cursor]
  if(!ball)return {message:'',finished:true}
  s.cursor++
  s.drawn.push(ball.value)
  const outcome=await checkPrizes(s,c)
  return {message:'🔢 BOLA '+String(ball.value).padStart(2,'0')+outcome,finished:Boolean(s.prizes.full)}
}
const welcome=(count,startAt)=>[
  '🎰 *BINGO ALPHA — HOJE, 19H30!*',
  '',
  '🎟️ Inscrições *ABERTAS E GRATUITAS* até *'+localClock(startAt)+'* (Brasília).',
  '✅ Digite *!bingo* para receber sua cartela. Apenas uma por jogador.',
  '📋 Use *!cartela* para ver suas marcações automáticas.',
  '🔢 Cartela 3×3, centro LIVRE, números de 1 a 40; uma bola a cada 25 segundos.',
  '🏆 *PRÊMIO ÚNICO — R$ 5.000.000 PARA A PRIMEIRA CARTELA CHEIA!*',
  '🚫 Sem cobrança, prêmio por linha ou prêmio secundário.',
  '👥 Cartelas confirmadas: *'+count+'*.',
  '⚖️ Sorteio global, números aleatórios; pets e níveis não influenciam.'
].join('\n')
async function tick(sock){
  if(busy)return
  busy=true
  try{
    const now=Date.now()
    if(now<ANNOUNCE || now>EVENT_END)return
    await ensureTrophy()
    let outgoing=''
    let targets=[]
    // Evita consultar licenças repetidamente quando o jogo está rodando.
    const curr=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    if(curr?.phase==='completed'||curr?.phase==='cancelled'){
      if(timer){clearInterval(timer);timer=null}
      return
    }
    if(!curr?.announced || !curr?.groups?.length)targets=await eligibleGroups()
    await mutate(async(s,c)=>{
      if(!s.groups?.length)s.groups=targets
      const startAt=Number(s.startAt)
      if(!s.announced && s.groups?.length){
        s.announced=now
        outgoing=welcome(Object.keys(s.players||{}).length,startAt)
      }
      if(now>=startAt && s.phase==='registration'){
        if(!Object.keys(s.players||{}).length){
          s.phase='cancelled'
          outgoing='🎰 *BINGO ALPHA CANCELADO*\nNenhum jogador entrou antes das 19h30. Ninguém foi cobrado.'
        }else{
          s.phase='running'
          s.queue=buildQueue()
          s.cursor=0
          s.drawn=[]
          s.prizes={}
          s.nextAt=now+BALL_INTERVAL_MS
          outgoing='🎰 *BINGO ALPHA COMEÇOU!*\n🎟️ '+Object.keys(s.players).length+
            ' cartela(s) no sorteio global.\n🔢 Primeira bola em 25 segundos.\n📋 Digite *!cartela* para acompanhar.'
        }
      }else if(s.phase==='running' && now>=num(s.nextAt)){
        const parts=[]
        // Recupera sorteios atrasados após reinício, com um único aviso agrupado.
        let steps=0
        while(s.phase==='running' && now>=num(s.nextAt) && steps<6){
          const result=await processBall(s,c)
          if(result.message)parts.push(result.message)
          steps++
          s.nextAt+=BALL_INTERVAL_MS
          if(result.finished || s.cursor>=s.queue.length){
            s.phase='completed'
            s.completedAt=Date.now()
            parts.push('🏁 *BINGO ENCERRADO!*\n'+
              (s.prizes.full?'🏆 Campeão: *'+s.prizes.full.name+'* — '+formatMoney(REWARD.full)+'.':'Todas as bolas saíram.')+
              '\n✅ Premiações registradas uma única vez.')
          }
        }
        // Mantém o sorteio a cada 25 s, sem inundar os grupos com uma mensagem por bola.
        // Os jogadores continuam consultando sua cartela em tempo real via !cartela.
        const important=parts.flatMap(p=>p.split('\n').filter(line=>/^(?:🥉|🥈|🥇|⚡|🎁|🍀|🏁|🏆|✅)/u.test(line)))
        const isFinal=s.phase==='completed'
        const showRound=Boolean(s.drawn.length && s.drawn.length%4===0)
        if(isFinal || important.length || showRound){
          const nums=(s.drawn||[]).slice(-5).map(x=>String(x).padStart(2,'0')).join(' • ')
          outgoing=[
            '🎰 *BINGO ALPHA — R$ 5 MILHÕES*',
            '',
            '🔢 *Últimos números:* '+(nums||'Nenhum'),
            '📊 *Sorteados:* '+(s.drawn?.length||0)+'/40',
            ...(important.length?['','✨ *Destaques:*',...important]:[]),
            '',
            isFinal?'🏁 Sorteio concluído.':'🎟️ Consulte sua cartela: *!cartela*'
          ].join('\n')
        }
      }
      targets=s.groups||targets
    })
    if(outgoing && targets?.length){console.log('[BINGO] broadcast',JSON.stringify({groups:targets.length,characters:outgoing.length}));await announce(sock,outgoing,targets)}
  }catch(e){console.error('[BINGO] tick',e?.stack||e)}
  finally{busy=false}
}
export function startBingoNov15Scheduler(sock){
  if(timer)clearInterval(timer)
  if(Date.now()>EVENT_END)return
  timer=setInterval(()=>tick(sock),5000)
  timer.unref?.()
  tick(sock)
}
export async function handleBingoNov15Command({cmd,sender,name,chat,reply}){
  if(cmd!=='bingo' && cmd!=='cartela')return false
  const now=Date.now()
  if(now<ANNOUNCE || now>EVENT_END)return false
  if(!chat?.endsWith('@g.us')){await reply('🎰 O Bingo funciona nos grupos do Alpha Bot.');return true}
  const license=await getGroupLicense(chat)
  if(!groupLicenseIsActive(license)){await reply('🔒 O grupo precisa de licença ativa para entrar no Bingo.');return true}
  await ensureTrophy()
  let out=''
  await mutate(async(s,c)=>{
    const me=s.players?.[sender]
    if(cmd==='cartela'){
      out=me?cardText(me,s):'🎟️ Você ainda não tem cartela. Use *!bingo* para se inscrever gratuitamente até 19h30.'
      if(s.phase==='completed' && me)out+='\n🏁 Sorteio encerrado.'
      return
    }
    if(me){out='✅ Você já possui sua cartela. Não será cobrado novamente.\n\n'+cardText(me,s);return}
    if(s.phase!=='registration' || now>=Number(s.startAt)){
      out='🔒 Inscrições encerradas. O Bingo só aceita uma cartela por jogador antes do sorteio.'
      return
    }

    const player={name:String(name||'Jogador').slice(0,50),card:ticket(),wild:[],joinedAt:now}
    s.players[sender]=player
    out='✅ *CARTELA GRÁTIS CONFIRMADA!* Nenhum dinheiro foi debitado.\n\n'+cardText(player,s)+
      '\n\n🏆 Prêmio de R$ 5.000.000 à primeira cartela cheia. Sorteio às '+localClock(s.startAt)+'!'
  })
  await reply(out)
  return true
}
