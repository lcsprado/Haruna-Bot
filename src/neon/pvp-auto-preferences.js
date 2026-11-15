// One persistent posture per player AND their currently active class/hero.
// No writes to HP, mastery, inventory or wallets.
import {AUTO_POSTURES,AUTO_ROLE_IDS,normalizedAutoPosture} from './pvp-auto-strategy.js';
const VALID_IDS=new Set(AUTO_ROLE_IDS);
const validId=id=>VALID_IDS.has(String(id||''));
const validPosture=p=>AUTO_POSTURES.includes(String(p||''));
export function validateAutoPreference(combatantId,posture){
  if(!validId(combatantId))throw new Error('Classe ou herói não reconhecido.');
  if(!validPosture(posture))throw new Error('Postura inválida.');
}
export async function activeAutoCombatant(client,jid,{lock=false}={}){
  if(!jid)throw new Error('Jogador inválido.');
  // Underlying hero mode is only active when the player really owns the species.
  const r=await client.query(`SELECT s.class_id,
    CASE WHEN EXISTS(SELECT 1 FROM pet_collection p
      WHERE p.jid=s.jid AND p.species=m.hero_species)
      THEN m.hero_species ELSE NULL END AS hero_id
    FROM stats s LEFT JOIN player_hero_mode m ON m.jid=s.jid
    WHERE s.jid=$1 ${lock?'FOR UPDATE OF s':''}`,[jid]);
  if(r.rows.length!==1)throw new Error('Personagem não localizado.');
  const id=r.rows[0].hero_id||r.rows[0].class_id;
  if(!validId(id))throw new Error('Selecione uma classe ou herói válido.');
  return id;
}
export async function setAutoStrategyPreference(client,{jid,posture}={}){
  if(!jid)throw new Error('Jogador inválido.');
  if(!validPosture(posture))throw new Error('Escolha uma postura válida.');
  const combatantId=await activeAutoCombatant(client,jid,{lock:true});
  validateAutoPreference(combatantId,posture);
  const r=await client.query(`INSERT INTO pvp_auto_strategy_preferences(jid,combatant_id,posture)
    VALUES($1,$2,$3) ON CONFLICT(jid,combatant_id) DO UPDATE
      SET posture=EXCLUDED.posture,updated_at=clock_timestamp()
    RETURNING combatant_id,posture`,[jid,combatantId,posture]);
  return r.rows[0];
}
export async function getAutoStrategyPreference(client,jid){
  const combatantId=await activeAutoCombatant(client,jid);
  const r=await client.query(
    'SELECT posture FROM pvp_auto_strategy_preferences WHERE jid=$1 AND combatant_id=$2',
    [jid,combatantId]);
  const posture=r.rows?.[0]?.posture;
  return {combatantId,posture:validPosture(posture)?posture:'equilibrada'};
}
export async function readAutoBattlePostures(client,fighters,{enabled=false}={}){
  const out=Object.fromEntries(fighters.map(f=>[f.jid,'equilibrada']));
  if(!enabled)return out; // Flag OFF never queries new preference table.
  if(fighters.some(f=>!f.jid))throw new Error('Jogador inválido.');
  // A future collab not yet added to this catalogue remains neutral, never breaks PvP.
  const known=fighters.filter(f=>validId(f.combatantId));
  if(!known.length)return out;
  const r=await client.query(`SELECT jid,combatant_id,posture
    FROM pvp_auto_strategy_preferences WHERE jid=ANY($1::text[]) AND combatant_id=ANY($2::text[])`,
    [known.map(f=>f.jid),known.map(f=>f.combatantId)]);
  for(const f of known){
    const stored=r.rows.find(row=>row.jid===f.jid&&row.combatant_id===f.combatantId);
    if(stored&&validPosture(stored.posture))out[f.jid]=stored.posture;
  }
  return out;
}
