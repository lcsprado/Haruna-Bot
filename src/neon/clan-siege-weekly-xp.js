// XP semanal do Cerco V5: a partir do sábado 07/11/2026.
// Independentemente de heróis, equipamentos e outros bônus de XP.
// Cada jogador precisa participar de ao menos 2 rodadas para ganhar XP.
import {grantExpInTransaction} from './db.js';
import {brtSiegeDay} from './clan-siege-event-rewards-20261104.js';

export const SIEGE_WEEKLY_XP_START='2026-11-07';
export const SIEGE_WEEKLY_XP=Object.freeze({winner:150000,loser:70000,draw:100000});
const SIEGE_DAILY_CREATED_BY='system:siege-daily-20h';
const REQUIRED_ROUNDS=2;

export function isWeeklySiegeXpMatch(match){
  return Number(match?.rules_version)>=5 &&
    match?.status==='completed' &&
    String(match?.created_by)===SIEGE_DAILY_CREATED_BY &&
    brtSiegeDay(match.created_at)>=SIEGE_WEEKLY_XP_START;
}

export function weeklySiegeXpFor(match,clanId,actions){
  if(!isWeeklySiegeXpMatch(match)||Number(actions)<REQUIRED_ROUNDS)return 0;
  const winner=match.winner_clan_id==null?null:String(match.winner_clan_id);
  if(!winner)return SIEGE_WEEKLY_XP.draw;
  return winner===String(clanId)?SIEGE_WEEKLY_XP.winner:SIEGE_WEEKLY_XP.loser;
}

export async function ensureSiegeWeeklyXpSchema(db){
  await db.query(
    'CREATE TABLE IF NOT EXISTS alpha_siege_weekly_xp ('+
    'match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,'+
    'jid TEXT NOT NULL REFERENCES users(jid),'+
    'xp INTEGER NOT NULL CHECK(xp>=0),'+
    'awarded_at_ms BIGINT NOT NULL,'+
    'PRIMARY KEY(match_id,jid))'
  );
}

export async function grantSiegeWeeklyXp(conn,match){
  if(!isWeeklySiegeXpMatch(match))return null;
  const blue=String(match.blue_clan_id),red=String(match.red_clan_id);
  if(blue===red)throw new Error('Cerco XP: clãs duplicados.');
  const winner=match.winner_clan_id==null?null:String(match.winner_clan_id);
  if(winner&&winner!==blue&&winner!==red)
    throw new Error('Cerco XP: vencedor fora da partida.');

  const players=(await conn.query(
    'SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1 ORDER BY clan_id,jid',
    [match.id]
  )).rows;
  const roster=[...players.map(p=>String(p.jid))];
  const counts={ [blue]:0,[red]:0 };
  for(const p of players){
    if(!(String(p.clan_id) in counts))throw new Error('Cerco XP: clã inválido.');
    counts[String(p.clan_id)]++;
  }
  if(players.length!==4||new Set(roster).size!==4||counts[blue]!==2||counts[red]!==2)
    throw new Error('Cerco XP: é preciso haver 2 clãs de 2 jogadores.');

  const turns=(await conn.query(
    'SELECT jid,COUNT(DISTINCT round)::int AS turns FROM alpha_siege_moves '+
    'WHERE match_id=$1 GROUP BY jid',[match.id]
  )).rows;
  const turnsByJid=new Map(turns.map(p=>[String(p.jid),Number(p.turns)]));
  const result={winners:0,losers:0,draws:0,paid:0,totalXp:0,minimumRounds:REQUIRED_ROUNDS};
  for(const player of players){
    const xp=weeklySiegeXpFor(match,player.clan_id,turnsByJid.get(String(player.jid))||0);
    if(!xp)continue;
    // A linha e o grant de XP usam a MESMA transação do resultado da guerra.
    // ON CONFLICT garante que um reprocessamento jamais pague duas vezes.
    const claimed=await conn.query(
      'INSERT INTO alpha_siege_weekly_xp(match_id,jid,xp,awarded_at_ms) '+
      'VALUES($1,$2,$3,$4) ON CONFLICT(match_id,jid) DO NOTHING RETURNING jid',
      [match.id,player.jid,xp,Date.now()]
    );
    if(!claimed.rowCount)continue;
    await grantExpInTransaction(conn,player.jid,xp,{
      ignoreXpBoost:true,ignoreGroupProgressionEvent:true
    });
    const type=!winner?'draws':winner===String(player.clan_id)?'winners':'losers';
    result[type]++;
    result.paid++;
    result.totalXp+=xp;
  }
  return result;
}
