import {randomInt} from 'node:crypto'
// APOSTO QUE VOCE NAO CONSEGUE: quatro perguntas por inscrito, incluindo entrada tardia.
// Banco controla todas as apostas, estornos e creditos em uma transacao por rodada.
export const APOSTA_GROUP_JID='120363410230588690@g.us'
export const APOSTA_KEY='aposto_consegue_20261030_v1'
export const APOSTA_QUESTIONS_PER_PLAYER=4
export const APOSTA_PRIZE=100000
export const APOSTA_RISK=50000
export const APOSTA_MAX_PLAYERS=8
export const APOSTA_QUESTIONS=Object.freeze({
 medio:[
 ['Qual e a capital do Canada?','Ottawa','geografia'],
 ['Qual planeta e conhecido como planeta vermelho?','Marte','ciencia'],
 ['Qual e o elemento quimico cujo simbolo e Au?','Ouro','ciencia'],
 ['Quem escreveu Dom Casmurro?','Machado de Assis','literatura'],
 ['Em qual continente fica o deserto de Gobi?','Asia','geografia'],
 ['Qual pais venceu a Copa do Mundo masculina de 2010?','Espanha','futebol'],
 ['Quem pintou a obra A Noite Estrelada?','Vincent van Gogh','arte'],
 ['Qual e a capital da Australia?','Canberra','geografia'],
 ['Qual e o nome do protagonista de One Piece?','Monkey D. Luffy','anime'],
 ['Qual elemento tem simbolo Fe?','Ferro','ciencia'],
 ['Em qual pais surgiu o jogo de tabuleiro Go?','China','jogos'],
 ['Como se chama o irmao de Mario na serie de jogos da Nintendo?','Luigi','jogos'],
 ['Que orgao do corpo humano produz insulina?','Pancreas','biologia'],
 ['Qual e a moeda oficial do Japao?','Iene','geografia'],
 ['Qual cientista formulou as tres leis classicas do movimento?','Isaac Newton','ciencia'],
 ['Qual e o maior oceano da Terra?','Pacifico','geografia'],
 ['Em qual cidade fica o Coliseu?','Roma','historia'],
 ['Qual e o nome do martelo de Thor na mitologia nordica?','Mjolnir','mitologia'],
 ['Em Dragon Ball, qual personagem e conhecido como principe dos Saiyajins?','Vegeta','anime'],
 ['Qual pais tem como capital Buenos Aires?','Argentina','geografia'],
 ['Qual e o nome do detetive criado por Arthur Conan Doyle?','Sherlock Holmes','literatura'],
 ['Qual e o metal liquido a temperatura ambiente com simbolo Hg?','Mercurio','ciencia'],
 ['Quem dirigiu o filme Titanic de 1997?','James Cameron','cinema'],
 ['Qual e o maior planeta do Sistema Solar?','Jupiter','ciencia']
 ],
 dificil:[
 ['Qual tratado de 1919 estabeleceu as condicoes de paz para a Alemanha apos a Primeira Guerra Mundial?','Versalhes','historia'],
 ['Qual cientista descobriu a penicilina em 1928?','Alexander Fleming','ciencia'],
 ['Quem escreveu o romance Cem Anos de Solidao?','Gabriel Garcia Marquez','literatura'],
 ['Qual e a capital da Mongolia?','Ulaanbaatar','geografia'],
 ['Qual elemento quimico tem numero atomico 74?','Tungstenio','ciencia'],
 ['Qual filosofa escreveu O Segundo Sexo?','Simone de Beauvoir','filosofia'],
 ['Qual e a lua de Saturno conhecida por seus lagos de metano liquido?','Tita','astronomia'],
 ['Em que ano foi assinada a Magna Carta inglesa?','1215','historia'],
 ['Qual deus egipcio ligado a mumificacao e representado com cabeca de chacal?','Anubis','mitologia'],
 ['Qual Pokemon evolui diretamente para Kingambit?','Bisharp','pokemon'],
 ['Quem compos As Quatro Estacoes?','Antonio Vivaldi','musica'],
 ['Qual e a capital do Butao?','Thimphu','geografia'],
 ['Qual linguagem de programacao foi criada por Guido van Rossum?','Python','tecnologia'],
 ['Quem pintou A Persistencia da Memoria, com relogios derretidos?','Salvador Dali','arte'],
 ['Qual planeta anao fica no cinturao de asteroides?','Ceres','astronomia'],
 ['Em qual romance Raskolnikov e o protagonista?','Crime e Castigo','literatura'],
 ['Qual foi o primeiro satelite artificial da Terra, lancado em 1957?','Sputnik 1','historia'],
 ['Qual filosofo grego foi tutor de Alexandre, o Grande?','Aristoteles','historia'],
 ['Quem escreveu A Metamorfose, publicada em 1915?','Franz Kafka','literatura'],
 ['Em qual pais fica a antiga cidade de Petra?','Jordania','geografia'],
 ['Qual tecnica de biologia molecular amplifica sequencias de DNA usando ciclos termicos?','PCR','biologia'],
 ['De qual pais e o escritor Haruki Murakami?','Japao','literatura'],
 ['Qual estrela e a mais proxima do Sol?','Proxima Centauri','astronomia'],
 ['Qual jogo da FromSoftware tem o reino de Lordran?','Dark Souls','jogos']
 ]
})
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
const nice=x=>String(x||'Jogador').replace(/[\r\n*_~]/g,' ').trim().slice(0,36)
const money=x=>Number(x||0).toLocaleString('pt-BR')
const NOTICE_WAIT_MS=4500, GAP_MS=6500
const BET_MS=35000
const amountSplit=(total,ids)=>{const out={};if(!ids.length)return out
 const share=Math.floor(total/ids.length);let left=total-share*ids.length
 for(const id of ids){out[id]=share+(left-- >0?1:0)}return out}
const first=(s)=>s.order.filter(id=>s.players[id].done<APOSTA_QUESTIONS_PER_PLAYER)
 .sort((a,b)=>s.players[a].done-s.players[b].done||s.order.indexOf(a)-s.order.indexOf(b))[0]
function notice(s,id,text){s.notices??=[];if(!s.notices.some(n=>n.id===id))s.notices.push({id,text,sentAt:0})}
function intro(){return '🎲 *APOSTO QUE VOCE NAO CONSEGUE!*\n\n🧠 Perguntas medias e dificeis, de assuntos variados.\n👥 Cada jogador deve enviar *!participar* neste grupo, mesmo que entre depois.\n📚 *4 perguntas para cada inscrito* (2 medias e 2 dificeis).\n💰 Rodada: R$ 100.000.\n✅ *!confio*: divide o premio se o desafiado acertar.\n❌ *!duvido*: ganha parte do premio se ele errar; se acertar, perde R$ 50.000 (carteira e depois banco).\n🔒 O bot reserva R$ 50.000 ao escolher !duvido e devolve se o desafiado errar.\n⏳ Comeca assim que 3 jogadores entrarem. A entrada tardia e permitida enquanto houver rodada ativa.'}
const labels=s=>s.order.map(id=>nice(s.players[id].name)+' ('+s.players[id].done+'/4)').join(' • ')
function betText(s){const r=s.current,p=s.players[r.challenger]
 return '🎲 *RODADA '+r.number+' / '+(s.order.length*4)+'* — *'+nice(p.name)+'*\n🧠 Dificuldade: *'+(r.difficulty==='medio'?'MEDIA':'DIFICIL')+'* • Categoria: *'+r.category+'*\n💰 Premio total: *R$ 100.000*\n\n👥 Os outros jogadores podem enviar *!confio* ou *!duvido* neste grupo.\n❌ Duvidar exige R$ 50.000 disponiveis entre carteira e banco, reservados agora.\n⏳ *35 segundos* para apostas.\n📋 Progresso: '+labels(s)}
function questionText(s){const r=s.current,q=APOSTA_QUESTIONS[r.difficulty][r.questionIndex]
 const votes=Object.entries(r.votes).map(([id,v])=>nice(s.players[id]?.name)+': '+v.action.toUpperCase())
 return '🔒 *APOSTAS ENCERRADAS!*\n'+(votes.length?votes.join(' • '):'Sem apostas nesta rodada.')+
 '\n\n🎯 *PERGUNTA PARA '+nice(s.players[r.challenger].name).toUpperCase()+'*\n'+
 '🧠 '+q[0]+'\n\n👉 Apenas o desafiado responde com *!resposta texto*. Uma tentativa.\n⏱️ '+(r.difficulty==='medio'?'45':'60')+' segundos apos o envio da pergunta.'}
function resultText(s,entry){const sum=entry.movements.map(x=>nice(s.players[x.id]?.name)+': '+(x.delta>=0?'+':'-')+'R$ '+money(Math.abs(x.delta)))
 return (entry.correct?'✅ *ACERTOU!*':'❌ *ERROU!*')+'\n🎯 '+nice(s.players[entry.challenger].name)+
 '\n🧠 Resposta correta: *'+entry.answer+'*\n💰 '+(sum.join('\n')||'Nenhuma movimentacao.')+
 '\n📚 '+s.players[entry.challenger].done+'/4 perguntas realizadas para '+nice(s.players[entry.challenger].name)+'.'
}
function finalText(s){const rank=s.order.map(id=>({name:nice(s.players[id].name),net:s.players[id].net,done:s.players[id].done}))
 .sort((a,b)=>b.net-a.net)
 return '🏁🏆 *APOSTO QUE VOCE NAO CONSEGUE — FIM!*\n\n'+
 rank.map((p,i)=>(i+1)+'º '+p.name+' — '+(p.net>=0?'+':'-')+'R$ '+money(Math.abs(p.net))+' • '+p.done+'/4 perguntas').join('\n')+
 '\n\n📊 Rodadas: '+s.history.length+'. Cada jogador respondeu quatro desafios.\n💰 Creditos e descontos registrados no banco sem pagamentos duplicados.'
}
const shuffledIndices=count=>{
 const cards=Array.from({length:count},(_,i)=>i)
 for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]]}
 return cards
}
const fresh=now=>({status:'running',phase:'lobby',createdAt:now,order:[],players:{},
 current:null,nextNumber:1,history:[],used:{medio:0,dificil:0},
 deck:{medio:shuffledIndices(APOSTA_QUESTIONS.medio.length),dificil:shuffledIndices(APOSTA_QUESTIONS.dificil.length)},
 notices:[]})
export function createApostaEngine({db,sendMessage,isConnected=()=>true,clock=()=>Date.now(),
 group=APOSTA_GROUP_JID,logger=console}){
 if(!db?.connect||typeof sendMessage!=='function')throw Error('Banco e envio obrigatorios')
 let timer=null,busy=false
 async function transact(fn,{create=false}={}){
  const c=await db.connect()
  try{
   await c.query('BEGIN')
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[APOSTA_KEY])
   const q=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[APOSTA_KEY])
   let s=q.rows[0]?.value
   if(!s&&create){s=fresh(clock());notice(s,'intro',intro())}
   const previous=q.rowCount?JSON.stringify(s):null
   const result=await fn(c,s)
   if(s&&JSON.stringify(s)!==previous)await c.query(
    'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',
    [APOSTA_KEY,JSON.stringify(s)])
   await c.query('COMMIT');return result
  }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}
  finally{c.release()}
 }
 function nextRound(s,now){
  const id=first(s)
  if(!id){s.phase='completed';s.status='completed';notice(s,'final',finalText(s));return}
  const done=s.players[id].done,difficulty=done<2?'medio':'dificil'
  const questionIndex=s.deck[difficulty][s.used[difficulty]++]
  if(questionIndex===undefined)throw Error('Banco de perguntas insuficiente')
  const eligible=s.order.filter(x=>x!==id)
  s.current={number:s.nextNumber++,challenger:id,difficulty,category:APOSTA_QUESTIONS[difficulty][questionIndex][2],
   questionIndex,eligible,votes:{},deadline:now+BET_MS}
  s.phase='betting'
  notice(s,'bet:'+s.current.number,betText(s))
 }
 async function ledger(c,from,to,amount,type,round,detail){
  if(!amount)return
  await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',
   [from,to,amount,type,'aposto-20261030-r'+round+'-'+detail])
 }
 async function credit(c,id,cash,bank,round,detail){
  if(cash||bank){
   const result=await c.query('UPDATE wallets SET cash=cash+$2,bank=bank+$3,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1 RETURNING jid',[id,cash,bank])
   if(result.rowCount!==1)throw Error('Carteira nao cadastrada: '+id)
   await ledger(c,'event',id,cash+bank,'event_reward',round,detail)
  }
 }
 async function refund(c,s,round){
  for(const [id,v] of Object.entries(round.votes||{})){
   if(v.action!=='duvido')continue
   await credit(c,id,v.holdCash,v.holdBank,round.number,'hold-refund')
  }
 }
 async function settle(c,s,correct,reason){
  const r=s.current
  if(!r||s.phase!=='answering')return false
  const q=APOSTA_QUESTIONS[r.difficulty][r.questionIndex]
  const confidants=r.eligible.filter(id=>r.votes[id]?.action==='confio')
  const doubters=r.eligible.filter(id=>r.votes[id]?.action==='duvido')
  const winners=correct?[r.challenger,...confidants]:doubters
  const awards=amountSplit(APOSTA_PRIZE,winners)
  const movement=new Map()
  for(const id of s.order)movement.set(id,0)
  for(const id of doubters){
   const v=r.votes[id]
   if(!correct){
    await credit(c,id,v.holdCash,v.holdBank,r.number,'hold-refund')
   }else{
    movement.set(id,(movement.get(id)||0)-APOSTA_RISK)
    await ledger(c,id,'event',APOSTA_RISK,'event_penalty',r.number,'failed-doubt')
   }
  }
  for(const [id,prize] of Object.entries(awards)){
   await credit(c,id,prize,0,r.number,'prize')
   movement.set(id,(movement.get(id)||0)+prize)
  }
  s.players[r.challenger].done++
  const entry={number:r.number,challenger:r.challenger,difficulty:r.difficulty,
   answer:q[1],correct,reason,awards,movements:[...movement].filter(([,delta])=>delta!==0).map(([id,delta])=>({id,delta}))}
  for(const [id,delta] of movement)s.players[id].net+=delta
  s.history.push(entry)
  s.phase='result';s.current.deadline=0;s.current.reason=reason
  notice(s,'result:'+r.number,resultText(s,entry))
  return true
 }
 async function advance(){
  return transact(async(c,s)=>{
   if(!s||s.status!=='running')return
   const now=clock()
   if(s.phase==='lobby'&&s.order.length>=3){nextRound(s,now);return}
   const r=s.current
   if(s.phase==='betting'&&(now>=r.deadline||r.eligible.every(id=>r.votes[id]))){
    s.phase='question-delivery';r.deadline=0
    notice(s,'question:'+r.number,questionText(s));return
   }
   if(s.phase==='question-delivery'){
    const n=s.notices.find(x=>x.id==='question:'+r.number)
    if(n?.sentAt&&now>=n.sentAt+NOTICE_WAIT_MS){
     s.phase='answering';r.deadline=now+(r.difficulty==='medio'?45000:60000)
    }
    return
   }
   if(s.phase==='answering'&&now>=r.deadline){await settle(c,s,false,'tempo esgotado');return}
   if(s.phase==='result'){
    const n=s.notices.find(x=>x.id==='result:'+r.number)
    if(n?.sentAt&&now>=n.sentAt+GAP_MS)nextRound(s,now)
   }
  })
 }
 async function dispatch(){
  const r=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[APOSTA_KEY])
  const s=r.rows[0]?.value
  if(!s||!isConnected())return
  const n=s.notices.find(x=>!x.sentAt)
  if(!n)return
  try{
   const sent=await sendMessage(group,n.text)
   if(!sent?.key?.id)throw new Error('Envio sem ID do WhatsApp; aguardando')
   await transact(async(_c,current)=>{
    const target=current?.notices?.find(x=>x.id===n.id)
    if(target&&!target.sentAt){target.sentAt=clock();target.messageId=String(sent.key.id)}
   })
  }catch(err){logger.warn?.('[APOSTO] aviso pendente: '+String(err?.message||err))}
 }
 async function tick(){
  if(busy||!isConnected())return
  busy=true
  try{await advance();await dispatch();await advance()}
  catch(err){logger.error?.('[APOSTO] tick: '+String(err?.message||err))}
  finally{busy=false}
 }
 async function open(){return transact(async(_c,s)=>Boolean(s),{create:true})}
 async function join({chat,sender,name}){
  if(chat!==group)return {kind:'other-group'}
  return transact(async(_c,s)=>{
   if(!s||s.status!=='running')return {kind:'closed'}
   if(s.players[sender])return {kind:'already',done:s.players[sender].done}
   if(s.order.length>=APOSTA_MAX_PLAYERS)return {kind:'full'}
   s.order.push(sender);s.players[sender]={name:nice(name),done:0,net:0}
   return {kind:'joined',count:s.order.length,total:s.order.length*4,late:s.phase!=='lobby'}
  })
 }
 async function vote({chat,sender,choice}){
  if(chat!==group)return {kind:'other-group'}
  return transact(async(c,s)=>{
   const r=s?.current
   if(!s||s.status!=='running'||s.phase!=='betting')return {kind:'not-open'}
   if(!r.eligible.includes(sender))return {kind:'not-eligible'}
   if(r.votes[sender])return {kind:'already'}
   if(choice==='confio'){r.votes[sender]={action:'confio'};return {kind:'voted',action:'confio'}}
   if(choice!=='duvido')return {kind:'invalid'}
   const balance=await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[sender])
   if(!balance.rowCount)return {kind:'unregistered'}
   const cash=Math.max(0,Number(balance.rows[0].cash)||0)
   const bank=Math.max(0,Number(balance.rows[0].bank)||0)
   if(cash+bank<APOSTA_RISK)return {kind:'insufficient',available:cash+bank}
   const holdCash=Math.min(APOSTA_RISK,cash),holdBank=APOSTA_RISK-holdCash
   const updated=await c.query('UPDATE wallets SET cash=cash-$2,bank=bank-$3,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1 AND cash >= $2 AND bank >= $3 RETURNING jid',
    [sender,holdCash,holdBank])
   if(updated.rowCount!==1)return {kind:'insufficient'}
   await ledger(c,sender,'event',APOSTA_RISK,'event_bet_hold',r.number,'risk-reserved')
   r.votes[sender]={action:'duvido',holdCash,holdBank}
   return {kind:'voted',action:'duvido'}
  })
 }
 async function answer({chat,sender,answer}){
  if(chat!==group)return {kind:'other-group'}
  return transact(async(c,s)=>{
   if(!s||s.status!=='running'||s.phase!=='answering')return {kind:'not-open'}
   const r=s.current
   if(r.challenger!==sender)return {kind:'not-challenger'}
   if(clock()>=r.deadline){await settle(c,s,false,'tempo esgotado');return {kind:'late'}}
   const raw=norm(answer)
   if(!raw)return {kind:'invalid'}
   const q=APOSTA_QUESTIONS[r.difficulty][r.questionIndex]
   const correct=norm(q[1])===raw
   await settle(c,s,correct,'resposta recebida')
   return {kind:'answered',correct}
  })
 }
 async function status(){
  const row=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[APOSTA_KEY])
  const s=row.rows[0]?.value
  if(!s)return '🎲 Evento ainda nao configurado.'
  if(s.status==='completed')return finalText(s)
  if(s.status==='cancelled')return '🛑 Evento cancelado. Apostas pendentes foram devolvidas.'
  return '🎲 *APOSTO QUE VOCE NAO CONSEGUE!*\n'+
   '📋 Jogadores: '+s.order.length+'/'+APOSTA_MAX_PLAYERS+' • '+labels(s)+
   '\n🔔 Fase: *'+({lobby:'inscricoes',betting:'apostas','question-delivery':'enviando pergunta',answering:'resposta',result:'resultado'}[s.phase]||s.phase)+'*'+
   '\n🧠 Perguntas concluídas: '+s.history.length+' / '+(s.order.length*4)+
   '\n✅ Entre mesmo com o evento iniciado: *!participar*.'
 }
 async function cancel(){
  return transact(async(c,s)=>{
   if(!s||s.status!=='running')return false
   if(s.phase==='betting'||s.phase==='question-delivery'||s.phase==='answering'){
    await refund(c,s,s.current)
   }
   s.status='cancelled';s.phase='cancelled';s.notices=[]
   notice(s,'cancel','🛑 *APOSTO QUE VOCE NAO CONSEGUE CANCELADO*\nApostas reservadas e ainda pendentes foram devolvidas. Rodadas finalizadas permanecem registradas.')
   return true
  })
 }
 return {open,join,vote,answer,status,cancel,tick,
  start(){if(timer)return;timer=setInterval(()=>{void tick()},2500);timer.unref?.();void tick()},
  stop(){if(timer)clearInterval(timer);timer=null}}
}
