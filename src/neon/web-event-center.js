import {PECADOS_EDITIONS,PECADOS_BOSS_PHASES,PECADOS_ESSENCES_PER_PHASE,PECADOS_FULL_CLEAR_BONUS_ESSENCES,PECADOS_MIN_BOSS_DAMAGE,pecadosEditionCompletionBonus} from './sete-pecados-catalog.js'

// Vitrine de eventos do Web. Somente leitura: a lógica de caça e os prêmios
// continuam exclusivamente no serviço WhatsApp (mimic-hunt.js).
// Cronogramas de 24/10/2026 auditados nas fontes ativas do WhatsApp.
export const MIMIC_WEB_EVENT=Object.freeze({
  id:'mimic_legendario_20261024_v1',
  name:'Invasão dos Mimics',
  startsAt:Date.parse('2026-10-24T15:00:00-03:00'),
  endsAt:Date.parse('2026-10-24T17:00:00-03:00'),
  cooldownMs:120000,
  maxHunts:60,
  milestones:Object.freeze([
    {hunts:10,reward:'R$ 100.000 + 2 Caixas Raras'},
    {hunts:25,reward:'R$ 200.000 + 2 Caixas Épicas'},
    {hunts:45,reward:'R$ 350.000 + 1 Caixa Lendária'},
    {hunts:60,reward:'Título Caçador Lendário (cosmético)'}
  ]),
  prizes:Object.freeze([300000,200000,100000])
})
export const SATURDAY_WEB_EVENT=Object.freeze({
  id:'raid_saturday_hunt_20261024_v1',
  name:'Caçada de Sábado',
  startsAt:Date.parse('2026-10-24T19:00:00-03:00'),
  endsAt:Date.parse('2026-10-24T21:00:00-03:00'),
  levels:Object.freeze([50,60,65,70]),
  xpMultiplier:1.5
})
const MAX_DISPLAY_NAME=40
const cleanName=value=>String(value||'Caçador').replace(/[\r\n*_~<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,MAX_DISPLAY_NAME)||'Caçador'
const bounded=(v,max=1e10)=>Math.max(0,Math.min(max,Number(v)||0))
export function eventPhase(event,now=Date.now()){
  return now<event.startsAt?'upcoming':now<event.endsAt?'active':'finished'
}
export function normalizeMimicSnapshot(row,now=Date.now()){
  const mine=row?.mine&&typeof row.mine==='object'?row.mine:{}
  const leaders=Array.isArray(row?.leaders)?row.leaders:[]
  return {
    id:MIMIC_WEB_EVENT.id,
    name:MIMIC_WEB_EVENT.name,
    startsAt:MIMIC_WEB_EVENT.startsAt,
    endsAt:MIMIC_WEB_EVENT.endsAt,
    phase:eventPhase(MIMIC_WEB_EVENT,now),
    maxHunts:MIMIC_WEB_EVENT.maxHunts,
    cooldownMs:MIMIC_WEB_EVENT.cooldownMs,
    milestones:MIMIC_WEB_EVENT.milestones,
    prizes:MIMIC_WEB_EVENT.prizes,
    progress:{
      hunts:bounded(mine.hunts,60),
      points:bounded(mine.points),
      cash:bounded(mine.cash),
      xp:bounded(mine.xp),
      fragments:bounded(mine.fragments),
      rare:bounded(mine.rare),
      epic:bounded(mine.epic),
      golden:bounded(mine.golden),
      nextAt:bounded(mine.nextAt),
      rareTrades:bounded(mine.rareTrades,2),
      epicTrades:bounded(mine.epicTrades,2),
      rank:row?.position==null?null:bounded(row.position,1e6)
    },
    leaderboard:leaders.slice(0,10).map(entry=>({
      position:bounded(entry.position,1e3),
      name:cleanName(entry.name),
      points:bounded(entry.points),
      hunts:bounded(entry.hunts,60)
    })),
    prizesFinalized:Boolean(row?.finalized)
  }
}
export function buildSevenSinsSchedule(now=Date.now()){
  const phases=PECADOS_BOSS_PHASES.map(({id,name,hp,atk})=>({id,name,hp,atk}))
  return PECADOS_EDITIONS.map((edition,index)=>({
    id:edition.key,
    edition:index+1,
    startsAt:edition.start,
    endsAt:edition.end,
    phase:eventPhase({startsAt:edition.start,endsAt:edition.end},now),
    phases,
    totalHp:phases.reduce((sum,p)=>sum+p.hp,0),
    minimumDamage:PECADOS_MIN_BOSS_DAMAGE,
    essencesPerSin:PECADOS_ESSENCES_PER_PHASE,
    completionBonus:pecadosEditionCompletionBonus(edition.key),
    essencesTotal:(PECADOS_BOSS_PHASES.length-1)*PECADOS_ESSENCES_PER_PHASE+pecadosEditionCompletionBonus(edition.key),
    maxCollabBoxes:Math.floor(((PECADOS_BOSS_PHASES.length-1)*PECADOS_ESSENCES_PER_PHASE+pecadosEditionCompletionBonus(edition.key))/7),
    boss:null
  }))
}

export async function getWebEventCenter(db,jid,now=Date.now()){
  const event={sevenSins:buildSevenSinsSchedule(now),mimic:normalizeMimicSnapshot(null,now),saturdayRaid:{
    id:SATURDAY_WEB_EVENT.id,name:SATURDAY_WEB_EVENT.name,
    startsAt:SATURDAY_WEB_EVENT.startsAt,endsAt:SATURDAY_WEB_EVENT.endsAt,
    phase:eventPhase(SATURDAY_WEB_EVENT,now),
    levels:SATURDAY_WEB_EVENT.levels,
    xpMultiplier:SATURDAY_WEB_EVENT.xpMultiplier
  },generatedAt:now,readOnly:true}
  // Uma consulta indexada somente se alguma edição já iniciou. Nunca carrega
  // ledger, jogadores ou inventários; os agendamentos aparecem mesmo sem login no Boss.
  if(now>=PECADOS_EDITIONS[0].start&&now<PECADOS_EDITIONS[PECADOS_EDITIONS.length-1].end){
    try{
      const {rows}=await db.query(
        "SELECT state->>'scheduleKey' AS edition_key,state->>'name' AS boss_name,state->>'active' AS active,state->>'phaseIndex' AS phase_index,state->>'hp' AS hp,state->>'maxHp' AS max_hp,state->>'outcome' AS outcome FROM trevo_games WHERE chat_jid='__alpha_global_boss_event__' AND game_type='boss_event'"
      )
      const state=rows?.[0]
      const current=event.sevenSins.find(e=>e.id===state?.edition_key)
      if(current){
        current.boss={
          active:state.active==='true',
          phaseIndex:bounded(state.phase_index,7),
          name:String(state.boss_name||'').slice(0,100),
          hp:bounded(state.hp,100000000),
          maxHp:bounded(state.max_hp,100000000),
          outcome:String(state.outcome||'').slice(0,40)
        }
      }
    }catch(err){
      console.warn('[Web Event Center] Boss 7 Pecados indisponível',String(err?.code||err?.message||err).slice(0,130))
    }
  }
  // No tournament writes, no virtual inventory, no WhatsApp session.
  if(now<MIMIC_WEB_EVENT.startsAt)return event
  try{
    const result=await db.query(`
      WITH ranked AS (
        SELECT jid,state,
          ROW_NUMBER() OVER(
            ORDER BY COALESCE((state->>'points')::integer,0) DESC,
              COALESCE((state->>'hunts')::integer,0) DESC,
              COALESCE((state->>'lastAt')::bigint,0) ASC,jid ASC
          ) AS position
        FROM mimic_hunt_sessions
        WHERE event_key=$1 AND COALESCE((state->>'hunts')::integer,0)>0
      )
      SELECT
        (SELECT state FROM mimic_hunt_sessions WHERE event_key=$1 AND jid=$2) AS mine,
        (SELECT position FROM ranked WHERE jid=$2) AS position,
        (SELECT COALESCE(json_agg(json_build_object(
          'position',position,
          'name',left(COALESCE(state->>'name','Caçador'),40),
          'points',COALESCE((state->>'points')::integer,0),
          'hunts',COALESCE((state->>'hunts')::integer,0)
        ) ORDER BY position),'[]'::json)
        FROM (SELECT position,state FROM ranked ORDER BY position LIMIT 10) top10
        ) AS leaders,
        (SELECT value IS NOT NULL FROM trevo_settings WHERE key=$3) AS finalized
    `,[MIMIC_WEB_EVENT.id,jid,'mimic_final:'+MIMIC_WEB_EVENT.id])
    event.mimic=normalizeMimicSnapshot(result.rows?.[0]||null,now)
  }catch(error){
    // The WhatsApp job may not have created its table yet; event schedule is
    // still known, but a false empty ranking must not be shown as confirmed.
    event.mimic.unavailable=true
    console.warn('[Web Event Center] leitura Mimic indisponível',String(error?.code||error?.message||error).slice(0,130))
  }
  return event
}
