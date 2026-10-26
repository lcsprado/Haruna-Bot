// Sessões ativas de 60 minutos, a partir de 27/10/2026 em São Paulo.
// 26/10 permanece com combate contínuo como anunciado originalmente.
export const HALLOWEEN_HOURLY_START=Date.parse('2026-10-27T00:00:00-03:00')
export const HALLOWEEN_SESSION_MS=60*60*1000
export const HALLOWEEN_SESSION_REMINDER_MS=5*60*1000
export const HALLOWEEN_MAINTENANCE_MS=60*1000

export function halloweenHourlyEnabled(now=Date.now()){
 return Number(now)>=HALLOWEEN_HOURLY_START
}

export function halloweenSessionExpiry(now=Date.now()){
 return Number(now)+HALLOWEEN_SESSION_MS
}

export function halloweenSessionValid(player,now=Date.now(),day=''){
 if(!player?.active)return false
 if(!halloweenHourlyEnabled(now))return true
 return String(player.lease_day||'')===String(day||'') &&
  Number(player.lease_expires_at||0)>Number(now)
}

export function halloweenSessionTime(ms){
 if(!Number.isFinite(Number(ms))||Number(ms)<=0)return '--:--'
 return new Intl.DateTimeFormat('pt-BR',{
  timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(new Date(Number(ms)))
}

export function halloweenSessionRemaining(ms,now=Date.now()){
 const delta=Math.max(0,Number(ms||0)-Number(now))
 return Math.ceil(delta/60000)
}
