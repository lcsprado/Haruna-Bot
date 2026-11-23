// Progressao do cla V2, desvinculada da economia monetaria e de PvP.
// A doacao ja atualiza xp e treasury na mesma transacao: XP nunca e consumido.
// Cap: nivel 50; beneficios PvE pequenos para incentivar cooperacao sem pay-to-win.
export const CLAN_MAX_LEVEL=50;
const BASE_STEP=25000;
const STEP_GROWTH=5000;
const safe=(value)=>Math.max(0,Math.floor(Number(value)||0));

export function clanXpForLevel(level){
 const n=Math.max(1,Math.min(CLAN_MAX_LEVEL,Math.floor(Number(level)||1)))-1;
 return BASE_STEP*n+STEP_GROWTH*n*(n-1)/2;
}

export function clanLevelFromXp(xp){
 const total=safe(xp);
 let level=1;
 while(level<CLAN_MAX_LEVEL&&total>=clanXpForLevel(level+1))level++;
 return level;
}

export function clanBenefits(level){
 const lv=Math.max(1,Math.min(CLAN_MAX_LEVEL,Math.floor(Number(level)||1)));
 return Object.freeze({
  level:lv,
  xpPct:Math.min(4.9,Number(((lv-1)*0.1).toFixed(1))),
  damagePct:Math.min(2.5,Number((Math.floor(lv/10)*0.5).toFixed(1))),
  defensePct:Math.min(1.5,Number((Math.floor(lv/15)*0.5).toFixed(1)))
 });
}

export function clanProgress(xp){
 const total=safe(xp),level=clanLevelFromXp(total);
 const benefits=clanBenefits(level);
 const floorXp=clanXpForLevel(level);
 const nextLevel=level<CLAN_MAX_LEVEL?level+1:null;
 const nextXp=nextLevel?clanXpForLevel(nextLevel):null;
 const remainingXp=nextXp===null?0:Math.max(0,nextXp-total);
 const stepXp=nextXp===null?0:nextXp-floorXp;
 const gainedXp=Math.max(0,total-floorXp);
 return {level,totalXp:total,maxLevel:CLAN_MAX_LEVEL,benefits,
  nextLevel,nextXp,remainingXp,stepXp,gainedXp,
  progressPercent:stepXp?Math.max(0,Math.min(100,Math.floor(gainedXp/stepXp*100))):100,
  nextBenefits:nextLevel?clanBenefits(nextLevel):null};
}

export const applyClanXpBonus=(xp,perks)=>Math.max(0,Math.round(safe(xp)*(1+Number(perks?.xpPct||0)/100)));
export const applyClanDamageBonus=(damage,perks)=>Math.max(0,Math.round(safe(damage)*(1+Number(perks?.damagePct||0)/100)));
export const applyClanDefenseBonus=(damage,perks)=>Math.max(0,Math.round(safe(damage)*(1-Number(perks?.defensePct||0)/100)));

export async function clanBenefitsForUser(client,jid){
 if(!jid)return clanBenefits(1);
 const {rows}=await client.query(`
  SELECT c.xp FROM clan_members m JOIN clans c ON c.id=m.clan_id
  WHERE m.jid=$1 LIMIT 1`,[jid]);
 return clanBenefits(clanLevelFromXp(rows[0]?.xp||0));
}

export async function clanBenefitsForPlayers(client,jids=[]){
 const ids=[...new Set((jids||[]).filter(Boolean))];
 if(!ids.length)return new Map();
 const {rows}=await client.query(`
  SELECT m.jid,c.xp FROM clan_members m JOIN clans c ON c.id=m.clan_id
  WHERE m.jid=ANY($1::text[])`,[ids]);
 const all=new Map(ids.map(jid=>[jid,clanBenefits(1)]));
 for(const row of rows)all.set(row.jid,clanBenefits(clanLevelFromXp(row.xp)));
 return all;
}

export function formatClanPerks(perks){
 const p=perks||clanBenefits(1);
 const percent=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 return `✨ Bônus de EXP Boss/Raid: +${percent(p.xpPct)}\n⚔️ Dano Boss/Raid: +${percent(p.damagePct)}\n🛡️ Redução de dano Boss/Raid: ${percent(p.defensePct)}\n🚫 Não afeta PvP, dinheiro, drops ou Raidlote automático.`;
}

export function formatClanProgress(xp){
 const p=clanProgress(xp),fmt=n=>Number(n).toLocaleString('pt-BR');
 const progress=p.nextLevel?`⭐ Nível: *${p.level}/${p.maxLevel}* • ${p.progressPercent}% para o próximo\n📈 Próximo nível: faltam *R$ ${fmt(p.remainingXp)}* em doações (XP histórico: R$ ${fmt(p.totalXp)})`:`⭐ Nível máximo: *${p.level}* • progressão concluída`;
 return progress+'\n'+formatClanPerks(p.benefits);
}
