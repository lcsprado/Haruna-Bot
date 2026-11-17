// UI reduzida da prévia beta: uma mensagem do bot por Guardião, editada
// a cada decisão do mesmo jogador. Não altera ações nem créditos.
import {pocoBossSkill} from './poco-abismo-rules.js'
import {pocoDispatchActionPrompt} from './poco-abismo-delivery.js'

// Preserve a mesma mensagem original entre edições. Uma edição produz sua
// própria chave Baileys, mas a próxima edição deve mirar o balão ORIGINAL.
// Caso a edição não seja aceita, envia nova mensagem (deadline só após ACK).
export async function pocoBetaDispatchPrompt({reply,message,token,uiEdit,confirm}){
 let lastKey=null,edited=false
 const send=async text=>{
   if(uiEdit?.key?.id){
     try{
       const sent=await reply(text,{edit:uiEdit.key})
       if(sent?.key?.id){
         lastKey=uiEdit.key
         edited=true
         return sent
       }
     }catch(error){
       console.warn('[POCO BETA] edição falhou; enviando novo prompt',String(error?.message||error).slice(0,110))
     }
   }
   const sent=await reply(text)
   lastKey=sent?.key?.id?sent.key:null
   edited=false
   return sent
 }
 return pocoDispatchActionPrompt({
   reply:send,message,token,
   confirm:(tok,sentAt)=>confirm(tok,sentAt,lastKey?.id?{
     key:lastKey,at:edited?uiEdit.at:sentAt
   }:null)
 })
}

const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const shortName=x=>String(x||'Jogador').replace(/[\r\n\t*]/g,' ').trim().slice(0,28)
const EDIT_WINDOW_MS=12*60*1000

export function pocoBetaEditTarget(session,chat,floor,now=Date.now()){
 const u=session?.uiPrompt
 if(!u?.key?.id||u.key.remoteJid!==chat||u.key.fromMe!==true||
   session?.chat!==chat||u.floor!==floor||
   !Number.isFinite(u.at)||now<u.at||now-u.at>=EDIT_WINDOW_MS)return null
 return {key:u.key,at:u.at}
}

export function pocoBetaCompactPrompt({state,name,recap='',defeated=0,drop=''}={}){
 if(state?.status!=='active'||!state?.boss)return '🏁 Combate encerrado.'
 const b=state.boss
 const skill=pocoBossSkill(b.floor,b.turn)
 const head='🏰 *POÇO* • '+shortName(name)+' • G'+b.floor+'/30'
 const summary='❤️'+fmt(state.hp)+'/'+fmt(state.stats.maxHp)+
   ' 🧪'+state.potions+' ✨'+state.skillCharges+' • 👹'+fmt(b.hp)+'/'+fmt(b.maxHp)
 const notice=(defeated?'✅ G'+defeated+' vencido • ':'')+(recap?recap+' • ':'')+(drop?'🎲'+drop+' • ':'')
 return head+'\n'+summary+'\n'+notice+'⚠️ *'+skill.name+'*'+
   '\n1⚔️ Atacar  2🛡️ Defender  3🧪 Curar  4✨ Técnica  • 120s'
}

export function pocoBetaCompactEnd({name,report,recap='',defeated=0,drop=''}={}){
 const reason={death:'Derrota',timeout:'Tempo esgotado',abandoned:'Desistência',completed:'Concluído',season_closed:'Temporada encerrada'}[report?.reason]||'Encerrado'
 const label=report?.reason==='completed'?'✅':'🏁'
 return label+' *POÇO* • '+shortName(name)+' • '+reason+
   '\n🏰 Andar '+fmt(report?.floor)+'/30 • '+fmt(report?.turns)+' rodadas • ❤️'+fmt(report?.hp)+'/'+fmt(report?.maxHp)+
   '\n'+(defeated?'✅ G'+defeated+' • ':'')+(recap?recap+' • ':'')+(drop?'🎲'+drop+' • ':'')+
   '🧪'+fmt(report?.potions)+' • !poco iniciar'
}
