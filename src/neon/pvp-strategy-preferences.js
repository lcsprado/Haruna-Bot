// Strategy preference repository; migration is opt-in and must be applied separately.
// This file is NOT wired to the WhatsApp runtime or production PvP.
import {ROLE_PLAYBOOK,POSTURES} from './pvp-strategy-prototype.js';
const allowedId=value=>Object.prototype.hasOwnProperty.call(ROLE_PLAYBOOK,String(value||''));
const validPosture=value=>POSTURES.includes(String(value||''));
export function assertStrategyPreference(combatantId,posture){
  if(!allowedId(combatantId))throw new Error('classe ou heroi nao reconhecido');
  if(!validPosture(posture))throw new Error('postura invalida');
}
export async function playerOwnsStrategicCombatant(db,jid,combatantId){
  if(!jid||!allowedId(combatantId))return false;
  if(combatantId.startsWith('pecado_')){
    const r=await db.query('SELECT EXISTS(SELECT 1 FROM pet_collection WHERE jid=$1 AND species=$2) AS owned',[jid,combatantId]);
    return r.rows?.[0]?.owned===true;
  }
  const r=await db.query(`SELECT (
    EXISTS(SELECT 1 FROM player_class_levels WHERE jid=$1 AND class_id=$2)
    OR EXISTS(SELECT 1 FROM stats WHERE jid=$1 AND class_id=$2)
  ) AS owned`,[jid,combatantId]);
  return r.rows?.[0]?.owned===true;
}
export async function saveStrategyPreference(db,{jid,combatantId,posture}={}){
  if(!jid)throw new Error('jogador invalido');
  assertStrategyPreference(combatantId,posture);
  if(!await playerOwnsStrategicCombatant(db,jid,combatantId))throw new Error('personagem nao pertence ao jogador');
  const r=await db.query(`INSERT INTO pvp_strategy_preferences(jid,combatant_id,posture)
    VALUES ($1,$2,$3)
    ON CONFLICT(jid,combatant_id) DO UPDATE
      SET posture=EXCLUDED.posture,updated_at=now()
    RETURNING combatant_id,posture`,[jid,combatantId,posture]);
  return r.rows[0];
}
export async function readBattleStrategies(db,fighters,{enabled=false}={}){
  const out=Object.fromEntries(fighters.map(f=>[f.jid,'equilibrada']));
  if(!enabled)return out; // NO DB calls when disabled, keeping current PvP identical.
  for(const f of fighters){
    if(!f.jid||!allowedId(f.combatantId))throw new Error('combatant invalid');
  }
  const jids=fighters.map(f=>f.jid);
  const ids=fighters.map(f=>f.combatantId);
  const r=await db.query(`SELECT jid,combatant_id,posture FROM pvp_strategy_preferences
    WHERE jid=ANY($1::text[]) AND combatant_id=ANY($2::text[])`,[jids,ids]);
  for(const f of fighters){
    const stored=r.rows.find(row=>row.jid===f.jid&&row.combatant_id===f.combatantId);
    if(stored&&validPosture(stored.posture))out[f.jid]=stored.posture;
  }
  return out;
}
