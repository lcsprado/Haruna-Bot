import {randomInt} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,getGroupLicense} from './db.js'

// Evento único de 19/10/2026. Inscrição aberta ao iniciar o serviço;
// horário do sorteio persistido para sobreviver a reinícios e deploys.
const KEY='bingo_alpha_20261019_agora_v1'
const ANNOUNCE=Date.parse('2026-10-19T13:00:00-03:00')
const EVENT_END=Date.parse('2026-10-20T00:00:00-03:00')
const REGISTRATION_MS=6*60*1000
const BALL_INTERVAL_MS=25000
const PRICE=5000
const TROPHY='insignia_bingo_alpha_20261019'
const NUMBER_LIMIT=40
const REWARD={row:40000,twoRows:80000,full:150000}
let busy=false
let timer=null
let registeredItem=false
const num=x=>Number(x||0)
const formatMoney=v=>'R$ '+num(v).toLocaleString('pt-BR')
const shuffle=list=>{
  const a=[...list]
  for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}
  return a
}
const pick=a=>a[randomInt(a.length)]
const basicState=()=>({phase:'registration',players:{},drawn:[],prizes:{},bonusPayDone:false,stage:0,startAt:Date.now()+REGISTRATION_MS})
const localClock=ms=>new Date(Number(ms)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})

async function ensureTrophy(){
  if(registeredItem)return
  await db.query(`INSERT INTO items
    (id,name,description,category,price,rarity,sellable,stackable)
    VALUES($1,$2,$3,'special',0,'event',FALSE,FALSE)
    ON CONFLICT(id) DO UPDATE SET
      name=EXCLUDED.name,description=EXCLUDED.description,
      category=EXCLUDED.category,price=0,rarity='event',
      sellable=FALSE,stackable=FALSE`,[
    TROPHY,'Insígnia do Bingo Alpha',
    'Troféu visual exclusivo do Bingo Alpha de 19/10/2026, sem bônus de combate. Não pode ser vendido ou transferido.'
  ])
  registeredItem=true
}
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
  for(const jid of targets){
    try{await sock.sendMessage(jid,{text})}
    catch(e){console.error('[BINGO] anúncio falhou',jid,e?.message||e)}
    await new Promise(r=>setTimeout(r,300))
  }
}
function buildQueue(){
  // Cada bola especial aparece uma única vez; todos concorrem ao mesmo sorteio global.
  const nums=shuffle(Array.from({length:NUMBER_LIMIT},(_,i)=>i+1))
  const queue=nums.map(value=>({kind:'number',value}))
  queue.splice(10,0,{kind:'special',value:'reconnect'})
  queue.splice(23,0,{kind:'special',value:'package'})
  queue.splice(34,0,{kind:'special',value:'lucky'})
  return queue
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
async function giveTrophy(c,jid){
  await c.query(`INSERT INTO inventories(jid,item_id,quantity)
    VALUES($1,$2,1)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,TROPHY])
  await c.query(`INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity)
    VALUES($1,$2,$3,1)
    ON CONFLICT(jid,item_id,source_key) DO NOTHING`,[jid,TROPHY,KEY+':champion'])
}
async function checkPrizes(s,c){
  const entries=Object.entries(s.players||{})
  const milestones=[
    {id:'row',target:1,money:REWARD.row,label:'🥉 Primeira linha'},
    {id:'twoRows',target:2,money:REWARD.twoRows,label:'🥈 Duas linhas'},
    {id:'full',target:3,money:REWARD.full,label:'🥇 Cartela completa'}
  ]
  let out=''
  for(const m of milestones){
    if(s.prizes[m.id])continue
    const qualified=entries.filter(([,p])=>{
      const marked=cover(p.card,p,s)
      return m.id==='full'?marked.every(Boolean):rowCount(marked)>=m.target
    })
    if(!qualified.length)continue
    // Empates no mesmo sorteio são resolvidos aleatoriamente, não por JID.
    const [jid,player]=pick(qualified)
    await credit(c,jid,m.money,'bingo_reboot_reward',m.id)
    if(m.id==='full')await giveTrophy(c,jid)
    s.prizes[m.id]={jid,name:player.name,amount:m.money,at:Date.now()}
    out+='\n'+m.label+': *'+player.name+'* — '+formatMoney(m.money)
    if(m.id==='full')out+=' + 🏅 *Insígnia do Bingo Alpha*'
  }
  return out
}
async function processBall(s,c){
  const ball=s.queue[s.cursor]
  if(!ball)return {message:'',finished:true}
  s.cursor++
  let line=''
  if(ball.kind==='number'){
    s.drawn.push(ball.value)
    line='🔢 *BOLA '+String(ball.value).padStart(2,'0')+'* • '+s.drawn.length+'/40'
  }else if(ball.value==='reconnect'){
    line='⚡ *RECONEXÃO!* Número extra agora!'
    // Sempre tira a próxima bola numérica, preservando as outras bolas especiais.
    const ix=s.queue.findIndex((b,i)=>i>=s.cursor && b.kind==='number')
    if(ix>=0){
      const [bonus]=s.queue.splice(ix,1)
      s.queue.splice(s.cursor,0,bonus)
      const drawn=s.queue[s.cursor++]
      s.drawn.push(drawn.value)
      line+='\n🔢 Bola extra: *'+String(drawn.value).padStart(2,'0')+'*'
    }
  }else if(ball.value==='package'){
    line='🎁 *PACOTE RECUPERADO!* '+formatMoney(5000)+' para cada cartela ativa.'
    if(!s.bonusPayDone){
      for(const [jid] of Object.entries(s.players||{}))await credit(c,jid,5000,'bingo_reboot_bonus','package')
      s.bonusPayDone=true
    }
  }else if(ball.value==='lucky'){
    line='🍀 *SORTE ALPHA!* Cada cartela recebe uma marcação extra.'
    for(const p of Object.values(s.players||{})){
      p.wild=p.wild||[]
      const marked=cover(p.card,p,s)
      const available=marked.flatMap((done,i)=>!done?[i]:[])
      if(available.length)p.wild.push(pick(available))
    }
  }
  line+=(await checkPrizes(s,c))
  return {message:line,finished:Boolean(s.prizes.full)}
}
const welcome=(count,startAt)=>'🎰 *BINGO ALPHA — NOVA EDIÇÃO!*\n\n'+
  '✅ Inscrições *ABERTAS AGORA*! Sorteio às *'+localClock(startAt)+'* (Brasília).\n'+
  '🎟️ Cartela: *'+formatMoney(PRICE)+'* (carteira/banco)\n'+
  '⚖️ Apenas *1 cartela por jogador*. Todos têm chances iguais.\n'+
  '✅ Digite *!bingo* para comprar sua cartela.\n'+
  '📋 Digite *!cartela* para conferir as marcações automáticas.\n'+
  '🔢 Uma bola global a cada *25 segundos*.\n\n'+
  '🥉 Primeira linha: *R$ 40.000*\n'+
  '🥈 Primeiras duas linhas: *R$ 80.000*\n'+
  '🥇 Primeira cartela cheia: *R$ 150.000* + 🏅 Insígnia do Bingo Alpha.\n'+
  '⚡ Bolas especiais: Reconexão, Pacote Recuperado e Sorte Alpha.\n'+
  '👥 Inscritos até agora: *'+count+'*\n'+
  '_Sem força, pets, nível ou equipamento._'
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
          outgoing='🎰 *BINGO ALPHA CANCELADO*\nNenhuma cartela comprada até o início do sorteio. Não houve cobranças nem prêmios.'
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
              (s.prizes.full?'🏆 Campeão: *'+s.prizes.full.name+'* com a Insígnia do Bingo Alpha.':'Todas as bolas saíram.')+
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
            '🎰 *BINGO ALPHA*',
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
export function startBingoRebootScheduler(sock){
  if(timer)clearInterval(timer)
  if(Date.now()>EVENT_END)return
  timer=setInterval(()=>tick(sock),5000)
  timer.unref?.()
  tick(sock)
}
export async function handleBingoRebootCommand({cmd,sender,name,chat,reply}){
  if(cmd!=='bingo' && cmd!=='cartela')return false
  const now=Date.now()
  if(now<ANNOUNCE || now>EVENT_END)return false
  if(!chat?.endsWith('@g.us')){await reply('🎰 O Bingo do Reboot funciona nos grupos do Alpha Bot.');return true}
  const license=await getGroupLicense(chat)
  if(!groupLicenseIsActive(license)){await reply('🔒 O grupo precisa de licença ativa para entrar no Bingo.');return true}
  await ensureTrophy()
  let out=''
  await mutate(async(s,c)=>{
    const me=s.players?.[sender]
    if(cmd==='cartela'){
      out=me?cardText(me,s):'🎟️ Você ainda não tem cartela. Use *!bingo* para comprar por '+formatMoney(PRICE)+'.'
      if(s.phase==='completed' && me)out+='\n🏁 Sorteio encerrado.'
      return
    }
    if(me){out='✅ Você já possui sua cartela. Não será cobrado novamente.\n\n'+cardText(me,s);return}
    if(s.phase!=='registration' || now>=Number(s.startAt)){
      out='🔒 Inscrições encerradas. O Bingo só aceita uma cartela por jogador antes do sorteio.'
      return
    }
    const payment=await c.query(`UPDATE wallets
      SET cash=cash-LEAST(cash,$1::bigint),
          bank=bank-GREATEST(0,$1::bigint-cash),
          updated_at=EXTRACT(EPOCH FROM NOW())::bigint
      WHERE jid=$2 AND cash>=0 AND bank>=0 AND cash+bank>=$1
      RETURNING jid`,[PRICE,sender])
    if(payment.rowCount!==1){out='💰 Saldo insuficiente. É preciso ter '+formatMoney(PRICE)+' na carteira + banco para comprar a cartela.';return}
    await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'system',$2,'bingo_reboot_card',$3)`,[sender,PRICE,KEY+':entry'])
    const player={name:String(name||'Jogador').slice(0,50),card:ticket(),wild:[],joinedAt:now}
    s.players[sender]=player
    out='✅ *CARTELA COMPRADA!* '+formatMoney(PRICE)+' debitados.\n\n'+cardText(player,s)+
      '\n\n⏰ Sorteio global às *'+localClock(s.startAt)+'*. Boa sorte!'
  })
  await reply(out)
  return true
}
