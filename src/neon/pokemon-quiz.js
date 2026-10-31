// Quiz Pokemon de 30/10: evento GLOBAL em dois grupos, premiacao unica por rodada.
// O banco decide o primeiro acerto; o WhatsApp apenas transporta respostas/avisos.
// Nao reutilizar o quiz antigo: ele encerra a rodada ate com resposta incorreta.
export const POKEMON_QUIZ_GROUPS = Object.freeze([
  '120363410230588690@g.us',
  '120363429534634131@g.us'
])
export const POKEMON_QUIZ_KEY = 'pokemon_quiz_20261030_global_v1'
export const POKEMON_QUIZ_QUESTIONS = Object.freeze([
  {q:'Qual Pokemon e a evolucao imediata de Charmander?', a:['Charizard','Charmeleon','Cyndaquil','Flareon'],c:2},
  {q:'Bulbasaur evolui diretamente para qual Pokemon?', a:['Venusaur','Ivysaur','Gloom','Bayleef'],c:2},
  {q:'Quem vem imediatamente depois de Squirtle?', a:['Blastoise','Totodile','Wartortle','Marshtomp'],c:3},
  {q:'Qual Pokemon evolui diretamente para Pikachu?', a:['Raichu','Plusle','Pichu','Minun'],c:3},
  {q:'Magikarp evolui diretamente para qual Pokemon?', a:['Milotic','Seaking','Gyarados','Kingdra'],c:3},
  {q:'Qual e a pre-evolucao imediata de Electivire?', a:['Elekid','Electabuzz','Jolteon','Magneton'],c:2},
  {q:'Qual Pokemon evolui para Glaceon?', a:['Vulpix','Eevee','Sneasel','Snorunt'],c:2},
  {q:'Qual Pokemon evolui imediatamente para Alakazam?', a:['Abra','Kadabra','Hypno','Drowzee'],c:2},
  {q:'Qual Pokemon evolui diretamente para Dragonite?', a:['Dratini','Dragonair','Shelgon','Gabite'],c:2},
  {q:'Qual Pokemon evolui diretamente para Lucario?', a:['Riolu','Machoke','Mienfoo','Tyrogue'],c:1},
  {q:'Qual e a pre-evolucao imediata de Ursaluna?', a:['Teddiursa','Ursaring','Beartic','Pangoro'],c:2},
  {q:'Qual Pokemon evolui para Kingambit?', a:['Pawniard','Bisharp','Doublade','Honedge'],c:2},
  {q:'Qual Pokemon evolui para Annihilape?', a:['Mankey','Machoke','Primeape','Infernape'],c:3},
  {q:'Qual Pokemon pode evoluir diretamente para Kleavor?', a:['Scizor','Pinsir','Scyther','Heracross'],c:3},
  {q:'Qual Pokemon evolui para Dudunsparce?', a:['Dunsparce','Furret','Drampa','Dudunsparce'],c:1}
].map((x,i)=>Object.freeze({...x,prize:i<5?200000:i<10?400000:750000})))
const LIMIT_MS=45000, BETWEEN_MS=8000
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const clean=x=>String(x||'Jogador').replace(/[\r\n*_~]/g,' ').trim().slice(0,45)
const isGroup=(chat,groups)=>groups.includes(String(chat||''))
function questionText(index){
  const p=POKEMON_QUIZ_QUESTIONS[index]
  const level=index<5?'FACIL':index<10?'MEDIO':'DIFICIL'
  return '🧠⚡ *QUIZ POKEMON — '+(index+1)+'/15* • '+level+'\n\n'+p.q+'\n\n'+p.a.map((a,i)=>(i+1)+'. '+a).join('\n')+
    '\n\n💰 Premio: *R$ '+fmt(p.prize)+'*\n⏱️ *45 segundos* depois que os dois grupos receberem a pergunta.'+
    '\n👉 Responda *!pk 1*, *!pk 2*, *!pk 3* ou *!pk 4*.'+
    '\n⚖️ Duas tentativas por jogador. O primeiro acerto GLOBAL ganha.'
}
function resultText(index,winner){
  const q=POKEMON_QUIZ_QUESTIONS[index]
  const head=winner?'🏆 *ACERTO RELAMPAGO!*\n👤 '+clean(winner.name)+' • 💰 *R$ '+fmt(winner.reward)+'*':'⌛ *NINGUEM ACERTOU A TEMPO!*'
  return head+'\n🧠 Rodada '+(index+1)+'/15\n✅ Resposta: *'+q.a[q.c-1]+'*.\n'+
    (index<14?'⏩ Proxima pergunta em instantes.':'🏁 Fim das perguntas. Ranking a seguir.')
}
function finalText(s){
  const rank=new Map()
  for(const w of s.winners||[]){
    const row=rank.get(w.jid)||{name:clean(w.name),wins:0,total:0}
    row.wins++;row.total+=Number(w.reward||0);rank.set(w.jid,row)
  }
  const ordered=[...rank.values()].sort((a,b)=>b.wins-a.wins||b.total-a.total)
  const lines=ordered.map((x,i)=>(i+1)+'º '+x.name+' — '+x.wins+' acerto(s) • R$ '+fmt(x.total))
  return '🏁🏆 *QUIZ POKEMON ENCERRADO!*\n\n'+
    (lines.length?lines.join('\n'):'Nenhum vencedor nesta edicao.')+
    '\n\n💰 Total distribuido: *R$ '+fmt((s.winners||[]).reduce((n,w)=>n+Number(w.reward||0),0))+'*.'+
    '\n✅ Premios creditados uma unica vez na carteira.'
}
function enqueueNotice(s,id,text){
  s.notices??=[]
  if(!s.notices.some(n=>n.id===id))s.notices.push({id,text,sentGroups:[]})
}
const fullyDelivered=(s,id,groups)=>s.notices?.some(n=>n.id===id && groups.every(g=>n.sentGroups.includes(g)))
function fresh(now){
  return {status:'running',phase:'delivery',round:0,createdAt:now,expiresAt:0,
    nextAt:0,attempts:{},winners:[],notices:[]}
}
export function createPokemonQuizEngine({db,sendMessage,isConnected=()=>true,
  groups=POKEMON_QUIZ_GROUPS,clock=()=>Date.now(),autoStart=true,logger=console}){
  if(!db?.connect || typeof sendMessage!=='function')throw new TypeError('Quiz requer banco e envio do WhatsApp')
  let timer=null,running=false

  async function transact(fn,{create=false}={}){
    const c=await db.connect()
    try{
      await c.query('BEGIN')
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[POKEMON_QUIZ_KEY])
      const r=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[POKEMON_QUIZ_KEY])
      let s=r.rows[0]?.value
      if(!s && create){
        s=fresh(clock())
        enqueueNotice(s,'question:0',questionText(0))
      }
      const previous=r.rowCount?JSON.stringify(s):null
      const result=await fn(c,s)
      if(s&&JSON.stringify(s)!==previous)await c.query(
        'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',
        [POKEMON_QUIZ_KEY,JSON.stringify(s)]
      )
      await c.query('COMMIT')
      return result
    }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}
    finally{c.release()}
  }
  async function advance(){
    return transact(async(_c,s)=>{
      if(!s||s.status!=='running')return
      const now=clock()
      if(s.phase==='delivery'&&fullyDelivered(s,'question:'+s.round,groups)){
        s.phase='answering';s.expiresAt=now+LIMIT_MS
      }else if(s.phase==='answering'&&now>=s.expiresAt){
        s.phase='result';s.nextAt=now+BETWEEN_MS
        enqueueNotice(s,'result:'+s.round,resultText(s.round,null))
      }else if(s.phase==='result'&&fullyDelivered(s,'result:'+s.round,groups)&&now>=s.nextAt){
        if(s.round===POKEMON_QUIZ_QUESTIONS.length-1){
          s.phase='final';s.status='completed'
          enqueueNotice(s,'final',finalText(s))
        }else{
          s.round++;s.attempts={};s.phase='delivery';s.expiresAt=0
          enqueueNotice(s,'question:'+s.round,questionText(s.round))
        }
      }
    },{create:autoStart})
  }
  async function dispatchNotices(){
    const result=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[POKEMON_QUIZ_KEY])
    const s=result.rows[0]?.value
    if(!s)return
    for(const notice of (s.notices||[]).slice(-6)){
      for(const g of groups){
        if(notice.sentGroups.includes(g))continue
        if(!isConnected())return
        try{
          await sendMessage(g,notice.text)
          await transact(async(_c,latest)=>{
            const target=latest?.notices?.find(n=>n.id===notice.id)
            if(target&&!target.sentGroups.includes(g))target.sentGroups.push(g)
          })
        }catch(err){
          logger.warn?.('[QUIZ POKEMON] aviso pendente em '+g+': '+String(err?.message||err))
        }
      }
    }
  }
  async function tick(){
    if(running||!isConnected())return
    running=true
    try{
      await advance()
      await dispatchNotices()
      await advance()
    }catch(err){logger.error?.('[QUIZ POKEMON] tick',err?.message||err)}
    finally{running=false}
  }
  async function answer({chat,sender,name,choice}){
    if(!isGroup(chat,groups))return {kind:'other-group'}
    const raw=String(choice||'').trim()
    if(!/^[1-4]$/.test(raw))return {kind:'invalid'}
    return transact(async(c,s)=>{
      if(!s||s.status!=='running'||s.phase!=='answering')return {kind:'not-open'}
      const now=clock()
      if(now>=s.expiresAt){
        s.phase='result';s.nextAt=now+BETWEEN_MS
        enqueueNotice(s,'result:'+s.round,resultText(s.round,null))
        return {kind:'late'}
      }
      if((s.winners||[]).some(w=>w.round===s.round+1))return {kind:'not-open'}
      const old=Number(s.attempts[sender]||0)
      if(old>=2)return {kind:'limit'}
      const n=old+1;s.attempts[sender]=n
      const q=POKEMON_QUIZ_QUESTIONS[s.round]
      if(Number(raw)!==q.c)return {kind:'wrong',attempt:n,remaining:2-n}
      const reward=q.prize
      // Pagamento e reserva do primeiro acerto dentro da MESMA transacao.
      // O bloqueio da linha do evento protege de corridas entre grupos/processos.
      const paid=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2 RETURNING cash',[reward,sender])
      if(!paid.rowCount)return {kind:'unregistered'}
      await c.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('event',$1,$2,'event_reward',$3)",
        [sender,reward,'pokemon-quiz-20261030-r'+(s.round+1)]
      )
      const winner={round:s.round+1,jid:sender,name:clean(name),reward}
      s.winners.push(winner)
      s.phase='result';s.nextAt=now+BETWEEN_MS
      enqueueNotice(s,'result:'+s.round,resultText(s.round,winner))
      return {kind:'winner',round:s.round+1,reward}
    })
  }
  async function status(){
    const res=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[POKEMON_QUIZ_KEY])
    const s=res.rows[0]?.value
    if(!s)return '🧠 Quiz Pokemon ainda nao iniciado.'
    if(s.status==='cancelled')return '🛑 Quiz Pokemon cancelado, sem novos premios.'
    if(s.status==='paused')return '⏸️ *QUIZ POKEMON PAUSADO*\nRespostas bloqueadas para preservar a disputa.\n👑 Proprietario: *!quizpokemon retomar* para reiniciar a pergunta da rodada pausada.'
    if(s.status==='completed')return finalText(s)
    const phase=s.phase==='answering'?'respostas abertas':s.phase==='delivery'?'enviando pergunta':'preparando proxima rodada'
    return '🧠 *QUIZ POKEMON ATIVO*\nRodada: *'+(s.round+1)+'/15* • '+phase+
      '\n⏱️ Respostas: *!pk 1* ate *!pk 4*.\n🏆 Vencedores ate agora: '+(s.winners?.length||0)
  }
  // Pausa de emergencia: invalida o prazo em curso, cancela avisos pendentes,
  // mas preserva premiacoes ja liquidadas e a rodada atual.
  async function pause(){
    return transact(async(_c,s)=>{
      if(!s||s.status!=='running')return false
      s.pausedFrom=s.phase
      s.status='paused';s.phase='paused';s.expiresAt=0;s.nextAt=0
      s.notices=[]
      enqueueNotice(s,'paused','⏸️ *QUIZ POKEMON PAUSADO PARA CORRECAO*\nAs respostas estao temporariamente bloqueadas.\n✅ Premios ja creditados permanecem validos.\nA rodada sem vencedor sera reiniciada. Resultados ja definidos nao serao pagos novamente.')
      return true
    })
  }
  async function resume(){
    return transact(async(_c,s)=>{
      if(!s||s.status!=='paused')return false
      s.status='running';s.phase='delivery';s.expiresAt=0;s.nextAt=0
      // Se a rodada ja pagou um premio, avancar sem permitir outro credito.
      const winner=(s.winners||[]).find(w=>w.round===s.round+1)
      s.attempts={};s.notices=[]
      if(winner){
        s.phase='result';s.nextAt=clock()+BETWEEN_MS
        enqueueNotice(s,'result:'+s.round,resultText(s.round,winner))
      }else{
        s.phase='delivery'
        enqueueNotice(s,'question:'+s.round,questionText(s.round))
      }
      delete s.pausedFrom
      return true
    })
  }
  async function cancel(){
    const out=await transact(async(_c,s)=>{
      if(!s||!['running','paused'].includes(s.status))return false
      s.status='cancelled';s.phase='cancelled'
      s.notices=[] // avisos antigos nao podem reaparecer
      enqueueNotice(s,'cancel','🛑 *QUIZ POKEMON CANCELADO*\nNenhuma nova resposta ou premiacao sera aceita.\nPremios de rodadas ja concluidas permanecem validos.')
      return true
    })
    if(out)await tick()
    return out
  }
  return {
    tick,answer,status,cancel,pause,resume,
    start(){
      if(timer)return
      timer=setInterval(()=>{void tick()},3000)
      timer.unref?.()
      void tick()
    },
    stop(){if(timer)clearInterval(timer);timer=null}
  }
}
