// Cofre das Sombras — evento leve e individual.
// Estado e pagamento transacionais. Não altera HP real nem processa ataques em timers.
import {randomInt} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,grantExpInTransaction} from './db.js'

export const COFRE_KEY='cofre_sombras_20261023_v1'
const DURATION=2*60*60*1000
const WAIT=5*60*1000
const MAX_ROOMS=8
const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const clock=ms=>new Date(Number(ms)).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})
const doors=['🛡️ Porta do Guardião','💎 Porta do Tesouro','💚 Porta do Santuário']
let ready=null,announceSocket=null
export async function initCofre(){
  if(!ready)ready=(async()=>{
    await db.query(`
      CREATE TABLE IF NOT EXISTS cofre_sombras_sessions (
        event_key TEXT NOT NULL,
        jid TEXT NOT NULL,
        state JSONB NOT NULL,
        updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        PRIMARY KEY(event_key,jid)
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS cofre_sombras_events (
        event_key TEXT PRIMARY KEY,
        starts_at BIGINT NOT NULL,
        ends_at BIGINT NOT NULL,
        groups JSONB NOT NULL DEFAULT '[]'::jsonb,
        announced JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `)
  })().catch(e=>{ready=null;throw e})
  await ready
}
async function eventState(){
 const {rows}=await db.query('SELECT * FROM cofre_sombras_events WHERE event_key=$1',[COFRE_KEY])
 return rows[0]
}
function expiry(e){return Date.now()>=Number(e.ends_at)}
function roomMenu(s,e){
 const n=Number(s.room)+1
 return '🗝️ *COFRE DAS SOMBRAS — SALA '+n+'/8*\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'❤️ HP de exploração: *'+fmt(s.hp)+'/'+fmt(s.maxHp)+'*\n'
  +'💰 Tesouro da etapa: *R$ '+fmt(s.cash)+'*\n'
  +'✨ XP da etapa: *'+fmt(s.xp)+'*\n'
  +'🔒 Já garantidos: *R$ '+fmt(s.savedCash)+'* e *'+fmt(s.savedXp)+' XP*\n'
  +'🚪 *Escolha sua porta:*\n'
  +'1️⃣ '+doors[0]+' — desafio e prêmio maior\n'
  +'2️⃣ '+doors[1]+' — chance de armadilha ou tesouro\n'
  +'3️⃣ '+doors[2]+' — cura, recompensa menor\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'🎮 *!explorar 1*, *!explorar 2* ou *!explorar 3*\n'
  +'📋 *!cofre* mostra o progresso.\n'
  +(s.room>0&&s.room%2===0?'🏦 *!cofre sair* garante seus prêmios e encerra a tentativa.\n':'')
  +'⏳ Evento até *'+clock(e.ends_at)+'* (Brasília).'
}
async function withPlayer(jid,work){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  // Serialize actions of this user, even when sent from different groups.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[COFRE_KEY+'|'+jid])
  const r=(await c.query('SELECT state FROM cofre_sombras_sessions WHERE event_key=$1 AND jid=$2 FOR UPDATE',[COFRE_KEY,jid])).rows[0]
  const old=r?.state||null
  const result=await work(c,old)
  if(result?.state){
   await c.query(`
     INSERT INTO cofre_sombras_sessions(event_key,jid,state,updated_at)
     VALUES($1,$2,$3::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
     ON CONFLICT(event_key,jid) DO UPDATE SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at
   `,[COFRE_KEY,jid,JSON.stringify(result.state)])
  }
  await c.query('COMMIT')
  return result.text
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
async function settle(c,jid,s){
 const cash=Number(s.savedCash||0),xp=Number(s.savedXp||0)
 if(cash>0)await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2',[cash,jid])
 if(xp>0)await grantExpInTransaction(c,jid,xp,{ignoreGroupProgressionEvent:true})
 return {cash,xp}
}
function elapsed(ms){return Math.max(1,Math.ceil(ms/60000))}
export async function handleCofreCommand({cmd,args,sender,chat,isGroup,reply}){
 if(!['cofre','explorar'].includes(cmd))return false
 if(!isGroup){await reply('🗝️ *COFRE DAS SOMBRAS*\nEste evento acontece nos grupos.');return true}
 await initCofre()
 const e=await eventState()
 if(!e){await reply('🗝️ O Cofre das Sombras ainda não está disponível.');return true}
 if(!e.groups.includes(chat)){await reply('🔒 Este grupo não participa desta edição do Cofre.');return true}
 try{
 const message=await withPlayer(sender,async(c,old)=>{
  const now=Date.now()
  if(!old){
   if(now<Number(e.starts_at)||expiry(e))return {text:'🗝️ Esta edição do Cofre das Sombras já terminou.'}
   if(cmd==='explorar'&&args?.length)return {text:'🗝️ Comece com *!cofre* para abrir sua exploração.'}
   const stat=(await c.query('SELECT hp,max_hp,atk,def FROM stats WHERE jid=$1',[sender])).rows[0]
   if(!stat)return {text:'❌ Seu personagem não possui atributos de RPG cadastrados.'}
   const hp=Math.max(100,Math.min(Number(stat.max_hp)||100,Number(stat.hp)||0))
   if(Number(stat.hp)<=0)return {text:'❤️ Recupere seu HP no RPG antes de começar a exploração.'}
   const s={phase:'active',room:0,hp,maxHp:Math.max(100,Number(stat.max_hp)||100),cash:0,xp:0,savedCash:0,savedXp:0,readyAt:0,atk:Number(stat.atk)||10,def:Number(stat.def)||5}
   return {state:s,text:'🗝️ *SUA EXPLORAÇÃO COMEÇOU!*\n⚠️ Uma tentativa por jogador neste evento. O HP de exploração é independente do HP normal.\n\n'+roomMenu(s,e)}
  }
  if(old.phase!=='active')return {text:'🏁 *COFRE DAS SOMBRAS — PARTICIPAÇÃO ENCERRADA*\n'+(old.reason||'Tentativa finalizada.')+'\n💰 Recebido: *R$ '+fmt(old.savedCash)+'*\n✨ XP recebido: *'+fmt(old.savedXp)+'*\n✅ Uma tentativa por jogador.'}
  if(expiry(e)){
   // Expiration settles only already secured checkpoints, no extra awards.
   const s={...old,phase:'completed',reason:'Tempo do evento encerrado.'}
   await settle(c,sender,s)
   return {state:s,text:'⏰ *O COFRE DAS SOMBRAS FECHOU!*\n💰 Prêmio dos checkpoints: *R$ '+fmt(s.savedCash)+'*\n✨ XP: *'+fmt(s.savedXp)+'*\nOs tesouros não guardados ficaram nas sombras.'}
  }
  if(cmd==='cofre'&&['sair','retirar','parar'].includes(String(args?.[0]||'').toLowerCase())){
   if(old.room===0||old.room%2!==0)return {text:'🔐 Você só pode sair com os prêmios nos checkpoints das salas 2, 4 e 6, ou concluir a sala 8.\n\n'+roomMenu(old,e)}
   const s={...old,phase:'completed',reason:'Retirada voluntária no checkpoint.'}
   await settle(c,sender,s)
   return {state:s,text:'🏦 *TESOURO GARANTIDO!*\n━━━━━━━━━━━━━━━━━━\n💰 *R$ '+fmt(s.savedCash)+'*\n✨ *'+fmt(s.savedXp)+' XP*\n✅ Tentativa encerrada com segurança. Parabéns!'}
  }
  if(cmd==='cofre'||!args?.length)return {text:roomMenu(old,e)}
  const choice=Number(args[0])
  if(!Number.isInteger(choice)||choice<1||choice>3)return {text:'❌ Escolha uma porta válida: *!explorar 1*, *!explorar 2* ou *!explorar 3*.'}
  if(now<Number(old.readyAt||0))return {text:'⏳ *PORTA AINDA FECHADA*\nFaltam *'+elapsed(old.readyAt-now)+' minuto(s)* para a próxima sala.\nEnquanto isso, você pode jogar normalmente.'}
  if(old.room>=MAX_ROOMS)return {text:'🏁 Você já concluiu todas as salas.'}
  const room=old.room+1
  // Stronger later floors, but survival possible with good choice-making.
  const strength=Math.max(0,Number(old.atk)+Number(old.def)*0.65)
  const stage=room*room
  const hazard=choice===1?Math.max(50,Math.round((65+room*85+stage*4)*1.6-strength*.22))
             :choice===2?(randomInt(100)<45?Math.max(35,Math.round(100+room*100-strength*.2)):0)
             :Math.max(0,Math.round(38+room*35-strength*.13))
  const recovery=choice===3?Math.max(100,Math.floor(old.maxHp*.24)):0
  const hp=Math.max(0,Math.min(old.maxHp,old.hp-hazard+recovery))
  const rand=choice===2?randomInt(100):0
  const gainCash=choice===1?15000:choice===2?(rand<35?17000:rand<70?13000:5000):8000
  const gainXp=choice===1?1500:choice===2?(rand<35?1700:rand<70?1300:600):800
  // Hard caps (8 rooms): max 136k / 13.6k, ensure overall 120k/12k.
  const totalCash=Math.min(120000,old.savedCash+old.cash+gainCash)
  const totalXp=Math.min(12000,old.savedXp+old.xp+gainXp)
  const s={...old,room,hp,cash:Math.max(0,totalCash-old.savedCash),xp:Math.max(0,totalXp-old.savedXp),readyAt:now+WAIT}
  let prefix=choice===1?'⚔️ *O GUARDIÃO ATACOU!*':choice===2?(hazard>0?'💎 *TESOURO ARMADILHADO!*':'💎 *BAÚ ESCONDIDO!*'):'💚 *SANTUÁRIO ENCONTRADO!*'
  let report='🗝️ *COFRE DAS SOMBRAS — SALA '+room+'/8*\n━━━━━━━━━━━━━━━━━━\n'+prefix+
    '\n❤️ Dano sofrido: *-'+fmt(hazard)+' HP*'+(recovery?'\n💚 Cura do santuário: *+'+fmt(recovery)+' HP*':'')+
    '\n❤️ HP restante: *'+fmt(hp)+'/'+fmt(s.maxHp)+'*'
  if(hp<=0){
   s.phase='completed';s.reason='Derrotado na sala '+room+'.'
   await settle(c,sender,s)
   return {state:s,text:report+'\n\n💀 *VOCÊ FOI DERROTADO!*\n🔐 Perdeu o tesouro da etapa atual.\n🏦 Checkpoints recebidos: *R$ '+fmt(s.savedCash)+'* e *'+fmt(s.savedXp)+' XP*\n🛡️ Seu HP normal foi preservado.'}
  }
  report+='\n💰 Tesouro encontrado: *R$ '+fmt(gainCash)+'*\n✨ XP encontrado: *'+fmt(gainXp)+'*\n'
  if(room%2===0){
   s.savedCash+=s.cash;s.savedXp+=s.xp;s.cash=0;s.xp=0
   report+='\n🏦 *CHECKPOINT '+room+'/8 — PRÊMIOS PROTEGIDOS!*\n💰 Acumulado seguro: *R$ '+fmt(s.savedCash)+'*\n✨ XP seguro: *'+fmt(s.savedXp)+'*\n'
  }else report+='\n⚠️ Prêmios desta etapa ainda não estão protegidos.\n'
  if(room===MAX_ROOMS){
   s.phase='completed';s.reason='Concluiu as oito salas!'
   await settle(c,sender,s)
   return {state:s,text:report+'\n🏆 *COFRE CONQUISTADO!*\n💰 *R$ '+fmt(s.savedCash)+'* creditados.\n✨ *'+fmt(s.savedXp)+' XP* creditados.\n🌑 Parabéns por sobreviver às oito salas!'}
  }
  return {state:s,text:report+'\n⏳ Próxima porta em *5 minutos*.\n'+(room%2===0?'🏦 Use *!cofre sair* para retirar com segurança.\n':'')+'🎮 Depois use *!explorar 1/2/3* ou *!cofre*.'}
 })
 await reply(message)
 }catch(err){
  console.error('[COFRE SOMBRAS]',String(err?.message||err).slice(0,180))
  await reply('⚠️ O Cofre não conseguiu processar esta ação. Nenhum prêmio foi repetido. Consulte *!cofre* para verificar seu progresso.')
 }
 return true
}
export async function startCofreEvent(sock){
 await initCofre()
 announceSocket=sock
 const groups=[...new Set((await listGroupLicenses(500)).filter(groupLicenseIsActive).map(x=>x.chat_jid).filter(x=>String(x).endsWith('@g.us')))]
 if(!groups.length){console.warn('[COFRE] sem grupos licenciados');return}
 const {rows}=await db.query(`
 INSERT INTO cofre_sombras_events(event_key,starts_at,ends_at,groups)
 VALUES($1,$2,$3,$4::jsonb)
 ON CONFLICT(event_key) DO NOTHING RETURNING event_key
 `,[COFRE_KEY,Date.now(),Date.now()+DURATION,JSON.stringify(groups)])
 const event=await eventState()
 if(!event || expiry(event))return
 // One-time announcements tracked per group to avoid flooding on reconnect.
 for(const group of event.groups){
  const claim=await db.query(`
    UPDATE cofre_sombras_events SET announced=announced || to_jsonb($2::text)
    WHERE event_key=$1 AND NOT (announced ? $2) RETURNING event_key
  `,[COFRE_KEY,group])
  if(!claim.rowCount)continue
  try{
   await sock.sendMessage(group,{text:'🗝️🌑 *EVENTO — COFRE DAS SOMBRAS!*\n━━━━━━━━━━━━━━━━━━\n'
     +'🚪 *8 salas* e 3 portas por escolha.\n'
     +'💰 Até *R$ 120.000* e ✨ *12.000 XP*.\n'
     +'🛡️ Solo e disponível nos grupos participantes.\n'
     +'🏦 Checkpoints a cada 2 salas: saia com o prêmio ou arrisque continuar.\n'
     +'❤️ HP próprio do evento; não altera o HP normal.\n'
     +'⏳ 5 minutos entre salas. Apenas uma tentativa.\n'
     +'🕒 Encerra às *'+clock(event.ends_at)+'* (Brasília).\n'
     +'🎮 *Digite !cofre para começar!*\n━━━━━━━━━━━━━━━━━━\n'
     +'📢 *Evento temporário — sem Boss automático.*'})
   console.log('[COFRE] anuncio enviado',{groupCount:groups.length})
  }catch(err){console.warn('[COFRE] anuncio falhou',String(err?.message||err).slice(0,130))}
 }
}
