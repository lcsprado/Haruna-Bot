// Acesso restrito ao único membro fundador de clã ainda fora da allowlist do Web beta.
// Sem expor JID, sem armazenar privilégios e sem abrir acesso a terceiros.
const groupJid=()=>String(process.env.ALPHA_CLAN_SIEGE_GROUP_JID||'').trim();
const guestEnabled=()=>process.env.ALPHA_CLAN_SIEGE_BETA_GUEST==='1';
const clanIds=()=>{
  const ids=String(process.env.ALPHA_CLAN_SIEGE_CLAN_IDS||'').split(',').map(x=>x.trim());
  return ids.length===2&&ids.every(x=>/^[1-9][0-9]*$/.test(x))&&ids[0]!==ids[1]?ids:[];
};
export const siegeBetaGuestConfigured=()=>
  guestEnabled()&&/^[0-9-]+@g\.us$/.test(groupJid())&&clanIds().length===2;
export const configuredBetaJids=()=>new Set(String(process.env.ALPHA_WEB_BETA_JIDS||'')
  .split(',').map(x=>x.trim()).filter(Boolean));

export function isOnlyMissingSiegeMember(rows,ids,allow,jid){
  const expected=new Set(ids.map(String));
  if(expected.size!==2||!Array.isArray(rows)||rows.length!==4)return false;
  const roster=new Set(),teams=new Map();
  for(const member of rows){
    const id=String(member.clan_id),idJid=String(member.jid);
    if(!expected.has(id)||!idJid||roster.has(idJid))return false;
    roster.add(idJid);
    teams.set(id,(teams.get(id)||0)+1);
  }
  if([...expected].some(id=>teams.get(id)!==2))return false;
  const missing=rows.map(x=>String(x.jid)).filter(x=>!allow.has(x));
  return missing.length===1&&missing[0]===String(jid);
}
async function roster(conn,ids){
  return (await conn.query(
    'SELECT jid,clan_id FROM clan_members WHERE clan_id=ANY($1::bigint[]) ORDER BY clan_id,jid',
    [ids]
  )).rows;
}
export async function siegeBetaGuestAccess(conn,{jid,chat}){
  if(!siegeBetaGuestConfigured()||String(chat)!==groupJid()||!String(jid||''))return false;
  const allowed=configuredBetaJids();
  if(allowed.has(String(jid)))return true;
  return isOnlyMissingSiegeMember(await roster(conn,clanIds()),clanIds(),allowed,jid);
}
export async function siegeBetaAuthorizedSet(conn){
  const allowed=configuredBetaJids();
  if(!siegeBetaGuestConfigured())return allowed;
  const members=await roster(conn,clanIds());
  const missing=members.filter(x=>!allowed.has(String(x.jid)));
  if(missing.length===1&&isOnlyMissingSiegeMember(members,clanIds(),allowed,missing[0].jid)){
    allowed.add(String(missing[0].jid));
  }
  return allowed;
}
