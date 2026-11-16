// GT Alpha Bot: somente o carro equipado às 20h30 entra nas três provas automáticas.
import {db,grantExpInTransaction} from './db.js'
import {racingDriverLevel,racingTuning,racingModel,RACING_MIN_CONDITION} from './racing-rules.js'
import {
 GT_GROUP,GT_MIN_DRIVERS,GT_DAILY_WEAR,GT_WEEKLY_PRIZES,
 gtBrazilDay,gtWeekStart,gtWeekEnd,gtDayStartMs,gtDayIsSunday,GT_FIRST_SEASON_END,
 gtRunHeats,gtReplayWithEntrant,gtCleanName,gtFormatCash,gtLeaderboard,gtTrackProgram,GT_WEATHER_LABELS,gtPartialStandings,gtRaceReward
} from './gt-alpha-rules.js'
import {initGtSponsors,gtSponsorProgressInTx,gtSponsorChoose,gtSponsorText,gtSponsorConfirmedText} from './gt-alpha-sponsors.js'

const FIRST_DAY='2026-11-15',DAY_PREFIX='gt_alpha_day:',WEEK_PREFIX='gt_alpha_week:'
let socket=null,connected=()=>true,timer=null,busy=false,lastIdleSweep=0,starting=false
const dayKey=day=>DAY_PREFIX+day
const weekKey=week=>WEEK_PREFIX+week
const nowSec=()=>Math.floor(Date.now()/1000)
const money=gtFormatCash
function addNotice(s,id,text){
 s.noticeQueue=s.noticeQueue||[]
 if(!s.noticeQueue.some(n=>n.id===id))s.noticeQueue.push({id,text,createdAt:Date.now(),deliveredAt:0})
}
async function mutate(key,fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key])
  const found=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value
  const s=found||{}
  const result=await fn(s,c)
  await c.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[key,JSON.stringify(s)])
  await c.query('COMMIT')
  return result
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
async function read(key){return (await db.query('SELECT value FROM trevo_settings WHERE key=$1',[key])).rows[0]?.value||null}
async function eligible(c){
 await c.query("UPDATE racing_cars_alpha SET upgrades=jsonb_set(upgrades,ARRAY[pending_part],to_jsonb(pending_level),TRUE), pending_part=NULL,pending_level=NULL,pending_until=0 WHERE equipped=TRUE AND pending_part IS NOT NULL AND pending_until>0 AND pending_until<=$1",[nowSec()])
 const rows=(await c.query("SELECT c.id AS car_id,c.jid,c.model_id,c.condition,c.upgrades,c.pending_part,p.xp,u.push_name,u.level AS player_level FROM racing_cars_alpha c JOIN racing_profiles_alpha p ON p.jid=c.jid JOIN users u ON u.jid=c.jid WHERE c.equipped=TRUE ORDER BY c.jid FOR UPDATE OF c")).rows
 // A oficina NÃO bloqueia a participação; apenas os upgrades já concluídos contam.
 return rows.filter(r=>Number(r.condition)>=RACING_MIN_CONDITION)
  .map(r=>({jid:r.jid,carId:Number(r.car_id),modelId:r.model_id,name:gtCleanName(r.push_name),condition:Number(r.condition),upgrades:r.upgrades||{},driverLevel:racingDriverLevel(r.xp),playerLevel:Number(r.player_level)}))
}
function rankText(rows,title){
 return title+'\n\n'+(rows.length?rows.map((r,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.')+' *'+gtCleanName(r.name)+'* — *'+r.points+' pts* • '+r.wins+' vitória(s)').join('\n'):'Nenhum resultado registrado.')
}

function heatText(heat,n,s){
 return '🏁 *GT ALPHA BOT — '+n+'ª PROVA*\n'+heat.name+
  '\n🌦️ Condições: '+(GT_WEATHER_LABELS[heat.weather]||'☀️ Pista seca')+'\n\n'+
  heat.positions.map(p=>(p.place===1?'🥇':p.place===2?'🥈':p.place===3?'🥉':p.place+'.')+
   ' '+gtCleanName(p.name)+' — '+p.score.toFixed(2)+' desempenho • +'+p.points+' pts'+
   (p.reward?'\n💰 +'+money(p.reward.cash)+' • ✨ +'+p.reward.playerXp.toLocaleString('pt-BR')+
    ' XP personagem • 👨‍✈️ +'+p.reward.pilotXp+' XP piloto'+
    (p.reward.levelUps?' • ⬆️ +'+p.reward.levelUps+' nível(is)':''):'')).join('\n')+
  '\n\n'+rankText(gtPartialStandings(s),'📊 *CLASSIFICAÇÃO PARCIAL*')
}
async function prepNotice(day){
 const key=dayKey(day)
 const s=await read(key)
 if(s?.preparationNotice)return
 await mutate(key,state=>{
  if(state.preparationNotice)return
  state.preparationNotice=Date.now()
  addNotice(state,'preparation',
   '🏎️ *GT ALPHA BOT — HOJE ÀS 20H30!*\n\n'+
   '🏁 Três corridas automáticas, com pistas e condições do dia:\n'+
   gtTrackProgram(day).map((track,i)=>'• '+(i+1)+'ª '+track.name+' — '+GT_WEATHER_LABELS[track.weather]).join('\n')+'\n'+
   '🚘 *SOMENTE O CARRO EQUIPADO* às 20h30 participará, inclusive se estiver em melhoria (usando o nível já instalado).\n'+
   '🔧 Prepare agora: *!garagemcorrida* • *!oficina* • *!equiparcorrida ID* • *!repararcarro*.\n'+
   '⚙️ Quanto mais preparado o carro, maior a vantagem.\n'+
   '📊 Pontuação: 1º 10 | 2º 7 | 3º 5 | 4º 3 | demais 1.\n'+
   '🎁 Cada prova: dinheiro, XP do piloto e XP do personagem (60% a 30% do necessário ao próximo nível, conforme posição).\n'+
   '🏆 Prêmios semanais: 1º R$ 15M, 2º R$ 8M, 3º R$ 5M, 4º R$ 1M.\n'+
   '✅ Não precisa se inscrever. Tudo é automático.\n'+
   '📋 Use *!gttabela* e *!gttabela semana*.')
 })
}
async function runDay(day){
 const start=gtDayStartMs(day)
 // A oficina pode terminar segundos após 20h30; capturar o carro às 20:30:10.
 if(Date.now()<start+10000)return
 await mutate(dayKey(day),async(s,c)=>{
  // Pode recuperar até três provas na mesma transação; XP exige mais consultas.
  await c.query("SET LOCAL statement_timeout='90000ms'")
  if(['completed','cancelled'].includes(s.phase))return
  if(!s.phase){
   if(Date.now()>start+(day==='2026-11-15'?15:10)*60000){
    s.phase='cancelled';s.day=day
    addNotice(s,'missed','🏁 *GT ALPHA BOT — ETAPA NÃO DISPUTADA*\nO bot não estava pronto no horário das 20h30. Nenhum resultado foi simulado retroativamente.')
    return
   }
   const participants=await eligible(c)
   s.day=day;s.startedAt=Date.now()
   s.participants=participants.map(p=>({jid:p.jid,name:p.name,carId:p.carId,modelId:p.modelId,playerLevel:p.playerLevel}))
   if(participants.length<GT_MIN_DRIVERS){
    s.phase='cancelled'
    addNotice(s,'cancel','🏁 *GT ALPHA BOT — ETAPA NÃO DISPUTADA*\n\nMenos de dois carros equipados e aptos às 20h30. Nenhum ponto distribuído.')
    return
   }
   s.results=gtRunHeats(participants,Math.random,day)
   s.stage=0;s.phase='running';s.nextAt=Math.max(start+30000,Date.now()+30000)
   addNotice(s,'start','🏎️ *GT ALPHA BOT — LARGADA!*\n\n👨‍✈️ '+participants.length+
    ' pilotos inscritos automaticamente com seus carros principais às *20h30*.\n'+
    '🛣️ '+s.results.heats.map(h=>h.name+' ('+GT_WEATHER_LABELS[h.weather]+')').join(' → ')+'.\n'+
    '⚙️ Melhorias e condições registradas na largada.\n'+
    '🤖 Corridas automáticas, com dinheiro e XP a cada prova. Consulte *!gttabela*.')
  }
  if(s.phase!=='running')return
  while(s.stage<3&&Date.now()>=Number(s.nextAt)){
   const heat=s.results.heats[s.stage]
   // Pagar a prova inteira e avançar s.stage no mesmo commit do estado GT.
   // Uma falha em qualquer jogador desfaz carteira, perfil, XP e etapa.
   for(const position of heat.positions){
    const participant=s.participants.find(p=>p.jid===position.jid)
    if(!participant||!Number.isSafeInteger(participant.playerLevel)||participant.playerLevel<1)
     throw Error('GT sem nivel do jogador registrado na largada')
    const reward=gtRaceReward(position.place,participant.playerLevel)
    const pilot=await c.query('UPDATE racing_profiles_alpha SET xp=xp+$1 WHERE jid=$2 RETURNING xp',[reward.pilotXp,position.jid])
    if(pilot.rowCount!==1)throw Error('Piloto ausente na premiação da prova do GT')
    const wallet=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=$2 WHERE jid=$3',[reward.cash,nowSec(),position.jid])
    if(wallet.rowCount!==1)throw Error('Carteira ausente na premiação da prova do GT')
    const exp=await grantExpInTransaction(c,position.jid,reward.playerXp,{
     ignoreXpBoost:true,ignoreGroupProgressionEvent:true
    })
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'gt_alpha_heat',$3)",
     [position.jid,reward.cash,dayKey(day)+':heat:'+(s.stage+1)+':place:'+position.place])
    position.reward={...reward,levelUps:exp.levels||0}
   }
   s.stage++;s.nextAt+=3*60000
   addNotice(s,'heat:'+s.stage,heatText(heat,s.stage,s))
  }
  if(s.stage===3){
   // Desgaste da sessão aplicado uma única vez na transação do encerramento.
   for(const p of s.participants){
    const won=s.results.heats.filter(h=>h.positions[0]?.jid===p.jid).length
    const r=await c.query('UPDATE racing_cars_alpha SET condition=GREATEST(0,condition-$1),races=races+3,wins=wins+$2 WHERE id=$3 AND jid=$4',[GT_DAILY_WEAR*3,won,p.carId,p.jid])
    if(r.rowCount!==1)throw Error('Carro não encontrado na finalização do GT')
   }
   const sponsors=await gtSponsorProgressInTx(c,{day,heats:s.results.heats,participants:s.participants,startedAt:s.startedAt})
   s.phase='completed';s.completedAt=Date.now()
   addNotice(s,'final',rankText(s.results.standings,'🏆 *GT ALPHA BOT — CLASSIFICAÇÃO DO DIA*')+
    '\n\n📌 Pontuação somada ao ranking semanal.\n🔧 Desgaste nos carros: -'+(GT_DAILY_WEAR*3)+' de condição.'+
    (sponsors.length?'\n\n🤝 *Patrocínios concluídos:*\n'+sponsors.map(p=>'• '+p.name+' — '+p.text).join('\n'):''))
  }
 })
}

/**
 * Reparação excepcional, autorizada pelo proprietário, da corrida de 16/11.
 * Preserva o desempenho dos três pilotos originais e insere o carro que
 * estava equipado e não correu por causa de pending_part. É transacional,
 * preserva o registro da etapa anterior e credita apenas diferenças.
 */
async function rematchGtAlpha20261116(){
 const day='2026-11-16',key=dayKey(day),mark='pending-upgrade-car-1-rematch-v1'
 await mutate(key,async(s,c)=>{
  await c.query("SET LOCAL statement_timeout='90000ms'")
  if(s.correction?.id===mark)return
  if(s.phase!=='completed'||s.stage!==3||s.results?.heats?.length!==3)
   throw Error('GT 16/11: estado original não corresponde às 3 provas completas')
  const carIds=s.participants.map(p=>Number(p.carId)).sort((a,b)=>a-b)
  if(JSON.stringify(carIds)!=='[3,6,8]')
   throw Error('GT 16/11: participantes originais divergentes; correção não aplicada')
  const oldResults=JSON.parse(JSON.stringify(s.results))
  const ledger=(await c.query(
   "SELECT to_jid,amount,note FROM transactions WHERE type='gt_alpha_heat' AND note LIKE $1 FOR UPDATE",
   [key+':heat:%']
  )).rows
  if(ledger.length!==9)throw Error('GT 16/11: devem existir exatamente nove pagamentos originais')
  for(const [i,heat] of oldResults.heats.entries())for(const pos of heat.positions){
   const note=key+':heat:'+(i+1)+':place:'+pos.place
   if(!ledger.some(t=>t.to_jid===pos.jid&&t.note===note&&Number(t.amount)===pos.reward?.cash))
    throw Error('GT 16/11: pagamento original divergente: '+note)
  }
  const row=(await c.query(
   "SELECT car.id,car.jid,car.model_id,car.condition,car.upgrades,car.pending_part,car.pending_level,car.pending_until,p.xp,u.push_name,u.level AS player_level FROM racing_cars_alpha car JOIN racing_profiles_alpha p ON p.jid=car.jid JOIN users u ON u.jid=car.jid WHERE car.id=1 AND car.equipped=TRUE FOR UPDATE OF car"
  )).rows[0]
  if(!row||Number(row.condition)<RACING_MIN_CONDITION||
     Number(row.pending_until)*1000<=gtDayStartMs(day)||
     row.pending_part!=='freios'||Number(row.upgrades?.freios)!==2)
   throw Error('GT 16/11: carro omitido não corresponde ao estado auditado na largada')
  const entrant={
   jid:row.jid,carId:Number(row.id),modelId:row.model_id,
   name:gtCleanName(row.push_name),condition:Number(row.condition),
   upgrades:row.upgrades,driverLevel:racingDriverLevel(row.xp),
   playerLevel:Number(row.player_level)
  }
  if(s.participants.some(p=>p.jid===entrant.jid))
   throw Error('GT 16/11: carro já incluído nos resultados')
  if(!Number.isSafeInteger(entrant.playerLevel)||entrant.playerLevel<1)
   throw Error('GT 16/11: nível inicial do novo piloto inválido')
  const revised=gtReplayWithEntrant(oldResults,entrant,day)
  const participants=[...s.participants,{
   jid:entrant.jid,name:entrant.name,carId:entrant.carId,
   modelId:entrant.modelId,playerLevel:entrant.playerLevel
  }]
  const byJid=new Map(participants.map(p=>[p.jid,p]))
  const deltas=new Map(participants.map(p=>[p.jid,{jid:p.jid,cash:0,pilotXp:0,playerXp:0}]))
  for(const [i,heat] of revised.heats.entries())for(const pos of heat.positions){
   const member=byJid.get(pos.jid)
   if(!member)throw Error('GT 16/11: participante sem nível de largada')
   const reward=gtRaceReward(pos.place,Number(member.playerLevel))
   const original=oldResults.heats[i].positions.find(p=>p.jid===pos.jid)?.reward
   const delta=deltas.get(pos.jid)
   delta.cash+=reward.cash-Number(original?.cash||0)
   delta.pilotXp+=reward.pilotXp-Number(original?.pilotXp||0)
   delta.playerXp+=reward.playerXp-Number(original?.playerXp||0)
   pos.reward={...reward,levelUps:0}
  }
  // Todos os pilotos originais já estavam no teto de maestria da classe;
  // caso a situação tenha mudado, não corrigir só parte do XP.
  const cls=(await c.query(
   "SELECT p.jid,p.level FROM player_class_levels p JOIN stats st ON st.jid=p.jid AND st.class_id=p.class_id AND st.class_applied=TRUE WHERE p.jid=ANY($1::text[])",
   [s.participants.map(p=>p.jid)]
  )).rows
  if(cls.length!==3||cls.some(p=>Number(p.level)!==100))
   throw Error('GT 16/11: classe ativa mudou, correção de XP exige revisão')
  // A diferença de cada premiação é aplicada uma vez, na mesma transação
  // da nova classificação. Sem estornar atividades externas dos jogadores.
  for(const delta of deltas.values()){
   const pilot=await c.query(
    'UPDATE racing_profiles_alpha SET xp=xp+$1 WHERE jid=$2 AND xp+$1>=0',
    [delta.pilotXp,delta.jid]
   )
   if(pilot.rowCount!==1)throw Error('GT 16/11: XP piloto não pode ser compensado')
   const wallet=await c.query(
    'UPDATE wallets SET cash=cash+$1,updated_at=$2 WHERE jid=$3 AND cash+$1>=0',
    [delta.cash,nowSec(),delta.jid]
   )
   if(wallet.rowCount!==1)throw Error('GT 16/11: carteira não pode ser compensada')
   if(delta.playerXp<0){
    const xp=await c.query(
     'UPDATE users SET exp=exp+$1,updated_at=$2 WHERE jid=$3 AND exp+$1>=0',
     [delta.playerXp,nowSec(),delta.jid]
    )
    if(xp.rowCount!==1)throw Error('GT 16/11: XP acumulado mudou; impedir reversão parcial')
   }else if(delta.playerXp>0){
    const award=await grantExpInTransaction(c,delta.jid,delta.playerXp,{
     ignoreXpBoost:true,ignoreGroupProgressionEvent:true
    })
    // O carro excluído recebe XP real e os bônus normais por subir nível.
    if(delta.jid===entrant.jid){
     for(const heat of revised.heats){
      const pos=heat.positions.find(p=>p.jid===entrant.jid)
      if(pos)pos.reward.levelUps=0
     }
     revised.correctionLevelUps=award.levels||0
    }
   }
   if(delta.cash!==0){
    const outgoing=delta.cash<0
    await c.query(
     'INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',
     [outgoing?delta.jid:'system',outgoing?'system':delta.jid,
      Math.abs(delta.cash),'gt_alpha_rematch_adjustment',
      key+':rematch:'+delta.jid]
    )
   }
  }
  const previousWins=new Map(s.participants.map(p=>[
   p.jid,oldResults.heats.filter(h=>h.positions[0]?.jid===p.jid).length
  ]))
  const revisedWins=new Map(participants.map(p=>[
   p.jid,revised.heats.filter(h=>h.positions[0]?.jid===p.jid).length
  ]))
  for(const p of s.participants){
   const winChange=(revisedWins.get(p.jid)||0)-(previousWins.get(p.jid)||0)
   if(!winChange)continue
   const upd=await c.query(
    'UPDATE racing_cars_alpha SET wins=wins+$1 WHERE id=$2 AND jid=$3 AND wins+$1>=0',
    [winChange,p.carId,p.jid]
   )
   if(upd.rowCount!==1)throw Error('GT 16/11: vitórias históricas não conciliadas')
  }
  const wear=GT_DAILY_WEAR*3
  const car=await c.query(
   'UPDATE racing_cars_alpha SET condition=condition-$1,races=races+3,wins=wins+$2 WHERE id=$3 AND jid=$4 AND condition>=$1',
   [wear,revisedWins.get(entrant.jid)||0,entrant.carId,entrant.jid]
  )
  if(car.rowCount!==1)throw Error('GT 16/11: desgaste do novo participante inválido')
  // Desfazer apenas o progresso do patrocínio ganho pela vitória anulada.
  const sponsorRows=(await c.query(
   'SELECT jid,contract_id,progress,last_day,completed_at FROM gt_sponsor_contracts_alpha WHERE week_start=$1 AND last_day=$2 FOR UPDATE',
   [gtWeekStart(day),day]
  )).rows
  for(const contract of sponsorRows){
   if(contract.contract_id!=='turbo'||Number(contract.progress)!==1||
      Number(contract.completed_at)!==0||
      (previousWins.get(contract.jid)||0)!==1)
    throw Error('GT 16/11: patrocínio requer análise antes da correção')
   const reset=await c.query(
    'UPDATE gt_sponsor_contracts_alpha SET progress=0,last_day=NULL WHERE jid=$1 AND week_start=$2 AND progress=1 AND last_day=$3',
    [contract.jid,gtWeekStart(day),day]
   )
   if(reset.rowCount!==1)throw Error('GT 16/11: falha no ajuste do patrocinador')
  }
  const sponsors=await gtSponsorProgressInTx(c,{
   day,heats:revised.heats,participants,startedAt:s.startedAt
  })
  s.correction={
   id:mark,correctedAt:Date.now(),reason:'carro equipado com melhoria em curso foi excluído',
   originalResults:oldResults,originalParticipants:s.participants,
   deltas:[...deltas.values()],sponsors
  }
  s.participants=participants
  s.results={heats:revised.heats,standings:revised.standings}
  s.completedAt=Date.now()
  addNotice(s,'replay:2026-11-16',
   '⚠️ *GT ALPHA — RESULTADOS DE 16/11 ANULADOS E CORRIGIDOS*\n\n'+
   '🚘 Um carro equipado foi excluído indevidamente porque estava em melhoria.\n'+
   '✅ As 3 provas foram reclassificadas com *4 participantes*, mantendo os desempenhos já registrados e usando as melhorias concluídas na largada.\n\n'+
   rankText(revised.standings,'🏆 *CLASSIFICAÇÃO OFICIAL CORRIGIDA*')+
   '\n\n💰 Dinheiro, XP do piloto, XP do personagem, desgaste, vitórias e patrocínios conciliados pela diferença — sem prêmios duplicados.\n📊 !gttabela • !gttabela semana'
  )
 })
}

async function completedDays(week,c=db){
 const r=(await c.query('SELECT key,value FROM trevo_settings WHERE key BETWEEN $1 AND $2 ORDER BY key',[dayKey(week),dayKey(gtWeekEnd(week))])).rows
 return r.filter(x=>x.value?.phase==='completed').map(x=>x.value)
}
function sumWeek(days){
 const m=new Map()
 for(const d of days)for(const p of d.results?.standings||[]){
  const row=m.get(p.jid)||{jid:p.jid,name:p.name,points:0,wins:0,performance:0,days:0}
  row.name=p.name;row.points+=p.points;row.wins+=p.wins;row.performance+=p.performance;row.days++
  m.set(p.jid,row)
 }
 return gtLeaderboard([...m.values()])
}
async function settleWeek(sunday){
 // A estreia em 15/11 só inaugura o ranking; primeiro fechamento em 22/11.
 if(!gtDayIsSunday(sunday)||sunday<GT_FIRST_SEASON_END)return
 const last=await read(dayKey(sunday))
 if(!last||!['completed','cancelled'].includes(last.phase))return
 const week=gtWeekStart(sunday)
 await mutate(weekKey(week),async(s,c)=>{
  if(s.phase==='completed')return
  const table=sumWeek(await completedDays(week,c)),paid=[]
  if(table.length>=GT_MIN_DRIVERS)for(const [i,p] of table.slice(0,4).entries()){
   const amount=GT_WEEKLY_PRIZES[i]
   const r=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=$2 WHERE jid=$3',[amount,nowSec(),p.jid])
   if(r.rowCount!==1)throw Error('Carteira não encontrada para premiação GT')
   await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'gt_alpha_weekly',$3)",[p.jid,amount,weekKey(week)+':place:'+String(i+1)])
   paid.push({jid:p.jid,name:p.name,amount})
  }
  s.phase='completed';s.week=week;s.closedAt=Date.now();s.standings=table;s.payouts=paid
  addNotice(s,'weekly-result',paid.length?
   '🏆 *GT ALPHA BOT — RESULTADO SEMANAL*\n\n'+paid.map((p,i)=>
    (i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')+' '+gtCleanName(p.name)+' — *'+money(p.amount)+'*').join('\n')+
    '\n\n💰 Premiações depositadas nas carteiras.\n📊 *!gttabela semana*':
   '🏁 *GT ALPHA BOT — SEMANA ENCERRADA*\nSem dois pilotos com corrida válida. Nenhum prêmio creditado.')
 })
}
async function flush(key){
 if(!connected()||!socket?.sendMessage)return
 const s=await read(key)
 for(const n of (s?.noticeQueue||[]).filter(x=>!x.deliveredAt).slice(0,5)){
  let timeout
  try{
   const msg=await Promise.race([
    socket.sendMessage(GT_GROUP,{text:n.text}),
    new Promise((_,rej)=>{timeout=setTimeout(()=>rej(Error('timeout de envio')),8000);timeout.unref?.()})
   ])
   if(!msg?.key?.id)throw Error('WhatsApp sem confirmação de mensagem')
   await mutate(key,state=>{
    const found=state.noticeQueue?.find(x=>x.id===n.id)
    if(found&&!found.deliveredAt){found.deliveredAt=Date.now();found.messageId=msg.key.id}
   })
  }catch(e){console.warn('[GT] aviso pendente',n.id,e?.message||e);break}
  finally{if(timeout)clearTimeout(timeout)}
 }
}
async function tick(){
 if(busy)return
 busy=true
 try{
  const day=gtBrazilDay()
  if(day<FIRST_DAY)return
  const now=Date.now(),start=gtDayStartMs(day)
  // Polling intenso só perto do evento; fora disso, uma checagem a cada 30 minutos.
  const inWindow=now>=start-20*60000&&now<=start+40*60000
  if(!inWindow&&now-lastIdleSweep<30*60000)return
  if(!inWindow)lastIdleSweep=now
  if(now>=start-20*60000&&now<start)await prepNotice(day)
  if(now>=start){
   const s=await read(dayKey(day))
   if(!s || !s.phase || (s.phase==='running'&&now>=Number(s.nextAt)))await runDay(day)
  }
  await flush(dayKey(day))
  if(gtDayIsSunday(day)&&now>=start){
   const key=weekKey(gtWeekStart(day))
   const s=await read(key)
   if(s?.phase!=='completed')await settleWeek(day)
   await flush(key)
  }
  // Após reiniciar na segunda, recuperar liquidação dominical pendente.
  const prev=new Date(day+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()-1)
  const yesterday=prev.toISOString().slice(0,10)
  if(gtDayIsSunday(yesterday)){
   const key=weekKey(gtWeekStart(yesterday))
   const s=await read(key)
   if(s?.phase!=='completed')await settleWeek(yesterday)
   await flush(key)
  }
 }catch(e){console.error('[GT] erro no evento',e?.stack||e)}
 finally{busy=false}
}
export function startGtAlphaScheduler(sock,{isConnected=()=>true}={}){
 socket=sock;connected=isConnected
 if(timer||starting)return
 starting=true
 void initGtSponsors().then(async()=>{
  if(process.env.GT_ALPHA_REPLAY_20261116==='1'){
   try{await rematchGtAlpha20261116()}catch(err){console.error('[GT] replay 16/11 não aplicado',err?.stack||err)}
  }
  if(timer)return
  timer=setInterval(()=>void tick(),5000);timer.unref?.();void tick()
 }).catch(err=>console.error('[GT] falha ao preparar patrocínios; scheduler não ativado',err?.message||err))
 .finally(()=>{starting=false})
}
export async function getGtAlphaTable(scope='dia',now=Date.now()){
 const day=gtBrazilDay(now)
 if(scope==='semana'){
  const week=gtWeekStart(day),closed=await read(weekKey(week))
  const table=closed?.standings||sumWeek(await completedDays(week))
  return rankText(table,'🏆 *GT ALPHA BOT — RANKING SEMANAL*')+
   '\n📅 '+week+' a '+gtWeekEnd(week)+(closed?.phase==='completed'?'\n✅ Semana encerrada.':'\n⏰ Próxima etapa: 20h30.')
 }
 const s=await read(dayKey(day))
 if(!s?.phase){
  // Antes da primeira corrida de hoje, não há estado. Exibir a última
  // classificação concluída sem recalcular pontuação nem simular corridas.
  const previous=(await db.query(
   "SELECT key,value FROM trevo_settings WHERE key>=$1 AND key<$2 AND value->>'phase'='completed' ORDER BY key DESC LIMIT 1",
   [dayKey(FIRST_DAY),dayKey(day)]
  )).rows[0]
  if(previous?.value?.results?.standings?.length){
   const previousDay=previous.key.slice(DAY_PREFIX.length)
   return rankText(previous.value.results.standings,'🏎️ *GT ALPHA BOT — ÚLTIMO RANKING DIÁRIO*')+
    '\n📅 Etapa de '+previousDay+' (última concluída).'+
    '\n📅 Hoje: '+day+' • '+(now<gtDayStartMs(day)?'largada às 20h30.':'etapa ainda sem resultado registrado.')+
    '\n📊 Ranking acumulado: *!gttabela semana*.'
  }
 }
 const table=s?.phase==='completed'?s.results?.standings||[]:gtPartialStandings(s)
 return rankText(table,'🏎️ *GT ALPHA BOT — RANKING DIÁRIO*')+
  '\n📅 '+day+
  (s?.phase==='running'?'\n🏁 Corridas: '+s.stage+'/3':
   s?.phase==='completed'?'\n✅ Etapa encerrada.':
   s?.phase==='cancelled'?'\n⚠️ Etapa não disputada.':
   '\n⏰ Largada às 20h30 (Brasília).')
}
export async function getGtAlphaCar(jid){
 const r=(await db.query('SELECT c.id,c.model_id,c.condition,c.upgrades,c.pending_part,c.pending_until,p.xp FROM racing_cars_alpha c JOIN racing_profiles_alpha p ON p.jid=c.jid WHERE c.jid=$1 AND c.equipped=TRUE LIMIT 1',[jid])).rows[0]
 if(!r)return '🏎️ *GT ALPHA BOT*\nNenhum carro principal equipado. Use *!garagemcorrida* e *!equiparcorrida ID*.'
 return '🏎️ *CARRO PRINCIPAL — GT ALPHA*\n🚘 '+racingModel(r.model_id)?.name+' • ID '+r.id+
  '\n🔧 Preparação: '+racingTuning(r.upgrades)+'/42'+
  '\n👨‍✈️ Piloto Nv.'+racingDriverLevel(r.xp)+'\n❤️ Condição: '+r.condition+'/100\n'+
  (Number(r.condition)<RACING_MIN_CONDITION?'🔒 Reparo necessário.':
   r.pending_part&&Number(r.pending_until)>nowSec()?'✅ Apto: melhoria em andamento não impede a corrida. Peça nova ainda não conta.':'✅ Apto, se mantiver equipado até 20h30.')
}
export async function handleGtAlphaCommand({cmd,args=[],sender,reply,openSponsorFlow,closeSponsorFlow}){
 if(!['gttabela','gtcarro','gt','gtclima','gtpistas','gtpatrocinio'].includes(cmd))return false
 try{
  if(cmd==='gtcarro'){await reply(await getGtAlphaCar(sender));return true}
  if(cmd==='gtpatrocinio'){
   if(args[0]){
    const picked=await gtSponsorChoose(sender,args[0])
    closeSponsorFlow?.()
    await reply(gtSponsorConfirmedText(picked))
   }else{
    const menu=await gtSponsorText(sender,{withStatus:true})
    // Um menu aberto é individual por jogador e por conversa, com expiração em 5 min.
    if(menu.canChoose)openSponsorFlow?.()
    else closeSponsorFlow?.()
    await reply(menu.text)
   }
   return true
  }
  if(cmd==='gtclima'||cmd==='gtpistas'){
   const day=gtBrazilDay()
   await reply('🌦️ *GT ALPHA — PISTAS DE HOJE*\n📅 '+day+' • largada 20h30\n\n'+
    gtTrackProgram(day).map((t,i)=>(i+1)+'ª '+t.name+'\n'+GT_WEATHER_LABELS[t.weather]).join('\n\n')+
    '\n\n🔧 Pneus, freios e suspensão melhorados aumentam desempenho em condições difíceis.')
   return true
  }
  if(cmd==='gt'){await reply('🏎️ *GT ALPHA BOT*\n🕣 Corridas automáticas todos os dias às 20h30.\n🚘 Carro equipado participa mesmo durante melhorias.\n🏁 3 provas diárias, melhorias reais, pontos por colocação.\n📊 *!gttabela* • *!gttabela semana* • *!gtcarro*\n🌦️ *!gtclima* • 🤝 *!gtpatrocinio*\n🏆 Semanal: 1º R$15M, 2º R$8M, 3º R$5M, 4º R$1M.');return true}
  await reply(await getGtAlphaTable(String(args[0]||'').toLowerCase()==='semana'?'semana':'dia'))
 }catch(e){console.error('[GT] comando',e?.message||e);await reply('⚠️ GT Alpha indisponível. Tente novamente.')}
 return true
}
