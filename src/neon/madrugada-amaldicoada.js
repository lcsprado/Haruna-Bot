// Madrugada Amaldiçoada: edição global única, transacional e sem spam por ataque.
import {db,ensureUser,petMaxEnergy,petMaxHp} from './db.js'
import {madrugadaPower} from './madrugada-power.js'
import {halloweenAttackDue,halloweenNextAttackAt,halloweenOrderedAttackers} from './halloween-combat.js'
import {
 MADRUGADA_EVENT_ID,MADRUGADA_GROUP,MADRUGADA_START,MADRUGADA_END,MADRUGADA_HP,
 MADRUGADA_BOSS,MADRUGADA_PET_ID,MADRUGADA_PET_NAME,MADRUGADA_INSIGNIA_ID,
 MADRUGADA_SEAL_INTERVAL_MS,MADRUGADA_MAX_SEALS,madrugadaPhase,
 madrugadaRanking,madrugadaDamage
} from './madrugada-rules.js'

const fmt=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR')
const safeName=n=>String(n||'Jogador').replace(/[\r\n*_~]/g,' ').slice(0,70)
const seconds=()=>Math.floor(Date.now()/1000)
const SLEEP_MS=10000
let scheduler=null
let polling=false

async function transaction(fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  const result=await fn(c)
  await c.query('COMMIT')
  return result
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
export async function initMadrugada(){
 await db.query("CREATE TABLE IF NOT EXISTS madrugada_boss_20261031(id TEXT PRIMARY KEY,hp BIGINT NOT NULL,max_hp BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',updated_at BIGINT NOT NULL DEFAULT 0,finished_at BIGINT NOT NULL DEFAULT 0)")
 await db.query("INSERT INTO madrugada_boss_20261031(id,hp,max_hp,status,updated_at) VALUES($1,$2,$2,'scheduled',$3) ON CONFLICT(id) DO NOTHING",[MADRUGADA_EVENT_ID,MADRUGADA_HP,Date.now()])
 await db.query("CREATE TABLE IF NOT EXISTS madrugada_players_20261031(jid TEXT PRIMARY KEY REFERENCES users(jid),name TEXT NOT NULL,chat TEXT NOT NULL,damage BIGINT NOT NULL DEFAULT 0,seals INTEGER NOT NULL DEFAULT 0,attempts BIGINT NOT NULL DEFAULT 0,last_attack BIGINT NOT NULL DEFAULT 0,last_guard BIGINT NOT NULL DEFAULT 0,power INTEGER NOT NULL DEFAULT 0,speed INTEGER NOT NULL DEFAULT 100,crit REAL NOT NULL DEFAULT 0,updated_at BIGINT NOT NULL DEFAULT 0)")
 await db.query("CREATE TABLE IF NOT EXISTS madrugada_rewards_20261031(rank INTEGER PRIMARY KEY CHECK(rank IN (1,2)),jid TEXT NOT NULL UNIQUE REFERENCES users(jid),item_id TEXT NOT NULL,awarded_at BIGINT NOT NULL)")
 await db.query("INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,'special',0,'event',FALSE,FALSE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sellable=FALSE,stackable=FALSE",[
  MADRUGADA_INSIGNIA_ID,'🏅 Insígnia da Última Vigília','Vice-campeão da Madrugada Amaldiçoada: +2,5% dano e -1,5% dano recebido em Boss/Raid (sem PvP). Uma relíquia por vez.'
 ])
 console.log('[MADRUGADA] edição única preparada para 31/10 às 03:33 BRT, 3000000 HP')
}
async function award(c,rank,entry){
 if(!entry)return false
 const id=rank===1?MADRUGADA_PET_ID:MADRUGADA_INSIGNIA_ID
 const marker=await c.query('INSERT INTO madrugada_rewards_20261031(rank,jid,item_id,awarded_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING rank',[rank,entry.jid,id,seconds()])
 if(!marker.rowCount)return false
 if(rank===1){
  const energy=petMaxEnergy(1,id),hp=petMaxHp(1,0,id)
  const existing=await c.query('SELECT id FROM pet_collection WHERE species=$1 LIMIT 1 FOR UPDATE',[id])
  if(existing.rowCount)throw new Error('Cérbero já existe; impedindo entrega duplicada')
  await c.query('INSERT INTO pet_collection(jid,species,name,level,xp,energy,power,hp,max_hp,active,purchase_price) VALUES($1,$2,$3,1,0,$4,430,$5,$5,FALSE,0)',[entry.jid,id,MADRUGADA_PET_NAME,energy,hp])
 }else{
  await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[entry.jid,id])
 }
 return true
}
async function tickMadrugada(now=Date.now()){
 if(now<MADRUGADA_START)return {status:'scheduled'}
 return transaction(async c=>{
  const lock=await c.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok',[MADRUGADA_EVENT_ID])
  if(!lock.rows[0]?.ok)return {status:'busy'}
  const saved=(await c.query('SELECT * FROM madrugada_boss_20261031 WHERE id=$1 FOR UPDATE',[MADRUGADA_EVENT_ID])).rows[0]
  if(!saved)throw Error('Boss da Madrugada não inicializado')
  if(['defeated','expired'].includes(saved.status))return {status:saved.status}
  if(now>=MADRUGADA_END){
   await c.query("UPDATE madrugada_boss_20261031 SET status='expired',finished_at=$2,updated_at=$2 WHERE id=$1 AND status<>'defeated'",[MADRUGADA_EVENT_ID,now])
   console.log('[MADRUGADA] evento encerrado sem vitória',JSON.stringify({hp:saved.hp,maxHp:saved.max_hp}))
   return {status:'expired'}
  }
  if(saved.status==='scheduled'){
   await c.query("UPDATE madrugada_boss_20261031 SET status='active',updated_at=$2 WHERE id=$1",[MADRUGADA_EVENT_ID,now])
   console.log('[MADRUGADA] Boss ativado',JSON.stringify({hp:MADRUGADA_HP,end:MADRUGADA_END}))
  }
  const players=(await c.query('SELECT * FROM madrugada_players_20261031 ORDER BY jid FOR UPDATE')).rows
  const ordered=halloweenOrderedAttackers(players,now,1)
  const due=ordered.map(row=>({row,slots:halloweenAttackDue(now,row.last_attack,row.speed)}))
  let hp=Number(saved.hp)
  for(let pass=0;pass<2&&hp>0;pass++){
   for(const entry of due){
    if(hp<=0)break
    if(entry.slots.slots<=pass)continue
    const p=entry.row
    const st=(await c.query('SELECT hp FROM stats WHERE jid=$1',[p.jid])).rows[0]
    if(Number(st?.hp||0)<=0)continue
    const crit=Math.random()<Math.max(0,Math.min(.45,Number(p.crit)||0))
    const hit=Math.min(hp,madrugadaDamage(p.power,crit,.85+Math.random()*.30))
    hp-=hit
    const nextAttack=halloweenNextAttackAt(now,Number(p.last_attack||0),entry.slots.interval)
    p.last_attack=nextAttack
    await c.query('UPDATE madrugada_players_20261031 SET damage=damage+$2,attempts=attempts+1,last_attack=$3,updated_at=$4 WHERE jid=$1',[p.jid,hit,nextAttack,now])
   }
  }
  if(hp===0){
   await c.query("UPDATE madrugada_boss_20261031 SET hp=0,status='defeated',finished_at=$2,updated_at=$2 WHERE id=$1",[MADRUGADA_EVENT_ID,now])
   const rows=(await c.query('SELECT jid,name,damage,seals FROM madrugada_players_20261031 ORDER BY jid FOR UPDATE')).rows
   const ranking=madrugadaRanking(rows)
   await award(c,1,ranking[0])
   await award(c,2,ranking[1])
   console.log('[MADRUGADA] Boss derrotado e recompensas confirmadas',JSON.stringify({top:ranking.slice(0,2).map(p=>({name:p.name,damage:p.damage,score:p.score})),participants:rows.length}))
   return {status:'defeated'}
  }
  if(hp!==Number(saved.hp))await c.query('UPDATE madrugada_boss_20261031 SET hp=$2,updated_at=$3 WHERE id=$1',[MADRUGADA_EVENT_ID,hp,now])
  return {status:'active',hp}
 })
}
async function state(){
 const [b,r,p]=await Promise.all([
  db.query('SELECT hp,max_hp,status,finished_at FROM madrugada_boss_20261031 WHERE id=$1',[MADRUGADA_EVENT_ID]),
  db.query('SELECT jid,name,damage,seals FROM madrugada_players_20261031'),
  db.query('SELECT rank,jid,item_id FROM madrugada_rewards_20261031 ORDER BY rank')
 ])
 return {boss:b.rows[0],ranking:madrugadaRanking(r.rows),awards:p.rows}
}
function rankingText(ranking,limit=5){
 return ranking.slice(0,limit).map((r,i)=>
  (i===0?'🥇':i===1?'🥈':'🏅')+' '+safeName(r.name)+' — '+fmt(r.damage)+' dano • '+r.seals+' proteções • '+r.score.toFixed(1)+' pts'
 ).join('\n')||'Nenhum participante elegível ainda.'
}
const messages={
 ready:'🌑🔔 *MADRUGADA AMALDIÇOADA — EVENTO CONFIRMADO!*\n\n⏰ *Hoje às 03h33* (Brasília) • termina às *05h48*\n👹 *Vigia da Hora Morta* — ❤️ *3.000.000 HP*\n🌐 Boss global único • ataques automáticos ao entrar • pode derrotar solo.\n\n🥇 *CÉRBERO DAS 03:33* — pet lendário Guardião único no servidor, Poder 430.\n🥈 *INSÍGNIA DA ÚLTIMA VIGÍLIA* — +2,5% dano, -1,5% recebido em Boss/Raid (sem PvP).\n\n🏆 Pontuação: 70% dano + 30% proteções do Sino (a cada 10 min).\n⚔️ O Boss precisa cair até 05h48 para entregar os prêmios. Apenas Top 1 e Top 2 ganham.\n👉 Às 03h33, use *!madrugada entrar* • depois *!madrugada proteger*.\n⚠️ Não começa antes das 03h33.',
 start:'🌑🔔 *O SINO TOCOU — MADRUGADA AMALDIÇOADA!*\n\n👹 '+MADRUGADA_BOSS+'\n❤️ *3.000.000/3.000.000 HP* • Fim *05h48* (Brasília)\n🥇 Pet Guardião exclusivo Cérbero das 03:33\n🥈 Insígnia da Última Vigília\n\n⚔️ *!madrugada entrar* — combate automático a cada ~10s\n🛡️ *!madrugada proteger* — proteja o Sino a cada 10 min\n📊 *!madrugada ranking* — classificação atual\n🏆 70% dano e 30% proteções. Boss derrotado para liberar prêmios.'
}
async function notifyOnce(sock,key,message){
 const settingKey='madrugada_20261031_notice:'+key+':'+MADRUGADA_GROUP
 const now=Date.now()
 const claim=await db.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at WHERE ((trevo_settings.value->>'status'='failed' AND COALESCE((trevo_settings.value->>'retryAt')::bigint,0)<=$5) OR (trevo_settings.value->>'status'='sending' AND COALESCE((trevo_settings.value->>'claimedAt')::bigint,0)<=$4)) RETURNING key",[
  settingKey,JSON.stringify({status:'sending',claimedAt:now}),seconds(),now-60000,now
 ])
 if(!claim.rowCount)return false
 try{
  const sent=await sock.sendMessage(MADRUGADA_GROUP,{text:message})
  if(!sent?.key?.id)throw Error('WhatsApp não confirmou o envio')
  await db.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=$3 WHERE key=$1',[settingKey,JSON.stringify({status:'sent',sentAt:Date.now(),messageId:sent.key.id}),seconds()])
  console.log('[MADRUGADA] aviso confirmado no AlphaBot',JSON.stringify({key,messageId:sent.key.id}))
  return true
 }catch(error){
  console.error('[MADRUGADA] falha de aviso',key,error?.message||error)
  await db.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=$3 WHERE key=$1',[settingKey,JSON.stringify({status:'failed',retryAt:Date.now()+30000}),seconds()])
  return false
 }
}
async function poll(sock,isConnected){
 if(polling)return
 polling=true
 try{
  const now=Date.now()
  if(now>=MADRUGADA_START)await tickMadrugada(now)
  if(!isConnected())return
  if(now<MADRUGADA_START){
   await notifyOnce(sock,'ready',messages.ready)
   return
  }
  if(now<MADRUGADA_END)await notifyOnce(sock,'start',messages.start)
  const s=await state()
  if(s.boss?.status==='defeated'){
   const top=s.ranking
   const winner=top[0]?.name||'Nenhum'
   const runner=top[1]?.name||'Não houve'
   const notice='🌑🏆 *MADRUGADA AMALDIÇOADA — VITÓRIA!*\n\n✅ '+MADRUGADA_BOSS+' derrotado!\n\n'+rankingText(top,8)+
    '\n\n🐺 🥇 *'+safeName(winner)+'*: Cérbero das 03:33 creditado na coleção.\n🏅 🥈 *'+safeName(runner)+'*: '+(top[1]?'Insígnia da Última Vigília no inventário.':'Sem vice elegível.')+
    '\n🔒 Prêmios únicos, entrega transacional. Confira *!meuspets* ou *!reliquias*.'
   await notifyOnce(sock,'finish',notice)
  }else if(s.boss?.status==='expired'){
   await notifyOnce(sock,'finish','🌑🔔 *MADRUGADA AMALDIÇOADA ENCERRADA*\n\n⏰ O Sino silenciou às 05h48. O Vigia não foi derrotado (HP restante: '+fmt(s.boss.hp)+').\n🏁 '+rankingText(s.ranking,8)+'\n\n🔒 Sem pet ou insígnia: a vitória era obrigatória.')
  }
 }catch(error){console.error('[MADRUGADA] scheduler',String(error?.stack||error).slice(0,1000))}
 finally{polling=false}
}
export function scheduleMadrugada(sock,{isConnected=()=>true}={}){
 if(scheduler)return
 scheduler=setInterval(()=>{void poll(sock,isConnected)},SLEEP_MS)
 scheduler.unref?.()
 setTimeout(()=>{void poll(sock,isConnected)},3000).unref?.()
 console.log('[MADRUGADA] scheduler ativo, 10s; grupo AlphaBot, 03:33-05:48')
}
export async function handleMadrugadaCommand({cmd,args=[],sender,name,chat,reply}){
 if(!['madrugada','madrugadaamaldiçoada','madrugadaamaldicoada'].includes(cmd))return false
 const action=String(args[0]||'status').toLowerCase()
 if(action==='entrar'){
  if(chat!==MADRUGADA_GROUP){await reply('🌑 A Madrugada Amaldiçoada acontece apenas no grupo AlphaBot oficial.');return true}
  if(madrugadaPhase()!=='open'){await reply('🌑 O Vigia desperta às *03h33* e desaparece às *05h48*, horário de Brasília.');return true}
  await ensureUser(sender,name||'Jogador')
  const joined=await transaction(async c=>{
   const boss=(await c.query('SELECT status,hp FROM madrugada_boss_20261031 WHERE id=$1 FOR UPDATE',[MADRUGADA_EVENT_ID])).rows[0]
   if(boss?.status!=='active'||Number(boss.hp)<=0)throw Error('O combate não está aberto ou o Boss já foi derrotado.')
   const hpRow=(await c.query('SELECT hp FROM stats WHERE jid=$1',[sender])).rows[0]
   if(Number(hpRow?.hp||0)<=0)throw Error('Seu personagem está sem HP. Use !curar antes de entrar.')
   const existing=(await c.query('SELECT jid FROM madrugada_players_20261031 WHERE jid=$1',[sender])).rows[0]
   const snap=await madrugadaPower(c,sender)
   await c.query('INSERT INTO madrugada_players_20261031(jid,name,chat,power,speed,crit,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(jid) DO UPDATE SET name=EXCLUDED.name,power=EXCLUDED.power,speed=EXCLUDED.speed,crit=EXCLUDED.crit,updated_at=EXCLUDED.updated_at',[sender,safeName(name),chat,snap.power,snap.speed,snap.crit,Date.now()])
   return {already:Boolean(existing),power:snap.power,speed:snap.speed}
  })
  await reply('🌑⚔️ *'+(joined.already?'PARTICIPAÇÃO ATUALIZADA':'ENTROU NA MADRUGADA AMALDIÇOADA')+'!*\n💥 Poder: '+fmt(joined.power)+' • ⚡ VEL: '+fmt(joined.speed)+'\n🔁 Ataques automáticos enquanto o personagem tiver HP. Sem spam de comandos.\n🛡️ Use *!madrugada proteger* agora e a cada 10 minutos para pontuar no Sino.\n🏆 70% dano + 30% proteções • Fim às 05h48.')
  return true
 }
 if(action==='proteger'||action==='defender'){
  if(chat!==MADRUGADA_GROUP){await reply('🌑 A proteção do Sino só funciona no grupo AlphaBot.');return true}
  if(madrugadaPhase()!=='open'){await reply('🌑 A proteção só abre entre 03h33 e 05h48.');return true}
  const now=Date.now()
  const outcome=await transaction(async c=>{
   const boss=(await c.query('SELECT status FROM madrugada_boss_20261031 WHERE id=$1 FOR UPDATE',[MADRUGADA_EVENT_ID])).rows[0]
   if(boss?.status!=='active')return {error:'O combate não está ativo.'}
   const p=(await c.query('SELECT seals,last_guard FROM madrugada_players_20261031 WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
   if(!p)return {error:'Entre primeiro com !madrugada entrar.'}
   if(Number(p.seals)>=MADRUGADA_MAX_SEALS)return {error:'Você já protegeu o Sino todas as 14 vezes.'}
   const left=Number(p.last_guard||0)+MADRUGADA_SEAL_INTERVAL_MS-now
   if(left>0)return {error:'Aguarde '+Math.ceil(left/60000)+' min para proteger novamente.'}
   const v=Number(p.seals)+1
   await c.query('UPDATE madrugada_players_20261031 SET seals=$2,last_guard=$3,updated_at=$3 WHERE jid=$1',[sender,v,now])
   return {seals:v}
  })
  await reply(outcome.error?'⏳ '+outcome.error:'🛡️🔔 *SINO PROTEGIDO!* '+outcome.seals+'/'+MADRUGADA_MAX_SEALS+' proteções registradas. Até 30 pontos no ranking. Próxima em 10 min.')
  return true
 }
 if(action==='ranking'||action==='top'||action==='status'){
  const s=await state(),status=s.boss?.status||'scheduled'
  const phase=status==='defeated'?'✅ Derrotado':status==='expired'?'⏰ Encerrado':madrugadaPhase()==='scheduled'?'🕒 Começa às 03h33':'⚔️ Em andamento'
  const rank=s.ranking
  const user=rank.find(p=>p.jid===sender)
  await reply('🌑🔔 *MADRUGADA AMALDIÇOADA — '+phase+'*\n👹 '+MADRUGADA_BOSS+'\n❤️ '+fmt(s.boss?.hp??MADRUGADA_HP)+'/'+fmt(s.boss?.max_hp??MADRUGADA_HP)+' HP\n⏰ 03h33–05h48 • Boss único\n\n🏆 *RANKING (70% dano + 30% proteção)*\n'+rankingText(rank,8)+(user?'\n\n👤 Seu desempenho: '+fmt(user.damage)+' dano • '+user.seals+' proteções • '+user.score.toFixed(1)+' pts':'')+'\n\n🥇 Pet Cérbero das 03:33 • 🥈 Insígnia da Última Vigília\n⚔️ *!madrugada entrar* • 🛡️ *!madrugada proteger*')
  return true
 }
 await reply('🌑 Comandos: *!madrugada entrar*, *!madrugada proteger*, *!madrugada ranking*, *!madrugada status*.')
 return true
}