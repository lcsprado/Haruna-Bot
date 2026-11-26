// V2-only event. Fixed allowances avoid a global hot row in combat transactions.
// Eligible roster and total extra XP are frozen at scheduling; no legacy keys.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_PET_EVENT_KEY='owner_event_v2:pet'
export const V2_PET_EVENT_BUDGET_PREFIX='owner_event_v2:pet:budget:'
export const V2_PET_EVENT_EXTRA_PER_PLAYER=1000
export const V2_PET_EVENT_MAX_MULTIPLIER=2
export async function provisionV2PetEventBudgets(c,eventId){
  const r=await c.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    SELECT $1||u.jid,jsonb_build_object('eventId',$2::text,'remaining',$3::int),EXTRACT(EPOCH FROM NOW())::bigint
    FROM users u JOIN stats s ON s.jid=u.jid
    WHERE s.class_applied=TRUE ORDER BY u.jid
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at
  `,[V2_PET_EVENT_BUDGET_PREFIX,eventId,V2_PET_EVENT_EXTRA_PER_PLAYER])
  return Number(r.rowCount||0)
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
