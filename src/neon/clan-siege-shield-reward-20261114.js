// Prêmio especial e único do Cerco ao Castelo de 14/11/2026.
// Não modifica vencedores antigos, resultados de 07/11 nem XP semanal.
// Chamado na mesma transação PostgreSQL que encerra o Cerco V5.
import {brtSiegeDay} from './clan-siege-event-rewards-20261104.js';

export const SIEGE_SHIELD_REWARD_DATE='2026-11-14';
export const SIEGE_SHIELD_REWARD_ITEM_ID='bastiao_eclipse';
export const SIEGE_SHIELD_MIN_ROUNDS=2;
const SYSTEM_SIEGE_CREATOR='system:siege-daily-20h';

export function isSiegeShieldRewardMatch(match){
  return Number(match?.rules_version)>=5 &&
    match?.status==='completed' &&
    String(match?.created_by)===SYSTEM_SIEGE_CREATOR &&
    brtSiegeDay(match?.created_at)===SIEGE_SHIELD_REWARD_DATE;
}

export function eligibleForSiegeShield(match,clanId,rounds){
  return isSiegeShieldRewardMatch(match) &&
    match.winner_clan_id!=null &&
    String(match.winner_clan_id)===String(clanId) &&
    Number(rounds)>=SIEGE_SHIELD_MIN_ROUNDS;
}

export async function ensureSiegeShieldRewardSchema(db){
  await db.query(
    'CREATE TABLE IF NOT EXISTS alpha_siege_shield_rewards_20261114 ('+
    'jid TEXT PRIMARY KEY REFERENCES users(jid),'+
    'match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,'+
    'item_id TEXT NOT NULL,'+
    'awarded_at_ms BIGINT NOT NULL)'
  );
}

export async function grantSiegeShieldReward(conn,match){
  if(!isSiegeShieldRewardMatch(match))return null;
  const blue=String(match.blue_clan_id),red=String(match.red_clan_id);
  if(blue===red)throw new Error('Cerco escudo: os clãs não podem ser iguais.');
  const winner=match.winner_clan_id==null?null:String(match.winner_clan_id);
  if(winner&&winner!==blue&&winner!==red)
    throw new Error('Cerco escudo: vencedor inválido.');

  const roster=(await conn.query(
    'SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1 ORDER BY clan_id,jid',
    [match.id]
  )).rows;
  const counts={[blue]:0,[red]:0};
  for(const p of roster){
    const team=String(p.clan_id);
    if(!(team in counts))throw new Error('Cerco escudo: participante de outro clã.');
    counts[team]++;
  }
  if(roster.length!==4||new Set(roster.map(p=>String(p.jid))).size!==4||
      counts[blue]!==2||counts[red]!==2)
    throw new Error('Cerco escudo: exige dois clãs com dois jogadores cada.');

  const result={date:SIEGE_SHIELD_REWARD_DATE,itemId:SIEGE_SHIELD_REWARD_ITEM_ID,
    minimumRounds:SIEGE_SHIELD_MIN_ROUNDS,eligible:0,delivered:0,draw:!winner};
  if(!winner)return result; // Empate não cria premiado nem distribui escudos.

  const turns=(await conn.query(
    'SELECT jid,COUNT(DISTINCT round)::int AS turns FROM alpha_siege_moves '+
    'WHERE match_id=$1 GROUP BY jid',[match.id]
  )).rows;
  const turnsByJid=new Map(turns.map(p=>[String(p.jid),Number(p.turns)]));
  const eligible=roster.filter(p=>eligibleForSiegeShield(
    match,p.clan_id,turnsByJid.get(String(p.jid))||0
  ));
  result.eligible=eligible.length;
  if(!eligible.length)return result;

  // A própria premiação registra o item para funcionar mesmo que o deploy do
  // catálogo de equipamentos no bot do WhatsApp aconteça separadamente.
  await conn.query(
    'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) '+
    'VALUES($1,$2,$3,$4,0,$5,FALSE,FALSE) '+
    'ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,'+
    'category=EXCLUDED.category,price=0,rarity=EXCLUDED.rarity,sellable=FALSE,stackable=FALSE',
    [SIEGE_SHIELD_REWARD_ITEM_ID,'Bastião do Eclipse',
     'Escudo lendário anti-crítico exclusivo dos campeões do Cerco ao Castelo em 14/11/2026.',
     'shield','legendary']
  );
  for(const p of eligible){
    // Exclusivo de 14/11: no máximo uma entrega por jogador, mesmo após restart.
    const claim=await conn.query(
      'INSERT INTO alpha_siege_shield_rewards_20261114(jid,match_id,item_id,awarded_at_ms) '+
      'VALUES($1,$2,$3,$4) ON CONFLICT(jid) DO NOTHING RETURNING jid',
      [p.jid,match.id,SIEGE_SHIELD_REWARD_ITEM_ID,Date.now()]
    );
    if(!claim.rowCount)continue;
    await conn.query(
      'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) '+
      'ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)',
      [p.jid,SIEGE_SHIELD_REWARD_ITEM_ID]
    );
    await conn.query(
      'INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity) '+
      'VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING',
      [p.jid,SIEGE_SHIELD_REWARD_ITEM_ID,
       'clan-siege:v5:20261114:'+match.id]
    );
    result.delivered++;
  }
  return result;
}
