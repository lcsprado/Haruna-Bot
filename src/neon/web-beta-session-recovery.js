// A direct-message !web code has no group id. Recover the ONE group already
// bound to a valid session for THIS SAME authenticated player's JID, but only
// after rechecking the current beta clan authorization on the server.
// Never infer identity from a displayed name, an IP, or another user's token.
export async function recoverAuthorizedBetaGroup(client, jid, verifyGroup, nowMs=Date.now()) {
  const player=String(jid||'')
  if(!/^[0-9]+@s\.whatsapp\.net$/.test(player) || typeof verifyGroup!=='function')return null
  const result=await client.query(
    'SELECT DISTINCT chat_jid FROM web_sessions '+
    'WHERE jid=$1 AND chat_jid IS NOT NULL AND expires_at>$2 '+
    'ORDER BY chat_jid LIMIT 2',
    [player,nowMs]
  )
  const rows=result?.rows||[]
  if(rows.length!==1)return null
  const chat=String(rows[0]?.chat_jid||'')
  if(!/^[0-9-]+@g\.us$/.test(chat))return null
  return await verifyGroup(player,chat) ? chat : null
}
