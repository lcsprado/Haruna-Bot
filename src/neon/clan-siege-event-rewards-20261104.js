// Prêmios exclusivos da Guerra de Clãs V5 de 04/11/2026, em dinheiro VIRTUAL.
// Nenhum bônus de combate, nenhuma insígnia e nenhuma alteração em clãs antigos.
// Invocar dentro da mesma transação PostgreSQL que conclui uma guerra.
export const SIEGE_EVENT_DATE='2026-11-04';
export const SIEGE_EVENT_TROPHY_ID='trofeu_conquista_cerco_v5_20261104';
export const SIEGE_EVENT_CASH=Object.freeze({
  winner:5000000,loser:1000000,draw:1500000
});
const DATE_PARTS=new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
});
export function brtSiegeDay(ms){
  const parts=Object.fromEntries(DATE_PARTS.formatToParts(new Date(Number(ms)))
    .map(p=>[p.type,p.value]));
  return [parts.year,parts.month,parts.day].join('-');
}
export function isSiegeEvent20261104(match){
  return Number(match?.rules_version)>=5 &&
    String(match?.created_by)==='system:siege-daily-20h' &&
    brtSiegeDay(match?.created_at)===SIEGE_EVENT_DATE;
}
export async function ensureSiegeEventRewardsSchema(db){
  await db.query(
    'CREATE TABLE IF NOT EXISTS alpha_siege_rewards_20261104('+
    'match_id BIGINT NOT NULL REFERENCES alpha_siege_matches(id) ON DELETE CASCADE,'+
    'jid TEXT NOT NULL REFERENCES users(jid),'+
    'cash BIGINT NOT NULL CHECK(cash>=0),'+
    'item_id TEXT,'+
    'awarded_at_ms BIGINT NOT NULL,'+
    'PRIMARY KEY(match_id,jid))'
  );
}
export async function grantSiegeEventRewards(conn,match){
  if(!isSiegeEvent20261104(match)||match?.status!=='completed')return null;
  const teams=[String(match.blue_clan_id),String(match.red_clan_id)];
  if(teams[0]===teams[1])throw new Error('Cerco: clãs duplicados na premiação.');
  const winning=match.winner_clan_id==null?null:String(match.winner_clan_id);
  if(winning&&!teams.includes(winning))
    throw new Error('Cerco: campeão incompatível com a escalação.');
  const members=(await conn.query(
    'SELECT jid,clan_id FROM alpha_siege_roster WHERE match_id=$1 ORDER BY clan_id,jid',
    [match.id]
  )).rows;
  const byTeam=Object.fromEntries(teams.map(id=>[id,0]));
  for(const member of members){
    const id=String(member.clan_id);
    if(!(id in byTeam))throw new Error('Cerco: participante sem clã válido.');
    byTeam[id]++;
  }
  if(members.length!==4||new Set(members.map(m=>m.jid)).size!==4||
      teams.some(id=>byTeam[id]!==2))
    throw new Error('Cerco: prêmio exige dois clãs com exatamente dois participantes.');
  // O prêmio cosmético é UM item não vendável. Não é uma insígnia,
  // não aumenta nenhum atributo nem assume automaticamente equipamento.
  if(winning)await conn.query(
    'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) '+
    'VALUES($1,$2,$3,$4,0,$5,FALSE,FALSE) ON CONFLICT(id) DO NOTHING',
    [SIEGE_EVENT_TROPHY_ID,'🏆 Troféu do Cerco V5 — 04/11/2026',
     'Troféu cosmético do clã vencedor do Cerco V5 de 04/11. Sem atributos, sem efeito de combate e não vendável.',
     'special','event']
  );
  let winners=0,losers=0,draws=0,paid=0,trophies=0;
  for(const member of members){
    const type=!winning?'draw':String(member.clan_id)===winning?'winner':'loser';
    const amount=SIEGE_EVENT_CASH[type];
    const trophy=type==='winner'?SIEGE_EVENT_TROPHY_ID:null;
    const claim=await conn.query(
      'INSERT INTO alpha_siege_rewards_20261104(match_id,jid,cash,item_id,awarded_at_ms) '+
      'VALUES($1,$2,$3,$4,$5) ON CONFLICT(match_id,jid) DO NOTHING RETURNING jid',
      [match.id,member.jid,amount,trophy,Date.now()]
    );
    if(!claim.rowCount)continue; // idempotência inclusive após nova chamada
    const wallet=await conn.query(
      'UPDATE wallets SET cash=cash+$2 WHERE jid=$1 RETURNING jid',
      [member.jid,amount]
    );
    if(wallet.rowCount!==1)throw new Error('Cerco: carteira ausente para prêmio.');
    if(trophy){
      await conn.query(
        'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) '+
        'ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)',
        [member.jid,trophy]
      );
      await conn.query(
        'INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity) '+
        'VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING',
        [member.jid,trophy,'clan-siege:v5:20261104:'+match.id]
      );
      trophies++;
    }
    if(type==='winner')winners++;
    else if(type==='loser')losers++;
    else draws++;
    paid+=amount;
  }
  return {winners,losers,draws,trophies,paid,eventDate:SIEGE_EVENT_DATE};
}
