// Vínculos de identidade vêm exclusivamente de metadados autenticados do
// WhatsApp (não de pushName, menções arbitrárias ou números informados no chat).
const normalize = value => String(value || '').trim().replace(/:\d+(?=@)/, '')
export const canonicalLid = value => {
  const jid = normalize(value)
  return /^\d+@lid$/.test(jid) ? jid : null
}
export const canonicalPhone = value => {
  const jid = normalize(value)
  return /^\d+@s\.whatsapp\.net$/.test(jid) ? jid : null
}
export function pairFromGroupMember(member) {
  if (!member || typeof member !== 'object') return null
  const identities = [member.lid,member.phoneNumber,member.pn,member.id,member.jid]
  const lids = [...new Set(identities.map(canonicalLid).filter(Boolean))]
  const phones = [...new Set(identities.map(canonicalPhone).filter(Boolean))]
  return lids.length === 1 && phones.length === 1
    ? {lid:lids[0],phone:phones[0]}
    : null
}

export function createVerifiedLidDirectory(db, logger = console) {
  let ready = null
  const ensure = () => {
    if (!ready) {
      ready = db.query(
        'CREATE TABLE IF NOT EXISTS verified_whatsapp_lid_links (' +
        'lid_jid TEXT PRIMARY KEY, phone_jid TEXT NOT NULL, proof TEXT NOT NULL,' +
        'created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)'
      ).catch(error => {
        ready = null
        throw error
      })
    }
    return ready
  }

  const record = async (lidValue, phoneValue, proof) => {
    const lid = canonicalLid(lidValue)
    const phone = canonicalPhone(phoneValue)
    if (!lid || !phone || !['signed-message-alias','group-member-metadata','baileys-lid-mapping'].includes(proof)) return false
    await ensure()
    const ts = Math.floor(Date.now()/1000)
    const {rows} = await db.query(
      'INSERT INTO verified_whatsapp_lid_links(lid_jid,phone_jid,proof,created_at,updated_at) '+
      'VALUES($1,$2,$3,$4,$4) ON CONFLICT(lid_jid) DO UPDATE SET '+
      'proof=EXCLUDED.proof, updated_at=EXCLUDED.updated_at '+
      'WHERE verified_whatsapp_lid_links.phone_jid=EXCLUDED.phone_jid '+
      'RETURNING phone_jid',
      [lid,phone,proof,ts]
    )
    if (!rows[0]) logger.warn('[WhatsApp Identity] conflicting verified LID mapping quarantined')
    return Boolean(rows[0])
  }

  const lookup = async lidValue => {
    const lid = canonicalLid(lidValue)
    if (!lid) return null
    await ensure()
    const {rows} = await db.query(
      'SELECT phone_jid FROM verified_whatsapp_lid_links WHERE lid_jid=$1',
      [lid]
    )
    return canonicalPhone(rows[0]?.phone_jid)
  }

  const recoverFromActiveGroups = async (lidValue, sock) => {
    const lid = canonicalLid(lidValue)
    if (!lid) return null
    const {rows} = await db.query(
      "SELECT chat_jid FROM group_licenses WHERE status='active' AND chat_jid LIKE '%@g.us' LIMIT 20"
    )
    const matches = new Set()
    for (const row of rows) {
      try {
        const metadata = await sock.groupMetadata(row.chat_jid)
        for (const member of metadata?.participants || []) {
          const pair = pairFromGroupMember(member)
          if (pair?.lid === lid) matches.add(pair.phone)
        }
      } catch (error) {
        logger.warn('[WhatsApp Identity] group metadata lookup unavailable',String(error?.message || error).slice(0,100))
      }
    }
    if (matches.size !== 1) {
      if (matches.size > 1) logger.warn('[WhatsApp Identity] conflicting group metadata, refusing auto-link')
      return null
    }
    const phone = [...matches][0]
    return await record(lid,phone,'group-member-metadata') ? phone : null
  }

  return {record,lookup,recoverFromActiveGroups}
}
