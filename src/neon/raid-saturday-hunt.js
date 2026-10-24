// Caçada de Sábado 24/10/2026. Sem timers recorrentes.
import {db,listGroupLicenses,groupLicenseIsActive} from './db.js'
export const SATURDAY_HUNT=Object.freeze({
  id:'raid_saturday_hunt_20261024_v1',
  startsAt:Date.parse('2026-10-24T19:00:00-03:00'),
  endsAt:Date.parse('2026-10-24T21:00:00-03:00'),
  levels:Object.freeze([50,60,65,70]),multiplier:1.5
})
export function saturdayRaidXpMultiplier(level,completedAt=Date.now()){
  const now=Number(completedAt)
  if(!Number.isFinite(now)||now<SATURDAY_HUNT.startsAt||now>=SATURDAY_HUNT.endsAt)return 1
  return SATURDAY_HUNT.levels.includes(Number(level))?SATURDAY_HUNT.multiplier:1
}
const OPEN='⚔️✨ *CAÇADA DE SÁBADO — ATIVA!*\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'🔥 *+50% XP do jogador* nas *Raids 50, 60, 65 e 70*.\n'
  +'🕖 *Hoje, das 19h às 21h* (Brasília).\n'
  +'✅ Vale para Raids *vencidas e concluídas dentro do horário*.\n'
  +'💰 Dinheiro: normal\n🐾 XP dos pets: normal\n'
  +'🧩 Materiais, caixas e equipamentos: sem alteração\n'
  +'🛡️ Não acumula com outro bônus temporário de XP de Raid.\n'
  +'👥 Chame seu time e use *!raid*!\n'
  +'━━━━━━━━━━━━━━━━━━'
const END='🏁✨ *CAÇADA DE SÁBADO — ENCERRADA!*\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'🕘 O bônus de *+50% XP* terminou às *21h* (Brasília).\n'
  +'⚔️ As Raids seguem funcionando normalmente, sem o bônus do evento.\n'
  +'💰 Dinheiro, materiais e drops permaneceram normais.\n'
  +'Obrigado pela participação!'
let timers=[],sending=false
async function announce(sock,phase){
  const now=Date.now()
  if(sending||!sock?.sendMessage)return
  if(phase==='start'&&(now<SATURDAY_HUNT.startsAt||now>=SATURDAY_HUNT.endsAt))return
  if(phase==='end'&&(now<SATURDAY_HUNT.endsAt||now>SATURDAY_HUNT.endsAt+20*60000))return
  sending=true
  try{
    const groups=(await listGroupLicenses(500))
      .filter(groupLicenseIsActive).filter(g=>String(g.chat_jid||'').endsWith('@g.us'))
    let sent=0,already=0,failed=0
    for(const g of groups){
      const key='scheduled_notice:'+SATURDAY_HUNT.id+':'+phase+':'+g.chat_jid
      try{
        const recorded=await db.query('SELECT 1 FROM trevo_settings WHERE key=$1',[key])
        if(recorded.rowCount){already++;continue}
        // Registrar somente depois do envio bem-sucedido. Reconnect retenta falhas.
        await sock.sendMessage(g.chat_jid,{text:phase==='start'?OPEN:END})
        await db.query(
          'INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO NOTHING',
          [key,JSON.stringify({event:SATURDAY_HUNT.id,phase,sentAt:Date.now()})]
        )
        sent++
      }catch(e){
        failed++
        console.warn('[CAÇADA SÁBADO] envio',phase,String(e?.message||e).slice(0,160))
      }
    }
    console.log('[CAÇADA SÁBADO] notificações',JSON.stringify({phase,groups:groups.length,sent,already,failed}))
  }catch(e){console.error('[CAÇADA SÁBADO] agendamento',String(e?.message||e).slice(0,160))}
  finally{sending=false}
}
export function scheduleSaturdayRaidHunt(sock){
  for(const t of timers)clearTimeout(t)
  timers=[]
  const now=Date.now()
  if(now>SATURDAY_HUNT.endsAt+20*60000)return
  const once=(at,phase)=>{
    if(at<=now){void announce(sock,phase);return}
    const t=setTimeout(()=>{void announce(sock,phase)},at-now+150)
    t.unref?.()
    timers.push(t)
  }
  if(now<SATURDAY_HUNT.endsAt)once(SATURDAY_HUNT.startsAt,'start')
  once(SATURDAY_HUNT.endsAt,'end')
  console.log('[CAÇADA SÁBADO] programada 19h–21h; Raid 50/60/65/70; +50% XP jogador')
}