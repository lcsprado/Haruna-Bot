// Guerra das Almas V2 (30/10): reinício auditado, equipes mantidas, 8x2 min.
// Substitui integralmente a mecânica anterior; NÃO executa o scheduler antigo.
import {db,grantExpInTransaction} from './db.js'
import {HALLOWEEN_SOUL_ID} from './halloween-rules.js'
import {
 GUERRA_TEAMS,GUERRA_ACTIONS,GUERRA_ROUNDS,GUERRA_TEAM_CAP,GUERRA_SECRET_ROUND_MS,
 guerraCanJoin,guerraScoreRound,guerraBuildAwards,guerraObjective
} from './guerra-almas-rules.js'
import {guerraEnsureChoices,guerraPrivateMenu,guerraSecretChoice} from './guerra-almas-secret.js'

const KEY='guerra_almas_halloween_20261030_v1'
const ARCHIVE=KEY+':cancelled-before-secret-restart'
const EDITION='secret-numbered-two-minute-restart-20261030'
const GROUPS=Object.freeze(['120363410230588690@g.us','120363429534634131@g.us'])
const fmt=n=>Number(n).toLocaleString('pt-BR')
const hour=n=>new Date(n).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
const clean=x=>String(x||'Jogador').replace(/[\r\n*_]/g,' ').slice(0,40)
const roundOf=(s,now)=>Math.min(GUERRA_ROUNDS,Math.max(1,Math.floor((now-s.start)/GUERRA_SECRET_ROUND_MS)+1))
const roundDeadline=(s,round)=>Number(s.start)+round*GUERRA_SECRET_ROUND_MS
const joinDeadline=s=>roundDeadline(s,2)
const signupOpen=(s,now)=>!s.final&&now<joinDeadline(s)
let sock=null,timer=null,ticking=false

function queue(s,id,message){
 s.notices??=[]
 if(!s.notices.some(n=>n.id===id))s.notices.push({id,text:message,sentGroups:[]})
}
async function tx(handler){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
  const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]
  if(!row){await c.query('ROLLBACK');return {missing:true}}
  const s=row.value
  const out=await handler(c,s)
  await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE key=$1',[KEY,JSON.stringify(s)])
  await c.query('COMMIT')
  return out
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
 finally{c.release()}
}
async function ensureRestart(c,s,now){
 if(s.secretEdition===EDITION)return {status:'already'}
 if(s.final){
  console.warn('[GUERRA V2] evento anterior já premiado; NÃO reabrir para evitar prêmios duplicados')
  return {status:'already-paid'}
 }
 const members=Object.entries(s.players||{})
 const count={sombras:members.filter(([,p])=>p.team==='sombras').length,
  infernal:members.filter(([,p])=>p.team==='infernal').length}
 if(count.sombras>GUERRA_TEAM_CAP||count.infernal>GUERRA_TEAM_CAP)
  throw Error('Equipes acima do limite: não reiniciar sem revisão')
 // Snapshot completo antes de zerar, dentro da mesma transação.
 await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO NOTHING',[ARCHIVE,JSON.stringify(s)])
 s.secretEdition=EDITION
 s.phase='playing'
 s.start=now
 s.joinEnd=now
 s.end=now+GUERRA_ROUNDS*GUERRA_SECRET_ROUND_MS
 s.players=Object.fromEntries(members.map(([jid,p])=>[jid,{name:p.name,team:p.team,plays:{},secretOptions:{}}]))
 s.results=[]
 s.resolvedRound=0
 s.roundOpened=0
 s.final=null
 s.notices=[]
 s.multiGroupSyncDone=true
 queue(s,'restart',
  '🎃⚔️ *GUERRA DAS ALMAS — REINÍCIO OFICIAL!*\n'+
  '❌ Disputa anterior cancelada, sem distribuição de prêmios dela.\n'+
  '✅ MESMAS EQUIPES preservadas: 💜 '+count.sombras+'/2 • 🔥 '+count.infernal+'/2\n'+
  '🏁 Placar e ações anteriores *ZERADOS*.\n'+
  '⚡ *8 rodadas de 2 MINUTOS*, começando AGORA.\n'+
  '🔒 *ESCOLHA SECRETA*: digite *!guerra opcoes* no grupo ou privado do Alpha Bot.\n'+
  '📩 Você receberá no PRIVADO seu menu de 1/2/3 embaralhado individualmente.\n'+
  '🎭 Envie *!guerra 1*, *!guerra 2* ou *!guerra 3*. O número é público, a ação verdadeira é secreta até o fim da rodada.\n'+
  '🎯 +4 pontos por cumprir o objetivo de cada rodada.\n'+
  '🏆 MVP de CADA equipe: *1 Caixa Lendária*.\n'+
  '👥 Vagas livres podem ser ocupadas até o fim da segunda rodada.')
 console.log('[GUERRA V2] CANCELADA ANTERIOR; REINÍCIO APROVADO',JSON.stringify({edition:EDITION,teams:count,oldArchive:ARCHIVE,start:now,end:s.end}))
 return {status:'restarted',teams:count}
}
function rules(){
 return '🎃⚔️ *GUERRA DAS ALMAS — REGRAS V2*\n'+
 '💜 Sombras × 🔥 Infernal, até 2 pessoas por time. Equipes anteriores preservadas.\n'+
 '⏱️ *8 rodadas de 2 minutos*, placar reiniciado do zero.\n'+
 '🔒 *!guerra opcoes* → menu individual enviado no privado.\n'+
 '🎭 Escolha com *!guerra 1*, *!guerra 2*, *!guerra 3*; cada número corresponde a ação DIFERENTE para cada jogador e rodada.\n'+
 '⚔️ Atacar vence Saquear • Defender vence Atacar • Saquear vence Defender.\n'+
 '🏆 10 pts/ação +8 pts por superar a ação predominante rival +4 pts pela missão da rodada.\n'+
 '📣 O bot revela as ações verdadeiras só ao encerrar a rodada.\n'+
 '🎃 Equipe vencedora: 15 Almas por participante ativo; perdedora: 8 Almas.\n'+
 '🌟 MVP de cada time: 1 Caixa Lendária. 80 XP por ação válida.\n'+
 '📋 Mínimo 2 rodadas participadas para premiações; vagas abertas somente até fim da rodada 2.'
}
function status(s,now){
 const counts={sombras:0,infernal:0},scores={sombras:0,infernal:0}
 for(const p of Object.values(s.players))if(Object.hasOwn(counts,p.team))counts[p.team]++
 for(const r of s.results)for(const team of Object.keys(scores))scores[team]+=Number(r.scores[team]||0)
 const round=roundOf(s,now)
 return '🎃⚔️ *GUERRA DAS ALMAS — PLACAR V2*\n'+
 (s.final?'🏁 Encerrada':'⚡ Rodada '+round+'/8 — até '+hour(roundDeadline(s,round)))+'\n'+
 '💜 Sombras: '+fmt(scores.sombras)+' pts ('+counts.sombras+'/2)\n'+
 '🔥 Infernal: '+fmt(scores.infernal)+' pts ('+counts.infernal+'/2)\n'+
 (signupOpen(s,now)?'👥 Novos inscritos até '+hour(joinDeadline(s)):'🔒 Inscrições encerradas')+'\n'+
 '🔒 !guerra opcoes • !guerra 1/2/3'
}
function resultText(s,r){
 const actions=Object.entries(r.awards).map(([jid,a])=>
  (a.team==='sombras'?'💜 ':'🔥 ')+clean(s.players[jid]?.name)+' — '+GUERRA_ACTIONS[a.action]+
  ' • '+a.points+' pts'+(a.countered?' ⚔️ vantagem':'')+(a.objective?' 🎯 missão':''))
 return '⚔️ *GUERRA DAS ALMAS — RODADA '+r.round+'/8*\n'+
 '🎯 Missão: '+r.objective.name+' (+4 pontos)\n'+
 '💜 Sombras: +'+fmt(r.scores.sombras)+' • 🔥 Infernal: +'+fmt(r.scores.infernal)+'\n'+
 '🎭 *ESCOLHAS REVELADAS*\n'+(actions.join('\n')||'Nenhuma ação registrada.')
}
async function settle(c,s){
 if(s.final)return
 const out=guerraBuildAwards(s.players,s.results)
 for(const p of out.rewards){
  await c.query(
   'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
   [p.jid,HALLOWEEN_SOUL_ID,p.souls]
  )
  if(p.legendary)await c.query(
   "INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_lendaria',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1",
   [p.jid]
  )
  if(p.xp)await grantExpInTransaction(c,p.jid,p.xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
 }
 s.final={...out,completedAt:Date.now()}
 s.phase='completed'
 const mvps=out.rewards.filter(p=>p.legendary)
 queue(s,'final','🏁 *GUERRA DAS ALMAS ENCERRADA!*\n'+
 '🏆 '+(out.winner==='empate'?'Empate':out.winner?GUERRA_TEAMS[out.winner]:'Disputa sem duas equipes ativas')+'\n'+
 '💜 '+fmt(out.totals.sombras)+' • 🔥 '+fmt(out.totals.infernal)+' pontos\n'+
 (mvps.length?'🌟 *MVPs — CAIXAS LENDÁRIAS*\n'+mvps.map(p=>GUERRA_TEAMS[p.team]+': '+clean(p.name)).join('\n'):
  '⚠️ Sem MVPs: falta confronto válido entre as duas equipes.')+
 '\n🎃 Almas, Caixas e XP registrados de forma transacional.')
}
async function advance(c,s,now){
 if(s.final||s.secretEdition!==EDITION)return
 if(!s.roundOpened){
  s.roundOpened=1
  queue(s,'open1','🎃 *GUERRA DAS ALMAS — RODADA 1/8!*\n🎯 Missão: '+guerraObjective(1).name+
   '\n🔒 !guerra opcoes → menu no privado • !guerra 1/2/3\n⏰ Até '+hour(roundDeadline(s,1)))
 }
 const complete=Math.min(GUERRA_ROUNDS,Math.max(0,Math.floor((now-s.start)/GUERRA_SECRET_ROUND_MS)))
 while(s.resolvedRound<complete){
  const round=++s.resolvedRound
  const result=guerraScoreRound(s.players,round,{objectiveBonus:true})
  s.results.push(result)
  queue(s,'round'+round,resultText(s,result))
  if(round<GUERRA_ROUNDS){
   const next=round+1;s.roundOpened=next
   queue(s,'open'+next,'⚔️ *GUERRA DAS ALMAS — RODADA '+next+'/8!*\n'+
    '🎯 Missão: '+guerraObjective(next).name+' (+4 pts).\n'+
    '🔒 !guerra opcoes (menu privado) • !guerra 1/2/3\n⏰ Até '+hour(roundDeadline(s,next)))
  }
 }
 if(now>=s.end)await settle(c,s)
}
async function sendNotices(){
 if(!sock)return
 const pending=await tx(async(_c,s)=>(s.notices||[]).filter(n=>GROUPS.some(g=>!(n.sentGroups||[]).includes(g))).slice(0,5).map(n=>({
  id:n.id,text:n.text,groups:GROUPS.filter(g=>!(n.sentGroups||[]).includes(g))
 })))
 if(pending.missing)return
 for(const n of pending){
  for(const group of n.groups){
   try{
    await sock.sendMessage(group,{text:n.text})
    await tx(async(_c,s)=>{
     const notice=s.notices?.find(x=>x.id===n.id)
     if(notice)notice.sentGroups=[...new Set([...(notice.sentGroups||[]),group])]
    })
    console.log('[GUERRA V2] aviso enviado',n.id,group)
   }catch(err){console.warn('[GUERRA V2] aviso falhou',n.id,group,err?.message||err)}
  }
 }
}
export async function tickGuerraAlmas(){
 if(ticking)return
 ticking=true
 try{
  await tx(async(c,s)=>{await ensureRestart(c,s,Date.now());await advance(c,s,Date.now())})
  await sendNotices()
 }catch(err){console.error('[GUERRA V2] tick',err?.message||err)}
 finally{ticking=false}
}
export function startGuerraAlmasScheduler(socket,{isConnected=()=>true}={}){
 sock=socket
 if(timer)return
 timer=setInterval(()=>{if(isConnected())void tickGuerraAlmas()},7000)
 timer.unref?.()
 if(isConnected())void tickGuerraAlmas()
 console.log('[GUERRA V2] scheduler de 2 minutos, segredo individual, dois grupos')
}
export async function handleGuerraAlmasCommand({cmd,args=[],sender,name,chat,reply}){
 if(!['guerra','guerraalmas'].includes(cmd))return false
 const group=GROUPS.includes(chat),pv=!String(chat||'').endsWith('@g.us')
 if(!group&&!pv){await reply('🎃 Guerra das Almas disponível nos grupos oficiais e privado do Alpha Bot.');return true}
 const arg=String(args[0]||'status').toLowerCase()
 const sub=arg==='entrar'?String(args[1]||'').toLowerCase():arg
 if(sub==='regras'||sub==='ajuda'){await reply(rules());return true}
 const outcome=await tx(async(c,s)=>{
  await ensureRestart(c,s,Date.now())
  await advance(c,s,Date.now())
  if(s.secretEdition!==EDITION)return '⚠️ O evento anterior já foi premiado; reinício bloqueado para evitar duplicação.'
  const now=Date.now()
  if(['status','placar'].includes(sub))return status(s,now)
  const team=['sombras','sombra'].includes(sub)?'sombras':['infernal','fogo'].includes(sub)?'infernal':null
  if(team){
   if(!group)return '👥 Escolha a equipe em um dos dois grupos oficiais.'
   if(!signupOpen(s,now))return '🔒 Inscrições fechadas após a segunda rodada.\n'+status(s,now)
   if(s.players[sender])return '✅ Você já está em '+GUERRA_TEAMS[s.players[sender].team]+'. Equipe preservada.'
   const counts=Object.values(s.players).filter(p=>p.team===team).length
   if(counts>=GUERRA_TEAM_CAP)return '🚫 Facção lotada. Máximo de 2 participantes por equipe.'
   if(!guerraCanJoin(s.players,team))return '⚖️ Para equilibrar, escolha a outra equipe.'
   s.players[sender]={name:clean(name),team,plays:{},secretOptions:{}}
   return '✅ Inscrito em '+GUERRA_TEAMS[team]+'.\n🔒 Use *!guerra opcoes* para receber seu menu secreto no privado.'
  }
  const p=s.players[sender]
  if(sub==='opcoes'||sub==='opções'||sub==='menu'){
   if(s.final||now>=s.end)return '🏁 A disputa acabou.'
   if(!p)return '⚠️ Você não está inscrito. Use !guerra sombras/infernal no grupo enquanto houver vaga.'
   const round=roundOf(s,now)
   if(p.plays[String(round)])return '✅ Você já jogou nesta rodada.'
   guerraEnsureChoices(p,round)
   return {menu:guerraPrivateMenu(p,round)}
  }
  if(/^[123]$/.test(sub)||Object.hasOwn(GUERRA_ACTIONS,sub)){
   if(s.final||now>=s.end)return '🏁 A disputa acabou.'
   if(!p)return '⚠️ Você não está inscrito.'
   if(!/^[123]$/.test(sub))return '🔒 Não revele a ação! Solicite *!guerra opcoes* e escolha com *!guerra 1/2/3*.'
   const round=roundOf(s,now)
   if(p.plays[String(round)])return '✅ Sua ação secreta já foi registrada nesta rodada. Aguarde a revelação.'
   const action=guerraSecretChoice(p,round,sub)
   if(!action)return '🔒 Primeiro peça seu menu individual com *!guerra opcoes*.'
   p.plays[String(round)]=action
   return '🔒✅ '+clean(p.name)+': escolha número *'+sub+'* registrada para a rodada '+round+'/8. Ação verdadeira será revelada depois.'
  }
  return '🎃 Comandos: !guerra status • !guerra regras • !guerra opcoes • !guerra 1/2/3'
 })
 if(outcome?.missing){await reply('⚠️ Evento original não encontrado. Nada foi reiniciado para evitar perda de dados.');return true}
 if(outcome&&typeof outcome==='object'&&typeof outcome.menu==='string'){
  if(pv){await reply(outcome.menu);return true}
  try{
   if(!sock)throw Error('WhatsApp não conectado')
   await sock.sendMessage(sender,{text:outcome.menu})
   await reply('🔒✅ Seu menu 1/2/3 foi enviado no *privado*. Consulte a mensagem e escolha sem revelar a ação.')
  }catch(e){
   console.warn('[GUERRA V2] mensagem privada falhou',String(e?.message||e))
   await reply('⚠️ Não consegui enviar seu menu por mensagem privada. Abra o PV do Alpha Bot e mande *!guerra opcoes*. Sua rodada não foi consumida.')
  }
  return true
 }
 await reply(outcome)
 return true
}
