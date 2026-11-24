// Progressao do cla V2, desvinculada da economia monetaria e de PvP.
// A doacao ja atualiza xp e treasury na mesma transacao: XP nunca e consumido.
// Cap: nivel 50; vantagens exclusivas de Boss/Raid manual. PvP e RaidLote nao recebem bonus.
// Liberacao individual: R$1.000 doados ao proprio cla OU 3 Raids cooperativas com cla.
export const CLAN_MAX_LEVEL=50;
const BASE_STEP=25000;
const STEP_GROWTH=5000;
export const CLAN_DONATION_UNLOCK=1000;
export const CLAN_COOP_UNLOCK=3;
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
  xpPct:Math.min(19.6,Number(((lv-1)*0.4).toFixed(1))),
  damagePct:Math.min(10,Number(Math.floor(lv/5).toFixed(1))),
  defensePct:Math.min(2.5,Number((Math.floor(lv/10)*0.5).toFixed(1)))
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

// Evidencia de participacao vinculada ao cla atual. Doacoes em outros clas
// e Raids anteriores a entrada no cla nao habilitam bonus.
export function clanMemberEligible(row={}){
 return safe(row.donated)>=CLAN_DONATION_UNLOCK||safe(row.coopWins)>=CLAN_COOP_UNLOCK;
}

async function clanMembershipRows(client,jids){
 const ids=[...new Set((jids||[]).filter(Boolean))];
 if(!ids.length)return [];
 const {rows}=await client.query(`
  SELECT m.jid,m.clan_id,c.xp,
    COALESCE((SELECT SUM(d.amount) FROM clan_donations d
      WHERE d.clan_id=m.clan_id AND d.donor_jid=m.jid),0)::bigint AS donated,
    (SELECT COUNT(*)::int FROM clan_coop_raid_credits r
      WHERE r.clan_id=m.clan_id AND r.jid=m.jid) AS coop_wins
  FROM clan_members m JOIN clans c ON c.id=m.clan_id
  WHERE m.jid=ANY($1::text[])`,[ids]);
 return rows;
}

export async function clanMemberParticipation(client,jid){
 if(!jid)return {member:false,donated:0,coopWins:0,eligible:false};
 const row=(await clanMembershipRows(client,[jid]))[0];
 if(!row)return {member:false,donated:0,coopWins:0,eligible:false};
 const status={member:true,clanId:row.clan_id,donated:safe(row.donated),
   coopWins:safe(row.coop_wins)};
 return {...status,eligible:clanMemberEligible(status)};
}

export async function clanBenefitsForUser(client,jid){
 if(!jid)return clanBenefits(1);
 const found=await clanBenefitsForPlayers(client,[jid]);
 return found.get(jid)||clanBenefits(1);
}

export async function clanBenefitsForPlayers(client,jids=[]){
 const ids=[...new Set((jids||[]).filter(Boolean))];
 if(!ids.length)return new Map();
 const all=new Map(ids.map(jid=>[jid,clanBenefits(1)]));
 for(const row of await clanMembershipRows(client,ids)){
  const qualifies=clanMemberEligible({donated:row.donated,coopWins:row.coop_wins});
  if(qualifies)all.set(row.jid,clanBenefits(clanLevelFromXp(row.xp)));
 }
 return all;
}

// Uma vitoria valida conta uma vez por jogador e por sala. Exige dois membros
// do MESMO cla, cada um contribuindo >=2% do dano real. Nao aceita RaidLote.
export async function recordClanCoopVictory(client,{raidKey,participants=[],manual=false}={}){
 if(!manual||!String(raidKey||'').trim())return 0;
 const eligible=Array.isArray(participants)?participants:[];
 const total=eligible.reduce((n,p)=>n+Math.max(0,Number(p?.damage||0)),0);
 if(total<=0)return 0;
 const ids=[...new Set(eligible.filter(p=>p?.jid&&Number(p.damage||0)>0&&
   Number(p.damage||0)/total>=.02).map(p=>p.jid))];
 if(ids.length<2)return 0;
 const {rows}=await client.query(`
  WITH teammates AS (
    SELECT m.clan_id,m.jid FROM clan_members m WHERE m.jid=ANY($1::text[])
  ), cooperating_clans AS (
    SELECT clan_id FROM teammates GROUP BY clan_id
    HAVING COUNT(DISTINCT jid)>=2
  )
  INSERT INTO clan_coop_raid_credits(clan_id,jid,raid_key)
  SELECT t.clan_id,t.jid,$2 FROM teammates t
  JOIN cooperating_clans c ON c.clan_id=t.clan_id
  ON CONFLICT DO NOTHING RETURNING jid`,[ids,String(raidKey)]);
 return rows.length;
}

export function formatClanMemberParticipation(status={}){
 const donated=safe(status.donated);
 const raids=safe(status.coopWins);
 const label=status.eligible?'✅ Bônus liberados para você':'🔒 Bônus ainda bloqueados para você';
 return `${label}\n🤝 Para ativar: doe R$ ${CLAN_DONATION_UNLOCK.toLocaleString('pt-BR')} ao clã *ou* participe de ${CLAN_COOP_UNLOCK} Raids manuais vitoriosas com outro membro.\n📌 Sua contribuição: R$ ${donated.toLocaleString('pt-BR')} • Raids cooperativas: ${Math.min(CLAN_COOP_UNLOCK,raids)}/${CLAN_COOP_UNLOCK}`;
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
