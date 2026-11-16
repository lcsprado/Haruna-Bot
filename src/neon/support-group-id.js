// Identificacao do grupo pela metadata autenticada do WhatsApp.
// Depois de resolvido, o controle usa somente o JID persistido, nao o nome.
export const SUPPORT_ONLY_PAGANTES_MESSAGE='suporte disponível apenas para pagantes'

export function isAlphaBotGroupSubject(subject){
if(typeof subject!=='string')return false
const normalized=subject.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()
return normalized==='alpha bot'
}

export function isSupportBlockedGroupJid(chatJid,blockedJid){
return typeof chatJid==='string'&&chatJid.endsWith('@g.us')&&
typeof blockedJid==='string'&&blockedJid.length>0&&chatJid===blockedJid
}
