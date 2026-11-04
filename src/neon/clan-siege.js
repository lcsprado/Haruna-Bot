// Cerco ao Castelo: batalhas e escolhas autoritativas no banco, nunca no cliente.
// Recursos reais (dinheiro, HP do jogador e XP) não são alterados.
import {db} from './db.js';
import {ensureWebActionOutbox} from './web-activity-relay.js';
import {grantFirstSiegeInsignias} from './clan-siege-first-prize.js';
import {siegeBetaAuthorizedSet} from './clan-siege-beta-access.js';
import {ensureClanFortressSchema,clanFortressCombatSnapshot,clanFortressStatus,clanFortressUpgrade} from './clan-fortress.js';
import {resolveSiegeRoundV4,validateSiegeV4Move} from './clan-siege-v4.js';

const LIMIT_HP=2000, MAX_ROUNDS=6, ROUND_MS=5*60*1000, MAX_REPAIR=2;
const TEAM_TACTICS_VERSION=2; // novas guerras apenas; partidas antigas preservam regras v1
const DAILY_CREATED_BY='system:siege-daily-20h';
const DAILY_OPEN_GRACE_MS=15*60*1000; // Free Render can wake after 20h; never start after 20h15.
const ACTIONS=new Set(['attack','defend','repair','spy']);
const siegeGroup=()=>String(process.env.ALPHA_CLAN_SIEGE_GROUP_JID||'').trim();
const ON=()=>process.env.ALPHA_CLAN_SIEGE_ENABLED==='1'&&/^[0-9-]+@g\.us$/.test(siegeGroup());
const now=()=>Date.now();
let schemaPromise=null;

export const isClanSiegeEnabled=()=>ON();
// Data na mesma zona do bot, sem depender da TZ do container (Render pode estar em UTC).
export function siegeDailySchedule(nowMs=now()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(nowMs)).map(p=>[p.type,p.value]));
  const day=[parts.year,parts.month,parts.day].join('-');
  const startsAt=Date.parse(day+'T20:00:00-03:00');
  return {day,startsAt,endsAt:startsAt+24*60*60*1000,
    opening:nowMs>=startsAt&&nowMs<startsAt+DAILY_OPEN_GRACE_MS};
}
export async function ensureClanSiegeSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await db.query([
      "CREATE TABLE IF NOT EXISTS alpha_siege_matches(",
      "id BIGSERIAL PRIMARY KEY,chat_jid TEXT NOT NULL,",
      "blue_clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,red_clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,",
      "created_by TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending'",
      "CHECK(status IN ('pending','active','completed','cancelled')),",
      "round INTEGER NOT NULL DEFAULT 1 CHECK(round BETWEEN 1 AND 6),round_ends_at BIGINT NOT NULL DEFAULT 0,",
      "blue_hp INTEGER NOT NULL DEFAULT 2000 CHECK(blue_hp BETWEEN 0 AND 2000),",
      "red_hp INTEGER NOT NULL DEFAULT 2000 CHECK(red_hp BETWEEN 0 AND 2000),",
      "blue_repairs INTEGER NOT NULL DEFAULT 0,red_repairs INTEGER NOT NULL DEFAULT 0,",
      "blue_spy INTEGER NOT NULL DEFAULT 0,red_spy INTEGER NOT NULL DEFAULT 0,",
      "winner_clan_id BIGINT,history JSONB NOT NULL DEFAULT '[]'::jsonb,",
      "created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,ended_at BIGINT);",
      "CREATE UNIQUE INDEX IF NOT EXISTS alpha_siege_one_open_per_group",
      "ON alpha_siege_matches(chat_jid) WHERE status IN ('pending','active');",
      "CREATE TABLE IF NOT EXISTS alpha_siege_roster(",
      "match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,",
      "jid TEXT NOT NULL,clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,PRIMARY KEY(match_id,jid));",
      "CREATE TABLE IF NOT EXISTS alpha_siege_moves(",
      "match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,",
      "round INTEGER NOT NULL,jid TEXT NOT NULL,",
      "clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,",
      "action TEXT NOT NULL CHECK(action IN ('attack','defend','repair','spy')),",
      "submitted_at BIGINT NOT NULL,PRIMARY KEY(match_id,round,jid));",
      "CREATE TABLE IF NOT EXISTS alpha_siege_first_victory(",
      "chat_jid TEXT PRIMARY KEY,match_id BIGINT NOT NULL,winner_clan_id BIGINT NOT NULL,awarded_at BIGINT NOT NULL);"
    ].join(' '));
    // Migração idempotente: partidas existentes permanecem na regra antiga.
    await db.query('ALTER TABLE alpha_siege_matches ADD COLUMN IF NOT EXISTS rules_version INTEGER NOT NULL DEFAULT 1');
    await db.query("ALTER TABLE alpha_siege_matches ADD COLUMN IF NOT EXISTS blue_fortress JSONB, ADD COLUMN IF NOT EXISTS red_fortress JSONB");
    // Alarga apenas o teto do HP da fortaleza (não altera HP de personagens).
    await db.query([
      'BEGIN;',
      'ALTER TABLE alpha_siege_matches DROP CONSTRAINT IF EXISTS alpha_siege_matches_blue_hp_check;',
      'ALTER TABLE alpha_siege_matches DROP CONSTRAINT IF EXISTS alpha_siege_matches_red_hp_check;',
      'ALTER TABLE alpha_siege_matches ADD CONSTRAINT alpha_siege_matches_blue_hp_check CHECK(blue_hp BETWEEN 0 AND 2250);',
      'ALTER TABLE alpha_siege_matches ADD CONSTRAINT alpha_siege_matches_red_hp_check CHECK(red_hp BETWEEN 0 AND 2250);',
      'COMMIT;'
    ].join(' '));
    // V4: objetivos de cercos, suprimentos virtuais e alvo de cada ação.
    // Valores padrão preservam as guerras V1-V3 sem mudar seu histórico.
    await db.query([
      "ALTER TABLE alpha_siege_matches",
      "ADD COLUMN IF NOT EXISTS blue_gate INTEGER NOT NULL DEFAULT 2,",
      "ADD COLUMN IF NOT EXISTS red_gate INTEGER NOT NULL DEFAULT 2,",
      "ADD COLUMN IF NOT EXISTS blue_supplies INTEGER NOT NULL DEFAULT 1,",
      "ADD COLUMN IF NOT EXISTS red_supplies INTEGER NOT NULL DEFAULT 1,",
      "ADD COLUMN IF NOT EXISTS blue_score INTEGER NOT NULL DEFAULT 0,",
      "ADD COLUMN IF NOT EXISTS red_score INTEGER NOT NULL DEFAULT 0,",
      "ADD COLUMN IF NOT EXISTS blue_spy_state JSONB NOT NULL DEFAULT '{}'::jsonb,",
      "ADD COLUMN IF NOT EXISTS red_spy_state JSONB NOT NULL DEFAULT '{}'::jsonb;"
    ].join(' '));
    await db.query("ALTER TABLE alpha_siege_moves ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'castle' CHECK(target IN ('castle','gate','depot'))");
    await db.query([
      'BEGIN;',
      'ALTER TABLE alpha_siege_moves DROP CONSTRAINT IF EXISTS alpha_siege_moves_action_check;',
      "ALTER TABLE alpha_siege_moves ADD CONSTRAINT alpha_siege_moves_action_check CHECK(action IN ('attack','defend','repair','spy','supply'));",
      'COMMIT;'
    ].join(' '));
    await ensureWebActionOutbox(db);
    // Prepara a tabela de upgrades na inicialização, mesmo sem alguém abrir o Web.
    await ensureClanFortressSchema();
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}
function group(session){
  const value=String(session?.chatJid||'');
  if(!value.endsWith('@g.us'))throw new Error('Vincule sua sessão ao grupo usando !web.');
  if(ON()&&value!==siegeGroup())throw new Error('Cerco ao Castelo disponível apenas no grupo AlphaBot.');
  return value;
}
function gate(){if(!ON())throw new Error('Cerco ao Castelo ainda está em preparação.');}
async function tx(cb){
  const conn=await db.connect();
  try{await conn.query('BEGIN');const result=await cb(conn);await conn.query('COMMIT');return result;}
  catch(e){await conn.query('ROLLBACK').catch(()=>{});throw e;}
  finally{conn.release();}
}
async function eligible(conn,chat){
  const q=[
    "SELECT c.id,c.name,ARRAY_AGG(cm.jid ORDER BY cm.jid) AS jids,",
    "COUNT(cm.jid)::int AS members,",
    "COUNT(DISTINCT ws.jid)::int AS linked",
    "FROM clans c JOIN clan_members cm ON cm.clan_id=c.id",
    "LEFT JOIN (SELECT DISTINCT jid FROM web_sessions",
    "WHERE chat_jid=$1 AND expires_at>$2) ws ON ws.jid=cm.jid",
    "GROUP BY c.id,c.name HAVING COUNT(cm.jid)=2 AND COUNT(DISTINCT ws.jid)>0 ORDER BY c.id"
  ].join(' ');
  return (await conn.query(q,[chat,now()])).rows.map(r=>({...r,id:String(r.id),jids:r.jids||[]}));
}
// Read-only readiness: no personal JIDs leave the server. Shared with status and logs.

export function analyzeSiegeEligibility(teams,authorizedJids=[]){
  const allowed=authorizedJids instanceof Set?authorizedJids:new Set(authorizedJids);
  const overview=(Array.isArray(teams)?teams:[]).map(team=>({
    id:String(team.id),name:String(team.name||'Clã'),
    members:Number(team.members)||0,linked:Number(team.linked)||0,
    betaAuthorized:(Array.isArray(team.jids)?team.jids:[]).filter(jid=>allowed.has(String(jid))).length
  }));
  const ready=overview.length===2 && overview.every(t=>
    t.members===2&&t.linked===2&&t.betaAuthorized===2
  );
  return {ready,teams:overview,eligibleClans:overview.length,linkedPlayers:overview.reduce((n,t)=>n+t.linked,0),authorizedPlayers:overview.reduce((n,t)=>n+t.betaAuthorized,0)};
}
export async function clanSiegePreflight(){
  const chat=siegeGroup();
  if(!/^[0-9-]+@g\.us$/.test(chat))return {configured:false,ready:false,teams:[]};
  const teams=await eligible(db,chat);
  return {configured:true,...analyzeSiegeEligibility(teams,await siegeBetaAuthorizedSet(db))};
}

async function dailySiegeTeams(conn){
  // A abertura nao exige navegador aberto: ausencia na partida significa
  // que o jogador nao executa ação naquela rodada.
  const result=await conn.query([
    'SELECT c.id,c.name,ARRAY_AGG(cm.jid ORDER BY cm.jid) AS jids,COUNT(cm.jid)::int AS members',
    'FROM clans c JOIN clan_members cm ON cm.clan_id=c.id',
    'GROUP BY c.id,c.name HAVING COUNT(cm.jid)=2 ORDER BY c.id'
  ].join(' '));
  return result.rows.map(r=>({...r,id:String(r.id),jids:r.jids||[]}));
}
export async function startDailyClanSiege(nowMs=now()){
  if(!ON())return {started:false,reason:'disabled'};
  const schedule=siegeDailySchedule(nowMs);
  if(!schedule.opening)return {started:false,reason:'outside_window'};
  await ensureClanSiegeSchema();
  await ensureClanFortressSchema();
  const chat=siegeGroup();
  return tx(async conn=>{
    // Protege contra chamadas simultaneas de status + cron e redeploys.
    await conn.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [chat+':siege:'+schedule.day]);
    const alreadyPlayed=await conn.query(
      'SELECT 1 FROM alpha_siege_matches WHERE chat_jid=$1 AND created_by=$2 AND created_at>=$3 AND created_at<$4 LIMIT 1',
      [chat,DAILY_CREATED_BY,schedule.startsAt,schedule.endsAt]);
    if(alreadyPlayed.rowCount)return {started:false,reason:'already_today'};
    const existing=await openMatch(conn,chat,true);
    if(existing)return {started:false,reason:'match_open'};
    const teams=await dailySiegeTeams(conn);
    const approved=await siegeBetaAuthorizedSet(conn);
    if(teams.length!==2||teams.some(t=>t.members!==2||t.jids.length!==2||
      t.jids.some(jid=>!approved.has(String(jid)))))
      return {started:false,reason:'roster_not_ready'};
    const created=now();
    // Snapshot imutável: obras concluídas até o início valem nesta guerra;
    // upgrades comprados durante o Cerco só afetam guerras posteriores.
    const blueFortress=await clanFortressCombatSnapshot(conn,teams[0].id,created);
    const redFortress=await clanFortressCombatSnapshot(conn,teams[1].id,created);
    const match=(await conn.query(
      "INSERT INTO alpha_siege_matches(chat_jid,blue_clan_id,red_clan_id,created_by,status,rules_version,blue_hp,red_hp,blue_fortress,red_fortress,round_ends_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',5,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$10) RETURNING id",
      [chat,teams[0].id,teams[1].id,DAILY_CREATED_BY,blueFortress.maxHp,redFortress.maxHp,JSON.stringify(blueFortress),JSON.stringify(redFortress),created+ROUND_MS,created]
    )).rows[0];
    for(const team of teams)for(const jid of team.jids)
      await conn.query('INSERT INTO alpha_siege_roster(match_id,jid,clan_id) VALUES($1,$2,$3)',
        [match.id,jid,team.id]);
    await notice(conn,chat,[
      '🏰 *CERCO AO CASTELO — GUERRA DIÁRIA INICIADA!*',
      '⏰ Início programado: *20h*, horário de Brasília.',
      '🔵 '+teams[0].name+' × 🔴 '+teams[1].name,
      '🏰 Fortalezas: Azul '+blueFortress.maxHp+' HP / +'+Math.round(blueFortress.attackPct*100)+'% ATK / -'+(blueFortress.defensePct*100).toFixed(1)+'% dano; Vermelho '+redFortress.maxHp+' HP / +'+Math.round(redFortress.attackPct*100)+'% ATK / -'+(redFortress.defensePct*100).toFixed(1)+'% dano.',
      '⚔️ 6 rodadas de 5 minutos, 1 ação por pessoa a cada rodada.',
      '🗺️ CERCO V5: cada jogador escolhe UMA ação e uma frente: 🏰 Castelo, 🚪 Portão ou 📦 Depósito.',
      '🚪 Duas investidas rompem o portão (+25% dano futuro ao castelo). 📦 Saquear o depósito rouba suprimento; reabastecer gera 1. Reparar consome 1 suprimento de CERCO e pode restaurar até 280 HP ou 1 ponto do Portão (máximo 2 reparos por clã).',
      '🛡️ Defender a frente certa bloqueia mais dano e pode contra-atacar. Espionar prepara o ataque NA MESMA FRENTE na rodada seguinte.',
      '🏆 Após 6 rodadas vence quem tiver mais HP; empate no HP desempata por objetivos, depois portão e suprimentos. Totalmente igual continua empate.',
      '🤝 Táticas em dupla: Atacar + Atacar ganha +10% de dano; Atacar + Defender protege e contra-ataca; Atacar + Reparar recupera até 220 HP; Atacar + Espionar marca alvo (+30%) e prepara +60% para a próxima rodada.',
      '🛡️ Defender reduz 50% do dano por defensor (máx. 75%) e devolve 80 de dano se sofrer ataque. 🔨 Só 2 reparos por guerra/clã. 🕵️ Espiões fortalecem os ataques da rodada seguinte (+60% cada).',
      '🏆 Vence quem deixar a fortaleza rival com menos HP após seis rodadas; HP igual = empate.',
      '🎮 Abra o Alpha Web > Clã e escolha *Atacar, Defender, Reparar ou Espionar*.',
      '🔒 Ação secreta. Quem não jogar a rodada fica sem ação.',
      '🏆 A primeira vitória válida ainda concede a insígnia especial aos 2 campeões.'
    ].join('\n'));
    return {started:true,matchId:String(match.id)};
  });
}
async function openMatch(conn,chat,locked=false){
  const q=[
    "SELECT * FROM alpha_siege_matches WHERE chat_jid=$1",
    "AND status IN ('pending','active') ORDER BY id DESC LIMIT 1",
    locked?"FOR UPDATE":""
  ].join(' ');
  return (await conn.query(q,[chat])).rows[0]||null;
}
async function notice(conn,chat,message){
  const r=await conn.query(
    "INSERT INTO alpha_web_action_outbox(chat_jid,kind,payload,created_at_ms) VALUES($1,'message',$2::jsonb,$3) RETURNING id",
    [chat,JSON.stringify({text:message}),now()]
  );
  await conn.query("SELECT pg_notify('alpha_web_action_wakeup_v1',$1)",[String(r.rows[0].id)]);
}
export function resolveSiegeRound(match,moves){
  if(Number(match.rules_version||1)>=4)return resolveSiegeRoundV4(match,moves);
  if(Number(match.rules_version||1)>=TEAM_TACTICS_VERSION)return resolveSiegeRoundV2(match,moves);
  const sides={blue:[],red:[]};
  for(const m of moves){
    const side=String(m.clan_id)===String(match.blue_clan_id)?'blue':'red';
    sides[side].push(m.action);
  }
  const n=(side,action)=>sides[side].filter(x=>x===action).length;
  const atk={};
  for(const side of ['blue','red']){
    const rival=side==='blue'?'red':'blue';
    atk[side]=Math.round(180*n(side,'attack')*(Number(match[side+'_spy'])?1.2:1)*Math.max(.4,1-.35*n(rival,'defend')));
  }
  const hp={blue:Math.max(0,Number(match.blue_hp)-atk.red),red:Math.max(0,Number(match.red_hp)-atk.blue)};
  const repairs={blue:Number(match.blue_repairs),red:Number(match.red_repairs)};
  for(const side of ['blue','red']){
    const available=Math.max(0,MAX_REPAIR-repairs[side]);
    const used=Math.min(available,n(side,'repair'));
    hp[side]=Math.min(LIMIT_HP,hp[side]+used*140);
    repairs[side]+=used;
  }
  const finished=hp.blue===0||hp.red===0||Number(match.round)>=MAX_ROUNDS;
  const winner=finished&&hp.blue!==hp.red?(hp.blue>hp.red?String(match.blue_clan_id):String(match.red_clan_id)):null;
  const result={
    round:Number(match.round),blueHp:hp.blue,redHp:hp.red,
    blueDamage:atk.blue,redDamage:atk.red,
    blueDefends:n('blue','defend'),redDefends:n('red','defend'),
    blueRepairs:repairs.blue-Number(match.blue_repairs),redRepairs:repairs.red-Number(match.red_repairs),
    blueSpies:n('blue','spy'),redSpies:n('red','spy'),
    blueSubmitted:sides.blue.length,redSubmitted:sides.red.length
  };
  return {hp,repairs,spy:{blue:Number(n('blue','spy')>0),red:Number(n('red','spy')>0)},finished,winner,result};
}
function resolveSiegeRoundV2(match,moves){
  const sides={blue:[],red:[]};
  for(const m of moves){
    const side=String(m.clan_id)===String(match.blue_clan_id)?'blue':'red';
    sides[side].push(m.action);
  }
  const n=(side,action)=>sides[side].filter(x=>x===action).length;
  const enemy=side=>side==='blue'?'red':'blue';
  const labels={
    'attack+attack':'Assalto coordenado',
    'attack+defend':'Avanço protegido',
    'attack+repair':'Ofensiva de suporte',
    'attack+spy':'Ataque marcado',
    'defend+defend':'Muralha conjunta',
    'defend+repair':'Bastião reforçado',
    'defend+spy':'Vigilância estratégica',
    'repair+repair':'Reconstrução total',
    'repair+spy':'Preparar a virada',
    'spy+spy':'Inteligência total'
  };
  const tactic=side=>labels[sides[side].slice().sort().join('+')]||
    (sides[side].length?'Ação individual':'Sem ação');
  const raw={},direct={},blocked={},counter={},damage={};
  for(const side of ['blue','red']){
    const attacks=n(side,'attack'),spies=n(side,'spy');
    const priorSpies=Math.max(0,Math.min(2,Number(match[side+'_spy'])||0));
    // Bônus coordenados: dois ataques +10%; espião junto de atacante +30%.
    // Reconhecimento da rodada anterior: +60% por espião, limitado a 2.
    raw[side]=Math.round(180*attacks*(attacks===2?1.1:1)*
      (attacks&&spies?1.3:1)*(1+0.6*priorSpies)*
      (Number(match.rules_version||1)>=3?1+Math.max(0,Math.min(.10,Number(match[side+'_fortress']?.attackPct)||0)):1));
  }
  for(const side of ['blue','red']){
    const rival=enemy(side);
    // Defesa por colega protege o CASTELO inteiro: 50% por defensor,
    // até 75% de redução para que atacar nunca cause dano zero.
    const castleDefense=Number(match.rules_version||1)>=3?
      Math.max(0,Math.min(.075,Number(match[rival+'_fortress']?.defensePct)||0)):0;
    direct[side]=Math.round(raw[side]*Math.max(.25,1-.5*n(rival,'defend'))*(1-castleDefense));
    blocked[side]=raw[side]-direct[side];
    // O contra-ataque é uma retaliação, e só acontece se o rival atacou.
    counter[side]=n(side,'defend')*(n(rival,'attack')>0?80:0);
    damage[side]=direct[side]+counter[side];
  }
  const hp={blue:Math.max(0,Number(match.blue_hp)-damage.red),
    red:Math.max(0,Number(match.red_hp)-damage.blue)};
  const repairs={blue:Number(match.blue_repairs),red:Number(match.red_repairs)};
  for(const side of ['blue','red']){
    const available=Math.max(0,MAX_REPAIR-repairs[side]);
    const used=Math.min(available,n(side,'repair'));
    const maxHp=Number(match.rules_version||1)>=3?
      Math.max(LIMIT_HP,Math.min(2250,Number(match[side+'_fortress']?.maxHp)||LIMIT_HP)):LIMIT_HP;
    hp[side]=Math.min(maxHp,hp[side]+used*220);
    repairs[side]+=used;
  }
  const finished=hp.blue===0||hp.red===0||Number(match.round)>=MAX_ROUNDS;
  const winner=finished&&hp.blue!==hp.red?
    (hp.blue>hp.red?String(match.blue_clan_id):String(match.red_clan_id)):null;
  const result={
    rulesVersion:Number(match.rules_version||TEAM_TACTICS_VERSION),round:Number(match.round),
    blueHp:hp.blue,redHp:hp.red,
    blueDamage:damage.blue,redDamage:damage.red,
    blueBlocked:blocked.red,redBlocked:blocked.blue,
    blueCounter:counter.blue,redCounter:counter.red,
    blueTactic:tactic('blue'),redTactic:tactic('red'),
    blueDefends:n('blue','defend'),redDefends:n('red','defend'),
    blueRepairs:repairs.blue-Number(match.blue_repairs),
    redRepairs:repairs.red-Number(match.red_repairs),
    blueSpies:n('blue','spy'),redSpies:n('red','spy'),
    blueSubmitted:sides.blue.length,redSubmitted:sides.red.length
  };
  return {hp,repairs,spy:{blue:n('blue','spy'),red:n('red','spy')},
    finished,winner,result};
}

async function advance(conn,match){
  if(!match||match.status!=='active')return match;
  for(let i=0;i<MAX_ROUNDS&&match.status==='active';i++){
    const moves=(await conn.query(
      'SELECT clan_id,action,target FROM alpha_siege_moves WHERE match_id=$1 AND round=$2',
      [match.id,match.round])).rows;
    if(Number(match.round_ends_at)>now()&&(match.created_by===DAILY_CREATED_BY||moves.length<4))break;
    const r=resolveSiegeRound(match,moves);
    const oldHistory=Array.isArray(match.history)?match.history:JSON.parse(match.history||'[]');
    const history=[...oldHistory,r.result];
    const status=r.finished?'completed':'active';
    const deadline=r.finished?0:(match.created_by===DAILY_CREATED_BY?Number(match.round_ends_at)+ROUND_MS:(moves.length===4?now()+ROUND_MS:Number(match.round_ends_at)+ROUND_MS));
    const updated=(await conn.query([
      "UPDATE alpha_siege_matches SET status=$2,round=$3,round_ends_at=$4,",
      "blue_hp=$5,red_hp=$6,blue_repairs=$7,red_repairs=$8,",
      "blue_spy=$9,red_spy=$10,winner_clan_id=$11,",
      "history=$12::jsonb,updated_at=$13,ended_at=$14,",
      "blue_gate=COALESCE($15::int,blue_gate),red_gate=COALESCE($16::int,red_gate),",
      "blue_supplies=COALESCE($17::int,blue_supplies),red_supplies=COALESCE($18::int,red_supplies),",
      "blue_score=COALESCE($19::int,blue_score),red_score=COALESCE($20::int,red_score),",
      "blue_spy_state=COALESCE($21::jsonb,blue_spy_state),",
      "red_spy_state=COALESCE($22::jsonb,red_spy_state)",
      "WHERE id=$1 RETURNING *"
    ].join(' '),[
      match.id,status,r.finished?Number(match.round):Number(match.round)+1,deadline,
      r.hp.blue,r.hp.red,r.repairs.blue,r.repairs.red,
      r.spy.blue,r.spy.red,r.winner,JSON.stringify(history),now(),r.finished?now():null,
      r.v4?.gate.blue??null,r.v4?.gate.red??null,
      r.v4?.supplies.blue??null,r.v4?.supplies.red??null,
      r.v4?.score.blue??null,r.v4?.score.red??null,
      r.v4?JSON.stringify(r.v4.spyState.blue):null,
      r.v4?JSON.stringify(r.v4.spyState.red):null
    ])).rows[0];
    const prize=r.finished&&r.winner?await grantFirstSiegeInsignias(conn,updated):null;
    const winner=r.winner===null?'Empate':r.winner===String(match.blue_clan_id)?'Clã Azul':'Clã Vermelho';
    await notice(conn,match.chat_jid,[
      '🏰 *CERCO AO CASTELO — RODADA '+match.round+'/'+MAX_ROUNDS+'*',
      '🔵 Azul: '+r.hp.blue+'/'+(Number(match.rules_version||1)>=3?Number(match.blue_fortress?.maxHp||LIMIT_HP):LIMIT_HP)+' HP • 🔴 Vermelho: '+r.hp.red+'/'+(Number(match.rules_version||1)>=3?Number(match.red_fortress?.maxHp||LIMIT_HP):LIMIT_HP)+' HP',
      '⚔️ Dano: azul '+r.result.blueDamage+' • vermelho '+r.result.redDamage,
      '🛡️ Defesas: '+r.result.blueDefends+' / '+r.result.redDefends,
      Number(match.rules_version||1)>=TEAM_TACTICS_VERSION?
        '🤝 Táticas: 🔵 '+r.result.blueTactic+' • 🔴 '+r.result.redTactic:'',
      Number(match.rules_version||1)>=TEAM_TACTICS_VERSION?
        '🛡️ Dano bloqueado: 🔵 '+r.result.blueBlocked+' • 🔴 '+r.result.redBlocked+
        ' | ⚔️ Contra-ataque: 🔵 '+r.result.blueCounter+' • 🔴 '+r.result.redCounter:'',
      '🔨 Reparos usados nesta rodada: 🔵 '+r.result.blueRepairs+' • 🔴 '+r.result.redRepairs,
      r.v4?'💚 Recuperação REAL de HP: 🔵 +'+r.result.blueHeal+' • 🔴 +'+r.result.redHeal+' | 🚪 Portões reconstruídos: 🔵 +'+r.result.blueGateRebuilt+' • 🔴 +'+r.result.redGateRebuilt:'',
      r.v4&&(r.result.blueRepairWithoutEffect?.length||r.result.redRepairWithoutEffect?.length)?
        '⚠️ Reparos sem efeito: 🔵 '+(r.result.blueRepairWithoutEffect||[]).join(', ')+' • 🔴 '+(r.result.redRepairWithoutEffect||[]).join(', '):'',
      r.v4?'🚪 Portões: 🔵 '+r.v4.gate.blue+'/2 • 🔴 '+r.v4.gate.red+'/2 | 📦 Suprimentos: 🔵 '+r.v4.supplies.blue+'/3 • 🔴 '+r.v4.supplies.red+'/3':'',
      r.v4?'🎯 Pontos por objetivos: 🔵 '+r.v4.score.blue+' • 🔴 '+r.v4.score.red:'',
      r.finished?'🏆 *Resultado: '+winner+'*'+(r.v4?' • critério: '+r.result.victoryRule:''):'⏳ Próxima rodada aberta no Web.',
      prize?'👑 *PREMIAÇÃO HISTÓRICA:* '+prize.name+' entregue aos 2 campeões. Ative em *!reliquias*.':'',
      r.finished&&!r.winner?'🤝 Empate: a insígnia histórica permanece para a próxima guerra com vencedor.':''
    ].join('\n'));
    match=updated;
  }
  return match;
}
export async function settleClanSiege(chat=null){
  if(!ON())return 0;
  await ensureClanSiegeSchema();
  const chats=chat?[chat]:(await db.query(
    "SELECT DISTINCT chat_jid FROM alpha_siege_matches WHERE status IN ('pending','active') LIMIT 50"
  )).rows.map(r=>r.chat_jid);
  let count=0;
  for(const each of chats){
    await tx(async conn=>{
      const m=await openMatch(conn,each,true);
      if(!m)return;
      if(m.status==='pending'&&now()>Number(m.created_at)+30*60*1000){
        await conn.query("UPDATE alpha_siege_matches SET status='cancelled',ended_at=$2,updated_at=$2 WHERE id=$1",[m.id,now()]);
        count++;return;
      }
      if(m.status==='active'){
        const next=await advance(conn,m);
        if(next.status!==m.status||next.round!==m.round)count++;
      }
    });
  }
  return count;
}
async function viewMatch(match,jid){
  if(!match)return null;
  const participants=(await db.query(
    'SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1',[match.id]
  )).rows;
  const mine=participants.find(x=>x.jid===jid);
  const ownMove=match.status==='active'?(await db.query(
    'SELECT action,target FROM alpha_siege_moves WHERE match_id=$1 AND round=$2 AND jid=$3',
    [match.id,match.round,jid])).rows[0]||null:null;
  const submitted=match.status==='active'?(await db.query(
    'SELECT COUNT(*)::int AS n FROM alpha_siege_moves WHERE match_id=$1 AND round=$2',
    [match.id,match.round])).rows[0]?.n||0:0;
  return {
    id:String(match.id),status:match.status,round:Number(match.round),rounds:MAX_ROUNDS,
    roundEndsAt:Number(match.round_ends_at),
    blueClanId:String(match.blue_clan_id),redClanId:String(match.red_clan_id),
    blueHp:Number(match.blue_hp),redHp:Number(match.red_hp),
    blueMaxHp:Number(match.rules_version||1)>=3?Number(match.blue_fortress?.maxHp||LIMIT_HP):LIMIT_HP,
    redMaxHp:Number(match.rules_version||1)>=3?Number(match.red_fortress?.maxHp||LIMIT_HP):LIMIT_HP,
    blueFortress:Number(match.rules_version||1)>=3?match.blue_fortress:null,
    redFortress:Number(match.rules_version||1)>=3?match.red_fortress:null,
    blueRepairs:Number(match.blue_repairs),redRepairs:Number(match.red_repairs),
    blueGate:Number(match.rules_version||1)>=4?Number(match.blue_gate):null,
    redGate:Number(match.rules_version||1)>=4?Number(match.red_gate):null,
    blueSupplies:Number(match.rules_version||1)>=4?Number(match.blue_supplies):null,
    redSupplies:Number(match.rules_version||1)>=4?Number(match.red_supplies):null,
    blueScore:Number(match.rules_version||1)>=4?Number(match.blue_score):null,
    redScore:Number(match.rules_version||1)>=4?Number(match.red_score):null,
    rulesVersion:Number(match.rules_version||1),
    mySide:mine?(String(mine.clan_id)===String(match.blue_clan_id)?'blue':'red'):null,
    myMove:ownMove?.action||null,myTarget:ownMove?.target||null,submitted:Number(submitted),history:match.history,
    winnerClanId:match.winner_clan_id?String(match.winner_clan_id):null,
    createdByMe:match.created_by===jid
  };
}
export async function clanSiegeStatus(session){
  if(!ON()){
    const reason='Partidas reais ainda não foram ativadas no servidor.';
    if(session?.chatJid===siegeGroup()&&/^[0-9-]+@g\.us$/.test(siegeGroup())){
      try{return {enabled:false,reason,preflight:await clanSiegePreflight()};}
      catch(err){console.warn('[Cerco] Preflight indisponível:',String(err?.message||err).slice(0,130));}
    }
    return {enabled:false,reason};
  }
  if(!session?.chatJid)return {enabled:false,reason:'Vincule o Web ao grupo AlphaBot pelo !web.'};
  const chat=group(session);
  await ensureClanSiegeSchema();await settleClanSiege(chat);await startDailyClanSiege();
  const teams=await eligible(db,chat);
  const mine=(await db.query('SELECT clan_id,role FROM clan_members WHERE jid=$1',[session.jid])).rows[0];
  let match=await openMatch(db,chat);
  if(!match)match=(await db.query("SELECT * FROM alpha_siege_matches WHERE chat_jid=$1 AND status='completed' AND ended_at>$2 ORDER BY id DESC LIMIT 1",[chat,now()-24*60*60*1000])).rows[0]||null;
  const firstReward=(await db.query('SELECT match_id FROM alpha_siege_first_victory WHERE chat_jid=$1',[chat])).rows[0];
  return {
    firstWarPrizeMatchId:firstReward?String(firstReward.match_id):null,
    enabled:true,myClanId:mine?String(mine.clan_id):null,isLeader:mine?.role==='leader',
    clans:teams.map(({id,name,members,linked})=>({id,name,members,linked})),
    match:await viewMatch(match,session.jid),
    fortress:mine?await clanFortressStatus(session.jid):null
  };
}
export async function clanSiegeFortressUpgrade(session,stat){
  gate();group(session);
  return clanFortressUpgrade(session.jid,stat);
}
export async function clanSiegeChallenge(session){
  gate();group(session);
  throw new Error('O Cerco agora começa automaticamente às 20h de Brasília. Não é preciso desafiar.');
}
export async function clanSiegeAccept(session){
  gate();group(session);
  throw new Error('Aceitação manual desativada. A guerra começa automaticamente às 20h de Brasília.');
}
export async function clanSiegeMove(session,action,target='castle'){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  return tx(async conn=>{
    const match=await openMatch(conn,chat,true);
    if(!match||match.status!=='active')throw new Error('Nenhuma guerra ativa.');
    if(Number(match.rules_version||1)>=4)validateSiegeV4Move(action,target);
    else if(!ACTIONS.has(action)||target!=='castle')
      throw new Error('Esta guerra utiliza as ações da versão anterior.');
    if(now()>=Number(match.round_ends_at)){
      await advance(conn,match);
      return {ok:false,reason:'Rodada encerrada. Atualize a tela.'};
    }
    const player=(await conn.query('SELECT clan_id FROM alpha_siege_roster WHERE match_id=$1 AND jid=$2',[match.id,session.jid])).rows[0];
    if(!player)throw new Error('Você não pertence a esta guerra.');
    const actual=(await conn.query('SELECT clan_id FROM clan_members WHERE jid=$1',[session.jid])).rows[0];
    if(String(actual?.clan_id)!==String(player.clan_id))throw new Error('Você mudou de clã durante a guerra.');
    if(action==='repair'){
      const side=String(player.clan_id)===String(match.blue_clan_id)?'blue':'red';
      const already=(await conn.query(
        "SELECT COUNT(*)::int AS n FROM alpha_siege_moves WHERE match_id=$1 AND round=$3 AND clan_id=$2 AND action='repair'",
        [match.id,player.clan_id,match.round])).rows[0];
      if(Number(match[side+'_repairs'])+Number(already.n)>=MAX_REPAIR)
        throw new Error('O clã já atingiu o limite de reparos.');
    }
    const inserted=await conn.query(
      'INSERT INTO alpha_siege_moves(match_id,round,jid,clan_id,action,target,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(match_id,round,jid) DO NOTHING RETURNING action',
      [match.id,match.round,session.jid,player.clan_id,action,target,now()]);
    if(!inserted.rowCount)throw new Error('Ação já registrada. Não é possível alterar nesta rodada.');
    await advance(conn,match);
    return {ok:true,registered:true,action,target};
  });
}
export async function clanSiegeCancel(session){
  gate();const chat=group(session);await ensureClanSiegeSchema();
  return tx(async conn=>{
    const match=await openMatch(conn,chat,true);
    if(!match||match.status!=='pending')throw new Error('Não há desafio pendente.');
    if(match.created_by!==session.jid)throw new Error('Somente o líder que criou pode cancelar.');
    await conn.query("UPDATE alpha_siege_matches SET status='cancelled',updated_at=$2,ended_at=$2 WHERE id=$1",[match.id,now()]);
    return {ok:true,status:'cancelled'};
  });
}
