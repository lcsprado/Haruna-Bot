// V2-only event. Fixed allowances avoid a global hot row in combat transactions.
// Eligible roster and total extra XP are frozen at scheduling; no legacy keys.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_PET_EVENT_KEY='owner_event_v2:pet'
export const V2_PET_EVENT_BUDGET_PREFIX='owner_event_v2:pet:budget:'
export const V2_PET_EVENT_EXTRA_PER_PLAYER=1000
export const V2_PET_EVENT_MAX_MULTIPLIER=2
// Separate allowances for each V2 category. All values are EXTRA rewards
// except chance-based events, which reserve a finite number of boosted rolls.
export const V2_OWNER_EVENT_POLICIES=Object.freeze({
  xp:{max:3,budget:10000,unit:'EXP extra',scope:'Dungeon e Raids/Boss manuais'},
  pet:{max:2,budget:1000,unit:'EXP de pet extra',scope:'Atividades manuais de pets, Raids e Boss'},
  dinheiro:{max:2,budget:10000,unit:'R$ extras',scope:'Trabalho, Dungeon, Uber/iFood manuais e lucro de Raid manual'},
  corre:{max:2,budget:10000,unit:'R$ brutos extras',scope:'Uber e iFood manuais'},
  sorte:{max:2,budget:20,unit:'caixas com chance aumentada',scope:'Abertura de caixas'},
  raid:{max:2,budget:10000,petBudget:1000,unit:'EXP extra + até 1.000 EXP de pet extra',scope:'Raids manuais'},
  drop:{max:2,budget:10,unit:'liquidações de Raid com chance aumentada',scope:'Caixas e equipamentos diretos de Raids manuais'},
  fragmentos:{max:2,budget:50,unit:'fragmentos extras',scope:'Raids manuais'}
})
export const v2OwnerEventKey=type=>'owner_event_v2:'+type
const allowanceKey=(type,jid,pet=false)=>v2OwnerEventKey(type)+':budget:'+(pet?'pet:':'')+jid
export async function provisionV2OwnerEventBudgets(c,type,eventId){
  const policy=V2_OWNER_EVENT_POLICIES[type]
  if(!policy)throw Error('Tipo de evento V2 inválido')
  const provision=async(prefix,budget)=>c.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    SELECT $1||u.jid,jsonb_build_object('eventId',$2::text,'remaining',$3::int),EXTRACT(EPOCH FROM NOW())::bigint
    FROM users u JOIN stats s ON s.jid=u.jid
    WHERE s.class_applied=TRUE ORDER BY u.jid
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[prefix,eventId,budget])
  const r=await provision(allowanceKey(type,''),policy.budget)
  if(policy.petBudget)await provision(allowanceKey(type,'',true),policy.petBudget)
  return Number(r.rowCount||0)
}
export async function applyV2OwnerEvent(c,jid,types,base,{pet=false,limit=2147483647,now=Date.now(),enabled=classesOnlyRebootEnabled(),roll=false,incomeFloor=base}={}){
  if(!enabled||!Number.isSafeInteger(base)||base<=0||limit<=0)return roll?1:base
  // In income activities, use the larger of the level reward and the budgeted event reward.
  const floor=roll?base:Math.max(base,Number.isSafeInteger(incomeFloor)?incomeFloor:base)
  const levelExtra=floor-base
  const entries=[...new Set(types)].filter(t=>Object.hasOwn(V2_OWNER_EVENT_POLICIES,t))
  if(!entries.length)return roll?1:floor
  const candidates=await c.query(`
    SELECT b.key,b.value,(b.value->>'remaining')::int AS remaining,
      LEAST(p.max_multiplier,(e.value->>'multiplier')::numeric) AS multiplier
    FROM unnest($1::text[],$2::text[],$3::int[]) AS p(budget_key,event_key,max_multiplier)
    JOIN trevo_settings b ON b.key=p.budget_key
    JOIN trevo_settings e ON e.key=p.event_key
    WHERE b.value->>'eventId'=e.value->>'id' AND (b.value->>'remaining')::int>0
      AND (e.value->>'startsAt')::bigint<=$4 AND (e.value->>'endsAt')::bigint>$4
      AND (e.value->>'multiplier')::numeric>1
    ORDER BY b.key FOR UPDATE OF b
  `,[entries.map(t=>allowanceKey(t,jid,pet&&t==='raid')),entries.map(v2OwnerEventKey),entries.map(t=>V2_OWNER_EVENT_POLICIES[t].max),now])
  const options=candidates.rows.map(r=>({...r,multiplier:Number(r.multiplier),extra:roll?1:Math.max(0,Math.min(limit,Number(r.remaining),Math.floor(base*(Number(r.multiplier)-1)))-levelExtra)})).filter(r=>r.extra>0)
  options.sort((a,b)=>roll?b.multiplier-a.multiplier:b.extra-a.extra||b.multiplier-a.multiplier)
  const best=options[0]
  if(!best)return roll?1:floor
  await c.query("UPDATE trevo_settings SET value=jsonb_set(value,'{remaining}',to_jsonb($2::int)),updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE key=$1",[best.key,Number(best.remaining)-best.extra])
  return roll?best.multiplier:floor+best.extra
}
export async function provisionV2PetEventBudgets(c,eventId){
  return provisionV2OwnerEventBudgets(c,'pet',eventId)
}
// Only called inside the transaction that credits actual pet XP.
// An allowance is shared by all pets of a player. No new polling, no Raidlote.
// Reading the event does not lock the global row. The per-player allowance is
// locked and decremented atomically, so concurrent claims cannot exceed it.
export async function applyV2PetXpEvent(c,jid,base,currentXp,{now=Date.now(),enabled=classesOnlyRebootEnabled()}={}){
  if(!enabled||!Number.isSafeInteger(base)||base<=0||!Number.isFinite(Number(currentXp)))return base
  const room=Math.max(0,9900-Math.max(0,Number(currentXp))-base)
  if(room<=0)return base
  const r=await c.query(`
    WITH eligible AS (
      SELECT b.key,b.value,(b.value->>'remaining')::int AS remaining,
        LEAST($4::int,FLOOR($3::int*(LEAST(2,(e.value->>'multiplier')::numeric)-1))::int,(b.value->>'remaining')::int) AS extra
      FROM trevo_settings b JOIN trevo_settings e ON e.key=$2
      WHERE b.key=$1 AND b.value->>'eventId'=e.value->>'id'
        AND (b.value->>'remaining')::int>0
        AND (e.value->>'startsAt')::bigint<=$5 AND (e.value->>'endsAt')::bigint>$5
        AND (e.value->>'multiplier')::numeric>1
      FOR UPDATE OF b
    )
    UPDATE trevo_settings b SET value=jsonb_set(b.value,'{remaining}',to_jsonb(eligible.remaining-eligible.extra)),
      updated_at=EXTRACT(EPOCH FROM NOW())::bigint
    FROM eligible WHERE b.key=eligible.key AND eligible.extra>0 RETURNING eligible.extra
  `,[V2_PET_EVENT_BUDGET_PREFIX+jid,V2_PET_EVENT_KEY,base,Math.floor(room),now])
  return base+Number(r.rows[0]?.extra||0)
}
