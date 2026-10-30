// Guerra das Almas — evento único interativo Halloween 30/10.
// Duração 45 min: inscrição 5 min + 8 rodadas de 5 min.
// Sem usar níveis/equipamentos; resultados e premiação são transacionais e retomáveis.
import {db,grantExpInTransaction} from './db.js'
import {HALLOWEEN_SOUL_ID} from './halloween-rules.js'
import {GUERRA_TEAMS,GUERRA_ACTIONS,GUERRA_ROUNDS,GUERRA_JOIN_MS,GUERRA_ROUND_MS,GUERRA_TOTAL_MS,guerraRoundAt,guerraRoundEnd,guerraScoreRound,guerraBuildAwards,GUERRA_TEAM_CAP,guerraCanJoin} from './guerra-almas-rules.js'

export const GUERRA_KEY='guerra_almas_halloween_20261030_v1'
export const GUERRA_GROUP='120363410230588690@g.us'
export const GUERRA_GROUPS=Object.freeze([GUERRA_GROUP,'120363429534634131@g.us'])
const LAST_START=Date.parse('2026-10-30T22:00:00-03:00')
const fmt=n=>Number(n).toLocaleString('pt-BR')
const clock=ms=>new Date(ms).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
const safe=s=>String(s||'Jogador').replace(/[\r\n*_]/g,' ').slice(0,42)
let timer=null,busy=false,socket=null

function notice(state,id,text){
 if(!state.notices.some(n=>n.id===id))state.notices.push({id,text,sent:false})
}
async function withState(work,{create=false}={}){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[GUERRA_KEY])
  if(create&&Date.now()<LAST_START){
   const now=Date.now()
   const state={phase:'joining',start:now,joinEnd:now+GUERRA_JOIN_MS,end:now+GUERRA_TOTAL_MS,
    players:{},results:[],resolvedRound:0,roundOpened:0,notices:[],final:null}
   await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO NOTHING',[GUERRA_KEY,JSON.stringify(state)])
  }
  const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[GUERRA_KEY])).rows[0]
  const state=row?.value||null
  const output=await work(c,state)
  if(state)await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE key=$1',[GUERRA_KEY,JSON.stringify(state)])
  await c.query('COMMIT')
  return output
 }catch(err){
  await c.query('ROLLBACK').catch(()=>{})
  throw err
 }finally{c.release()}
}
function instructions(){
 return '🎃⚔️ *GUERRA DAS ALMAS — HALLOWEEN*\n'+
 '💜 *Legião das Sombras* vs 🔥 *Ordem Infernal*\n'+
 '⏱️ 5 minutos para entrar + 8 rodadas de 5 minutos.\n'+
 '👥 *!guerra sombras* ou *!guerra infernal* para escolher sua facção. *Apenas 2 jogadores por facção* (4 vagas no total), equipes equilibradas.\n'+
 '⚔️ Cada rodada: *!guerra atacar*, *!guerra defender* ou *!guerra saquear*. Uma ação por pessoa e rodada.\n'+
 '🧠 Atacar vence Saquear • Defender vence Atacar • Saquear vence Defender. A maior escolha da facção adversária determina o contra-ataque (+8 pontos); todos os golpes dão pelo menos 10.\n'+
 '🏆 Equipe vencedora: *15 Almas* por participante ativo. Equipe derrotada: *8 Almas*.\n'+
 '🌟 *MVP de CADA equipe: 1 CAIXA LENDÁRIA!*\n'+
 '✨ +80 XP por ação válida, pagos no encerramento.\n'+
 '📋 É preciso jogar pelo menos 2 rodadas para receber prêmios; as duas facções precisam ter participantes ativos para liberar os MVPs.\n'+
 '⚖️ O nível, o ATK e os pets não influenciam a pontuação.\n'+
 '👉 *!guerra status* mostra a disputa.'
}
function status(state,now=Date.now()){
 if(!state)return '🎃 A Guerra das Almas ainda não começou.'
 const counts={sombras:0,infernal:0}
 for(const p of Object.values(state.players))if(counts[p.team]!==undefined)counts[p.team]++
 const totals={sombras:0,infernal:0}
 for(const r of state.results)for(const t of Object.keys(totals))totals[t]+=Number(r.scores[t]||0)
 const round=guerraRoundAt(state.start,now)
 const time=state.final?'Encerrada':now<state.joinEnd?'Inscrições até '+clock(state.joinEnd):'Rodada '+round+'/'+GUERRA_ROUNDS+' • até '+clock(guerraRoundEnd(state.start,round))
 return '🎃⚔️ *GUERRA DAS ALMAS*\n'+
 '⏰ '+time+'\n'+
 '💜 Sombras: *'+fmt(totals.sombras)+' pts* ('+counts.sombras+'/'+GUERRA_TEAM_CAP+' vagas)\n'+
 '🔥 Infernal: *'+fmt(totals.infernal)+' pts* ('+counts.infernal+'/'+GUERRA_TEAM_CAP+' vagas)\n'+
 (state.final?'🏆 '+(state.final.winner==='empate'?'Empate':state.final.winner?GUERRA_TEAMS[state.final.winner]:'Disputa sem dois times ativos')+'\n':'')+
 '📋 !guerra regras • !guerra atacar/defender/saquear'
}
function roundNotice(result){
 const t=result.scores
 const winners=result.majority
 return '⚔️ *GUERRA DAS ALMAS — RODADA '+result.round+' ENCERRADA*\n'+
 '💜 Sombras +'+fmt(t.sombras)+' pts • 🔥 Infernal +'+fmt(t.infernal)+' pts\n'+
 '🧠 Ações dominantes: Sombras '+(winners.sombras||'empate/sem ações')+
 ' • Infernal '+(winners.infernal||'empate/sem ações')+'\n'+
 '👥 '+result.totalActions+' ações válidas.'
}
function finalNotice(result){
 const winner=result.winner==='empate'?'🤝 Empate':result.winner?GUERRA_TEAMS[result.winner]:'⚠️ Sem confronto suficiente entre equipes'
 const summary='🏁 *GUERRA DAS ALMAS ENCERRADA!*\n'+
 '🏆 '+winner+'\n💜 '+fmt(result.totals.sombras)+' pts • 🔥 '+fmt(result.totals.infernal)+' pts\n'
 const mvps=result.rewards.filter(x=>x.legendary)
 const winners=mvps.length?'\n🌟 *MVPs — CAIXA LENDÁRIA*\n'+mvps.map(p=>GUERRA_TEAMS[p.team]+': *'+safe(p.name)+'* ('+fmt(p.points)+' pts)').join('\n'):'\nNenhuma Caixa Lendária distribuída: falta confronto válido entre as duas equipes.'
 return summary+winners+'\n🎃 Almas e XP creditados diretamente aos participantes elegíveis.\n📋 !guerra status'
}
async function settle(c,state){
 const outcome=guerraBuildAwards(state.players,state.results)
 for(const r of outcome.rewards){
  if(r.souls>0)await c.query(
   'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',
   [r.jid,HALLOWEEN_SOUL_ID,r.souls]
  )
  if(r.legendary)await c.query(
   "INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'caixa_lendaria',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1",
   [r.jid]
  )
  if(r.xp>0)await grantExpInTransaction(c,r.jid,r.xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
 }
 state.phase='completed'
 state.final={...outcome,completedAt:Date.now()}
 notice(state,'final',finalNotice(outcome))
 return outcome
}
async function advance(c,state,now){
 if(!state||state.final)return
 if(now>=state.joinEnd&&state.roundOpened===0){
  state.phase='playing';state.roundOpened=1
  notice(state,'open1','⚔️ *GUERRA DAS ALMAS — RODADA 1/8!*\nEscolha: *!guerra atacar*, *!guerra defender* ou *!guerra saquear*. Você tem 5 minutos.')
 }
 const shouldResolve=Math.max(0,Math.min(GUERRA_ROUNDS,Math.floor((now-state.joinEnd)/GUERRA_ROUND_MS)))
 while(state.resolvedRound<shouldResolve){
  const round=++state.resolvedRound
  const outcome=guerraScoreRound(state.players,round)
  state.results.push(outcome)
  notice(state,'round'+round,roundNotice(outcome))
  if(round<GUERRA_ROUNDS){
   state.roundOpened=round+1
   notice(state,'open'+(round+1),'🎃 *RODADA '+(round+1)+'/8 ABERTA!*\n⚔️ !guerra atacar • 🛡️ !guerra defender • 💰 !guerra saquear\n⏰ Até '+clock(guerraRoundEnd(state.start,round+1)))
  }
 }
 if(now>=state.end&&!state.final)await settle(c,state)
}
// Entrega por grupo: respeita confirmação antiga do grupo 1 sem impedir envio ao grupo 2.
// A mesma edição e o mesmo estado do prêmio valem para todos os dois grupos.
async function sendPending(){
 if(!socket)return
 const pending=await withState(async(_c,state)=>(state?.notices||[])
  .filter(n=>GUERRA_GROUPS.some(group=>!new Set([
   ...(n.sentGroups||[]),...(n.sent?[GUERRA_GROUP]:[])
  ]).has(group))).slice(0,5).map(n=>({
   id:n.id,text:n.text,groups:GUERRA_GROUPS.filter(group=>!new Set([
    ...(n.sentGroups||[]),...(n.sent?[GUERRA_GROUP]:[])
   ]).has(group))
  })))
 for(const n of pending){
  for(const group of n.groups){
   try{
    await socket.sendMessage(group,{text:n.text})
    await withState(async(_c,state)=>{
     const found=state?.notices?.find(x=>x.id===n.id)
     if(!found)return
     found.sentGroups=[...new Set([...(found.sent?[GUERRA_GROUP]:[]),...(found.sentGroups||[]),group])]
     found.sent=GUERRA_GROUPS.every(id=>found.sentGroups.includes(id))
    })
    console.log('[GUERRA ALMAS] aviso enviado',JSON.stringify({notice:n.id,group}))
   }catch(err){
    console.warn('[GUERRA ALMAS] envio pendente',n.id,group,err?.message||err)
   }
  }
 }
}
export async function tickGuerraAlmas(){
 if(busy)return
 busy=true
 try{
  await withState(async(c,state)=>{
   if(!state)return
   if(!state.notices.some(n=>n.id==='start'))notice(state,'start',instructions()+'\n⏰ Inscrições até *'+clock(state.joinEnd)+'*.')
   await advance(c,state,Date.now())
  },{create:true})
  await sendPending()
 }catch(err){console.error('[GUERRA ALMAS] tick',err?.message||err)}
 finally{busy=false}
}
export function startGuerraAlmasScheduler(sock,{isConnected=()=>true}={}){
 socket=sock
 if(timer)return
 timer=setInterval(()=>{if(isConnected())void tickGuerraAlmas()},8000)
 timer.unref?.()
 if(isConnected())void tickGuerraAlmas()
 console.log('[GUERRA ALMAS] scheduler interativo ativo, dois grupos, uma disputa global')
}
export async function handleGuerraAlmasCommand({cmd,args=[],sender,name,chat,reply}){
 if(!['guerra','guerraalmas'].includes(cmd))return false
 if(!GUERRA_GROUPS.includes(chat)){await reply('🎃 Guerra das Almas acontece apenas nos dois grupos oficiais do Alpha Bot.');return true}
 const chosen=String(args[0]||'status').toLowerCase()
 const sub=chosen==='entrar'?String(args[1]||'').toLowerCase():chosen
 if(sub==='regras'||sub==='ajuda'){await reply(instructions());return true}
 const message=await withState(async(c,state)=>{
  if(!state)return '⌛ A Guerra das Almas ainda não foi iniciada.'
  const now=Date.now()
  await advance(c,state,now)
  if(sub==='status'||sub==='placar')return status(state,now)
  const team=sub==='sombras'||sub==='sombra'?'sombras':sub==='infernal'||sub==='fogo'?'infernal':null
  if(team){
   if(now>=state.joinEnd||state.final)return '⏰ Inscrições encerradas.\n'+status(state,now)
   const prev=state.players[sender]
   if(prev)return '✅ Você já entrou na '+GUERRA_TEAMS[prev.team]+'. Não é permitido trocar de facção.'
   const count=Object.values(state.players).filter(x=>x.team===team).length
   const rival=Object.values(state.players).filter(x=>x.team!==team).length
   if(count>=GUERRA_TEAM_CAP)return '🚫 Facção lotada: máximo de *2 jogadores* por equipe. Escolha outra facção que tenha vaga.\n'+status(state,now)
   if(!guerraCanJoin(state.players,team))return '⚖️ Para manter 2×2 equilibrado, entre na '+GUERRA_TEAMS[team==='sombras'?'infernal':'sombras']+'.'
   state.players[sender]={name:safe(name),team,plays:{}}
   return '✅ *Inscrição confirmada!*\n'+safe(name)+' entrou na '+GUERRA_TEAMS[team]+'.\n⏰ Primeira rodada às '+clock(state.joinEnd)+'.'
  }
  if(Object.hasOwn(GUERRA_ACTIONS,sub)){
   if(state.final||now>=state.end)return '🏁 Evento encerrado.\n'+status(state,now)
   if(now<state.joinEnd)return '⏰ Ainda estamos na inscrição. Escolha uma facção: !guerra sombras ou !guerra infernal.'
   const p=state.players[sender]
   if(!p)return '⚠️ Você não está inscrito nesta edição.'
   const round=guerraRoundAt(state.start,now)
   if(round<1||round>GUERRA_ROUNDS)return '⏳ Rodada indisponível.'
   if(p.plays[String(round)])return '✅ Ação desta rodada já registrada: '+GUERRA_ACTIONS[p.plays[String(round)]]+'. Aguarde a próxima.'
   p.plays[String(round)]=sub
   return '✅ '+safe(p.name)+' — '+GUERRA_ACTIONS[sub]+' na rodada '+round+'/'+GUERRA_ROUNDS+'.\n🎯 Resultado divulgado ao fim da rodada.'
  }
  return '🎃 Comandos: !guerra regras • !guerra status • !guerra sombras/infernal • !guerra atacar/defender/saquear'
 })
 await reply(message)
 return true
}
