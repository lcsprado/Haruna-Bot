// Additional beta invitations are explicit per-player phone JIDs.
// This never changes session identity or admits an unresolved WhatsApp LID.
export function additionalBetaJidAllowed(jid,rawAllowlist=''){
  const identity=String(jid||'')
  if(!/^\d{10,15}@s\.whatsapp\.net$/.test(identity))return false
  return String(rawAllowlist||'').split(',').map(v=>v.trim()).includes(identity)
}
