// Central de Eventos do Owner — somente o roteador !admin pode alterar estados.
// As recompensas consultam o banco no momento da ação, sem timers de polling.
import {db} from './db.js'

export const OWNER_EVENT_TYPES=Object.freeze({
  xp:{label:'✨ XP do Jogador',max:3,defaultMinutes:20},
  pet:{label:'🐾 XP dos Pets',max:3,defaultMinutes:20},
  dinheiro:{label:'💰 Dinheiro',max:2,defaultMinutes:20},
  corre:{label:'🚗🍔 Hora do Corre',max:2,defaultMinutes:20},
  sorte:{label:'🍀 Sorte nas Caixas',max:2,defaultMinutes:20},
  raid:{label:'⚔️ XP de Raid e Pets',max:2,defaultMinutes:30},
  drop:{label:'🎁 Drops nas Raids',max:2,defaultMinutes:30},
  fragmentos:{label:'🧩 Fragmentos nas Raids',max:2,defaultMinutes:30}
})
const prefix='owner_event_center:'
const keys=Object.keys(OWNER_EVENT_TYPES)
const valueKey=type=>prefix+type
const brazilClock=timestamp=>new Date(timestamp).toLocaleString('pt-BR',{
  timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
})
function validType(type){
  const normalized=String(type||'').toLowerCase()
  if(!Object.hasOwn(OWNER_EVENT_TYPES,normalized))throw new Error('Tipo de evento inválido. Use !eventoadm para listar as opções.')
  return normalized
}
function windowState(type,value,now=Date.now()){
  const v=value||{}
  const startsAt=Number(v.startsAt||0),endsAt=Number(v.endsAt||0)
  const valid=Number.isFinite(startsAt)&&Number.isFinite(endsAt)&&startsAt>0&&endsAt>startsAt
  return {type,...OWNER_EVENT_TYPES[type],startsAt,endsAt,
    multiplier:Math.max(1,Number(v.multiplier||1)),
    active:valid&&startsAt<=now&&now<endsAt,
    scheduled:valid&&startsAt>now,
    remainingMs:Math.max(0,endsAt-now),
    id:String(v.id||''),raw:v}
}
export async function getOwnerEventMultiplier(queryable=db,type){
  type=validType(type)
  const {rows}=await queryable.query('SELECT value FROM trevo_settings WHERE key=$1',[valueKey(type)])
  const state=windowState(type,rows[0]?.value)
  return state.active?Math.min(state.max,state.multiplier):1
}
export async function getOwnerEvent(type){
  type=validType(type)
  const {rows}=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[valueKey(type)])
  return windowState(type,rows[0]?.value)
}
export async function listOwnerEvents(){
  const {rows}=await db.query('SELECT key,value FROM trevo_settings WHERE key LIKE $1',[prefix+'%'])
  const byKey=new Map(rows.map(r=>[r.key,r.value]))
  return keys.map(type=>windowState(type,byKey.get(valueKey(type))))
}
export function parseOwnerEventBrazilDate(dateText,timeText){
  const d=/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/.exec(String(dateText||''))
  const t=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeText||''))
  if(!d||!t)throw new Error('Data/hora inválida. Exemplo: 27/10 19:00 ou 27/10/2026 19:00.')
  const nowLocal=new Date(Date.now()-3*3600000)
  const year=Number(d[3]||nowLocal.getUTCFullYear())
  const month=Number(d[2]),day=Number(d[1]),hour=Number(t[1]),minute=Number(t[2])
  const utc=Date.UTC(year,month-1,day,hour+3,minute)
  const check=new Date(utc-3*3600000)
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day||
     check.getUTCHours()!==hour||check.getUTCMinutes()!==minute)throw new Error('Data inválida no calendário.')
  if(utc<Date.now()-60000||utc>Date.now()+30*86400000)throw new Error('Agende de agora até 30 dias à frente.')
  return utc
}
export async function setOwnerEvent(type,{minutes,multiplier=2,startsAt=Date.now(),owner='owner'}={}){
  type=validType(type)
  const def=OWNER_EVENT_TYPES[type]
  minutes=Number(minutes??def.defaultMinutes)
  multiplier=Number(multiplier)
  startsAt=Number(startsAt)
  if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error('Duração permitida: 1 a 180 minutos.')
  if(!Number.isFinite(multiplier)||multiplier<=1||multiplier>def.max)throw new Error('Multiplicador permitido para '+def.label+': acima de 1 até '+def.max+'x.')
  if(!Number.isFinite(startsAt)||startsAt<Date.now()-60000||startsAt>Date.now()+30*86400000)throw new Error('Horário inválido (limite: 30 dias).')
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[valueKey(type)])
    const existing=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',[valueKey(type)])).rows[0]?.value
    const current=windowState(type,existing)
    if(current.active||current.scheduled)throw new Error('Já existe '+def.label+' ativo/agendado. Encerre ou cancele antes de criar outro.')
    const id=type+':'+startsAt+':'+Math.floor(Math.random()*1000000)
    const raw={id,startsAt,endsAt:startsAt+minutes*60000,multiplier,owner:String(owner).slice(0,100),createdAt:Date.now()}
    await c.query(`INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
      [valueKey(type),JSON.stringify(raw)])
    await c.query('COMMIT')
    return windowState(type,raw)
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
  finally{c.release()}
}
export async function stopOwnerEvent(type,owner='owner'){
  type=validType(type)
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[valueKey(type)])
    const current=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[valueKey(type)])).rows[0]?.value
    if(!current||Number(current.endsAt||0)<=Date.now()) {await c.query('COMMIT');return {stopped:false}}
    const raw={...current,endsAt:Date.now(),cancelledAt:Date.now(),cancelledBy:String(owner).slice(0,100)}
    // Cancelamentos antes do início não podem criar uma janela invertida.
    if(Number(raw.startsAt)>raw.endsAt)raw.startsAt=raw.endsAt
    await c.query('UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key=$1',
      [valueKey(type),JSON.stringify(raw)])
    await c.query('COMMIT')
    return {stopped:true,state:windowState(type,raw)}
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
  finally{c.release()}
}
export function ownerEventsStatusText(events){
  const now=Date.now()
  const active=events.filter(e=>e.active)
  const planned=events.filter(e=>e.scheduled)
  if(!active.length&&!planned.length)return '📊 *CENTRAL DE EVENTOS*\n\nNenhum evento ativo ou agendado.'
  const lines=['📊 *CENTRAL DE EVENTOS*']
  if(active.length)lines.push('\n🟢 *ATIVOS*',...active.map(e=>e.label+' • *'+e.multiplier+'x* • termina '+brazilClock(e.endsAt)+' • '+Math.max(1,Math.ceil((e.endsAt-now)/60000))+' min'))
  if(planned.length)lines.push('\n📅 *AGENDADOS*',...planned.map(e=>e.label+' • *'+e.multiplier+'x* • '+brazilClock(e.startsAt)+' • '+Math.round((e.endsAt-e.startsAt)/60000)+' min'))
  return lines.join('\n')
}
export async function announceOwnerEventTransitions(send){
  const events=await listOwnerEvents()
  const now=Date.now()
  for(const event of events){
    if(!event.id||!event.startsAt||!event.endsAt)continue
    const startDue=event.active&&!event.raw.announcedStart
    const endDue=event.raw.announcedStart&&!event.raw.announcedEnd&&now>=event.endsAt&&now<=event.endsAt+10*60000
    const phase=startDue?'start':endDue?'end':null
    if(!phase)continue
    // Reserva atômica: evita aviso duplicado quando há reconexões/schedulers concorrentes.
    const flag=phase==='start'?'announcedStart':'announcedEnd'
    const claimed=await db.query(`UPDATE trevo_settings
      SET value=jsonb_set(value,$2::text[],'true'::jsonb,true),updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE key=$1 AND value->>'id'=$3 AND COALESCE(value->>$4,'false')='false' RETURNING key`,
      [valueKey(event.type),[flag],event.id,flag])
    if(!claimed.rowCount)continue
    const msg=phase==='start'
      ?'🎪 *EVENTO ATIVADO!*\n\n'+event.label+' • *'+event.multiplier+'x*\n⏳ Até '+brazilClock(event.endsAt)+' (Brasília).\n📊 Consulte !evento para acompanhar.'
      :'🏁 *EVENTO ENCERRADO!*\n\n'+event.label+' retornou aos valores normais.'
    try{await send(msg)}catch(err){console.error('[Eventos Owner] falha no anúncio',event.type,err?.message||err)}
  }
}
export function ownerEventNextTransitions(events){
  const now=Date.now()
  return [...new Set(events.flatMap(e=>e.id?[
    e.scheduled?e.startsAt+500:0,
    e.endsAt>now?e.endsAt+500:0
  ]:[]).filter(v=>v>now&&v<=now+30*86400000))].sort((a,b)=>a-b)
}
