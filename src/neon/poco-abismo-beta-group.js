// Escopo do piloto: somente o nome autenticado pelo WhatsApp (não texto enviado pelo jogador).
export const POCO_BETA_GROUP_NAME='teste beta versao 1'
export function pocoBetaGroupAllowed({chat,subject}={}){
 if(typeof chat!=='string'||!chat.endsWith('@g.us'))return false
 if(typeof subject!=='string')return false
 const normalized=subject.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()
 return normalized===POCO_BETA_GROUP_NAME
}
