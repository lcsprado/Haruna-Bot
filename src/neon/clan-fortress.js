// Economia da fortaleza: dinheiro virtual do TESOURO do clã, sem afetar os atributos dos heróis.
// Melhorias são concluídas por relógio persistente e aplicadas só em novas guerras.
import {db} from './db.js';

export const CLAN_FORTRESS_MAX_LEVEL=5;
export const CLAN_FORTRESS_COSTS=Object.freeze([5000000,10000000,18000000,28000000,42000000]);
export const CLAN_FORTRESS_HOURS=Object.freeze([4,8,12,18,24]);
export const CLAN_FORTRESS_STATS=Object.freeze(['hp','attack','defense']);
const FIELDS=Object.freeze({hp:'hp_level',attack:'attack_level',defense:'defense_level'});
let setupPromise=null;
const epoch=()=>Date.now();

export function clanFortressStats(levels={}){
  const hp=Math.max(0,Math.min(CLAN_FORTRESS_MAX_LEVEL,Number(levels.hp)||0));
  const attack=Math.max(0,Math.min(CLAN_FORTRESS_MAX_LEVEL,Number(levels.attack)||0));
  const defense=Math.max(0,Math.min(CLAN_FORTRESS_MAX_LEVEL,Number(levels.defense)||0));
  return {maxHp:2000+50*hp,attackPct:Number((0.02*attack).toFixed(4)),
    defensePct:Number((0.015*defense).toFixed(4))};
}
export function clanFortressOffer(stat,currentLevel){
  if(!CLAN_FORTRESS_STATS.includes(stat))throw new Error('Melhoria de fortaleza inválida.');
  const level=Number(currentLevel)||0;
  if(level>=CLAN_FORTRESS_MAX_LEVEL)return null;
  if(level<0||!Number.isInteger(level))throw new Error('Nível da fortaleza inválido.');
  return {stat,nextLevel:level+1,cost:CLAN_FORTRESS_COSTS[level],
    durationMs:CLAN_FORTRESS_HOURS[level]*60*60*1000};
}
export async function ensureClanFortressSchema(){
  if(!setupPromise)setupPromise=db.query([
    'CREATE TABLE IF NOT EXISTS alpha_clan_fortresses(',
    'clan_id BIGINT PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,',
    'hp_level INTEGER NOT NULL DEFAULT 0 CHECK(hp_level BETWEEN 0 AND 5),',
    'attack_level INTEGER NOT NULL DEFAULT 0 CHECK(attack_level BETWEEN 0 AND 5),',
    'defense_level INTEGER NOT NULL DEFAULT 0 CHECK(defense_level BETWEEN 0 AND 5),',
    'upgrading_stat TEXT CHECK(upgrading_stat IS NULL OR upgrading_stat IN (\'hp\',\'attack\',\'defense\')),',
    'upgrading_to INTEGER,upgrade_ready_at BIGINT NOT NULL DEFAULT 0,',
    'upgrade_cost BIGINT NOT NULL DEFAULT 0,',
    'CHECK((upgrading_stat IS NULL AND upgrading_to IS NULL AND upgrade_ready_at=0)',
    'OR (upgrading_stat IS NOT NULL AND upgrading_to BETWEEN 1 AND 5 AND upgrade_ready_at>0)));'
  ].join(' ')).catch(err=>{setupPromise=null;throw err});
  return setupPromise;
}
async function withTransaction(work){
  const conn=await db.connect();
  try{await conn.query('BEGIN');const result=await work(conn);await conn.query('COMMIT');return result;}
  catch(err){await conn.query('ROLLBACK').catch(()=>{});throw err;}
  finally{conn.release();}
}
async function lockFortress(conn,clanId,timeMs=epoch()){
  await conn.query('INSERT INTO alpha_clan_fortresses(clan_id) VALUES($1) ON CONFLICT(clan_id) DO NOTHING',[clanId]);
  let row=(await conn.query('SELECT * FROM alpha_clan_fortresses WHERE clan_id=$1 FOR UPDATE',[clanId])).rows[0];
  // A conclusão é idempotente e não exige navegador aberto nem job externo.
  if(row.upgrading_stat&&Number(row.upgrade_ready_at)<=timeMs){
    const col=FIELDS[row.upgrading_stat];
    if(!col||Number(row.upgrading_to)!==Number(row[col])+1)
      throw new Error('Estado de evolução da fortaleza inconsistente.');
    row=(await conn.query(
      `UPDATE alpha_clan_fortresses SET ${col}=$2,upgrading_stat=NULL,upgrading_to=NULL,upgrade_ready_at=0,upgrade_cost=0 WHERE clan_id=$1 RETURNING *`,
      [clanId,row.upgrading_to]
    )).rows[0];
  }
  return row;
}
function display(row,clan,role){
  const levels={hp:Number(row.hp_level),attack:Number(row.attack_level),defense:Number(row.defense_level)};
  const offers=Object.fromEntries(CLAN_FORTRESS_STATS.map(stat=>[stat,clanFortressOffer(stat,levels[stat])]));
  return {clanId:String(clan.id),clanName:String(clan.name),isLeader:role==='leader',
    treasury:Number(clan.treasury),clanLevel:1+Math.floor(Number(clan.xp||0)/25000),
    levels,stats:clanFortressStats(levels),offers,pending:row.upgrading_stat?{
      stat:row.upgrading_stat,to:Number(row.upgrading_to),readyAt:Number(row.upgrade_ready_at),
      cost:Number(row.upgrade_cost)
    }:null};
}
export async function clanFortressStatus(jid){
  await ensureClanFortressSchema();
  return withTransaction(async conn=>{
    const info=(await conn.query([
      'SELECT c.id,c.name,c.treasury,c.xp,cm.role',
      'FROM clan_members cm JOIN clans c ON c.id=cm.clan_id WHERE cm.jid=$1'
    ].join(' '),[jid])).rows[0];
    if(!info)return null;
    return display(await lockFortress(conn,info.id),info,info.role);
  });
}
export async function clanFortressUpgrade(jid,stat){
  await ensureClanFortressSchema();
  if(!CLAN_FORTRESS_STATS.includes(stat))throw new Error('Melhoria de fortaleza inválida.');
  return withTransaction(async conn=>{
    // Serializa cobranças, doações e upgrades no mesmo registro do tesouro.
    const clan=(await conn.query([
      'SELECT c.id,c.name,c.treasury,c.xp,cm.role',
      'FROM clan_members cm JOIN clans c ON c.id=cm.clan_id',
      'WHERE cm.jid=$1 FOR UPDATE OF c'
    ].join(' '),[jid])).rows[0];
    if(!clan)throw new Error('Você não pertence a um clã.');
    if(clan.role!=='leader')throw new Error('Somente o líder pode investir o tesouro do clã.');
    const row=await lockFortress(conn,clan.id);
    if(row.upgrading_stat)throw new Error('O clã já possui uma obra em andamento.');
    const offer=clanFortressOffer(stat,row[FIELDS[stat]]);
    if(!offer)throw new Error('Esse atributo da fortaleza já está no nível máximo.');
    if(Number(clan.treasury)<offer.cost)throw new Error('Tesouro do clã insuficiente para esta melhoria.');
    const paid=(await conn.query(
      'UPDATE clans SET treasury=treasury-$1 WHERE id=$2 AND treasury>=$1 RETURNING treasury',
      [offer.cost,clan.id])).rows[0];
    if(!paid)throw new Error('Tesouro insuficiente. Atualize a tela.');
    const readyAt=epoch()+offer.durationMs;
    const updated=(await conn.query([
      'UPDATE alpha_clan_fortresses SET upgrading_stat=$2,upgrading_to=$3,',
      'upgrade_ready_at=$4,upgrade_cost=$5 WHERE clan_id=$1 RETURNING *'
    ].join(' '),[clan.id,stat,offer.nextLevel,readyAt,offer.cost])).rows[0];
    return {ok:true,charged:offer.cost,upgrade:display(updated,{...clan,treasury:paid.treasury},clan.role)};
  });
}
export async function clanFortressCombatSnapshot(conn,clanId,timeMs=epoch()){
  const row=await lockFortress(conn,clanId,timeMs);
  return clanFortressStats({hp:row.hp_level,attack:row.attack_level,defense:row.defense_level});
}
