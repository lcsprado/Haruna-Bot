// Worker de eventos de duelo PvP, ISOLADO da produção.
// Envio at-least-once: transporte deve deduplicar por event_id, pois
// falha entre envio WhatsApp e ACK pode reenviar a mesma notificação.
import {randomUUID} from 'node:crypto';
import {sweepPersistentDuelDeadlines} from './pvp-duel-persistence.js';

const positive=(value,max=100)=>Number.isSafeInteger(value)&&value>=1&&value<=max;
export async function claimDuelEvents(pool,{limit=20,leaseMs=60000}={}){
  if(!positive(limit)||!positive(leaseMs,300000)||leaseMs<5000)throw new Error('invalid lease');
  const token=randomUUID();
  const result=await pool.query(`
    WITH due AS (
      SELECT event_id FROM pvp_duel_outbox
      WHERE delivered_at IS NULL
        AND (lease_until IS NULL OR lease_until<=clock_timestamp())
      ORDER BY event_id
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE pvp_duel_outbox o
       SET lease_token=$2,
           lease_until=clock_timestamp()+($3::integer*interval '1 millisecond'),
           delivery_attempts=delivery_attempts+1
    FROM due
    WHERE o.event_id=due.event_id
    RETURNING o.event_id,o.duel_id,o.revision,o.kind,o.payload,o.lease_token,o.delivery_attempts
  `,[limit,token,leaseMs]);
  return result.rows;
}
export async function confirmDuelEvent(pool,{eventId,leaseToken}={}){
  if(!eventId||!leaseToken)throw new Error('event and token required');
  const r=await pool.query(`
    UPDATE pvp_duel_outbox
       SET delivered_at=clock_timestamp(),lease_token=NULL,lease_until=NULL
     WHERE event_id=$1 AND lease_token=$2 AND delivered_at IS NULL
     RETURNING event_id
  `,[eventId,leaseToken]);
  return r.rowCount===1;
}
export async function releaseDuelEvent(pool,{eventId,leaseToken}={}){
  if(!eventId||!leaseToken)throw new Error('event and token required');
  const r=await pool.query(`
    UPDATE pvp_duel_outbox SET lease_until=NULL,lease_token=NULL
    WHERE event_id=$1 AND lease_token=$2 AND delivered_at IS NULL
    RETURNING event_id
  `,[eventId,leaseToken]);
  return r.rowCount===1;
}
export async function runDuelWorkerCycle(pool,{publish,resumeCombat,limit=20}={}){
  if(typeof publish!=='function'||typeof resumeCombat!=='function')throw new Error('worker handlers required');
  const transitions=await sweepPersistentDuelDeadlines(pool,{limit});
  const claimed=await claimDuelEvents(pool,{limit});
  const completed=[],failed=[];
  for(const event of claimed){
    try{
      // All event payloads are public-safe; early choices were never serialized here.
      // round_resolved is a durable trigger for the future incremental combat engine.
      // O aceite inicia as rodadas automáticas; a resolução retoma após a pausa.
      const sender=['accepted','round_resolved'].includes(event.kind)?resumeCombat:publish;
      await sender({
        eventId:String(event.event_id),
        duelId:event.duel_id,
        kind:event.kind,
        revision:event.revision,
        state:event.payload,
        idempotencyKey:'pvp-duel:'+event.event_id
      });
      if(!await confirmDuelEvent(pool,{eventId:event.event_id,leaseToken:event.lease_token}))
        throw new Error('lease lost before ack');
      completed.push(String(event.event_id));
    }catch(error){
      const message=String(error?.message||error).slice(0,180);
      await releaseDuelEvent(pool,{eventId:event.event_id,leaseToken:event.lease_token});
      failed.push({eventId:String(event.event_id),error:message});
    }
  }
  return {transitions:transitions.length,claimed:claimed.length,completed,failed};
}
