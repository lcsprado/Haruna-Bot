// One-person, group-bound Web beta access for the missing founding Siege player.
// No phone number is hardcoded or logged; membership is verified in PostgreSQL.
const groupJid=()=>String(process.env.ALPHA_CLAN_SIEGE_GROUP_JID||'').trim();
const guestEnabled=()=>process.env.ALPHA_CLAN_SIEGE_BETA_GUEST==='1';
const clanIds=()=>{
  const tokens=String(process.env.ALPHA_CLAN_SIEGE_CLAN_IDS||'').split(',').map(x=>x.trim());
  return tokens.length===2&&tokens.every(x=>/^[1-9][0-9]*$/.test(x))&&tokens[0]!==tokens[1]?tokens:[];
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

async function currentRoster(conn,ids){
  return (await conn.query(
    'SELECT jid,clan_id FROM clan_members WHERE clan_id=ANY($1::bigint[]) ORDER BY clan_id,jid',
    [ids]
  )).rows;
}
async function boundGuest(conn,chat,jid=null){
  try{
    return (await conn.query(
      'SELECT jid FROM alpha_siege_beta_guest WHERE chat_jid=$1'+(jid?' AND jid=$2':''),
      jid?[chat,jid]:[chat]
    )).rows;
  }catch(err){
    if(err?.code==='42P01')return []; // No guest has linked a session yet.
    throw err;
  }
}
export async function siegeBetaGuestAccess(conn,{jid,chat,register=false}){
  if(!siegeBetaGuestConfigured()||String(chat)!==groupJid()||!String(jid||''))return false;
  const ids=clanIds(),allowed=configuredBetaJids();
  if(allowed.has(String(jid)))return true;
  const roster=await currentRoster(conn,ids);
  if(!isOnlyMissingSiegeMember(roster,ids,allowed,jid))return false;
  if(register){
    await conn.query([
      'CREATE TABLE IF NOT EXISTS alpha_siege_beta_guest(',
      'chat_jid TEXT PRIMARY KEY,jid TEXT NOT NULL UNIQUE,',
      'clan_id BIGINT NOT NULL,created_at BIGINT NOT NULL);'
    ].join(' '));
    const member=roster.find(x=>String(x.jid)===String(jid));
    await conn.query(
      'INSERT INTO alpha_siege_beta_guest(chat_jid,jid,clan_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [chat,jid,member.clan_id,Date.now()]
    );
  }
  const recorded=await boundGuest(conn,chat,jid);
  return recorded.length===1&&String(recorded[0].jid)===String(jid);
}
export async function siegeBetaAuthorizedSet(conn){
  const allow=configuredBetaJids();
  if(!siegeBetaGuestConfigured())return allow;
  const guests=await boundGuest(conn,groupJid());
  for(const x of guests)if(x.jid)allow.add(String(x.jid));
  return allow;
}
