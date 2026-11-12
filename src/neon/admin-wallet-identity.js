// Administrative credits must target the canonical, verified WhatsApp phone JID.
// Raw group mention identifiers (@lid) are not playable accounts and must not
// create detached wallets, even when a menu mistakenly passes one through.
export function requireVerifiedAdminWalletJid(jid){
  const value=String(jid||'').trim();
  if(!/^\d{10,15}@s\.whatsapp\.net$/.test(value)){
    throw new Error('⚠️ Destinatário sem número de WhatsApp verificado. Peça que a pessoa use !saldo no grupo e tente novamente. Nenhum saldo foi alterado.');
  }
  return value;
}
