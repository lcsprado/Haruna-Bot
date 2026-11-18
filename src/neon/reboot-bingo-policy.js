// Reboot C4g — especificação pura do Bingo semanal V2, SEM scheduler.
// A liberação necessita edição exclusiva no banco isolado e aprovação explícita.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
export const V2_BINGO=Object.freeze({
 ticket:500,cardLimit:1,weeklyEditions:1,numberCount:40,
 maxCardsPerEdition:64,maxJidLength:128,
 milestones:Object.freeze({
  row:Object.freeze({target:1,cash:1_500}),
  twoRows:Object.freeze({target:2,cash:2_500}),
  full:Object.freeze({target:3,cash:5_000})
 }),
 cashPackagePerCard:0, maxEmission:9_000,
 prizeType:'cash',trophySellable:false
});
export function assertBingoV2Release(env=process.env){
 if(!classesOnlyRebootEnabled(env)||
   String(env?.ALPHA_REBOOT_BINGO_RELEASE||'')!=='approved-isolated-v2'||
   String(env?.ALPHA_REBOOT_DB_CONFIRMED||'')!=='isolated-v2')
   throw new Error('Bingo V2 bloqueado sem modo V2, banco isolado e aprovação explícita');
 return true;
}
export function validateBingoV2Edition({id,startAt,endAt,now,otherStarts=[]}){
 if(!/^bingo_v2_\d{8}_(1600|1930)$/.test(String(id||'')))throw new Error('Edição Bingo V2 inválida');
 if(![startAt,endAt,now].every(Number.isSafeInteger)||startAt<=now||
    endAt<=startAt||endAt-startAt>4*60*60*1000)
    throw new Error('Janela de edição inválida');
 if(!Array.isArray(otherStarts)||otherStarts.some(x=>!Number.isSafeInteger(x)))
    throw new Error('Histórico de edições inválido');
 // O agendador deverá consultar a tabela única de edições antes de chamar essa função.
 if(otherStarts.some(x=>Math.abs(x-startAt)<7*24*60*60*1000))
    throw new Error('Bingo V2 limitado a uma edição por sete dias');
 return {id,startAt,endAt,ticketPrice:V2_BINGO.ticket,weeklyLimit:1};
}
export function bingoV2TicketEligibility({jid,entries=[],started=false}){
 if(typeof jid!=='string'||!jid.trim()||jid.length>V2_BINGO.maxJidLength||
    !Array.isArray(entries)||entries.some(e=>typeof e!=='string'||!e||e.length>V2_BINGO.maxJidLength))
    throw new Error('Jogadores inválidos');
 if(started)throw new Error('Inscrição do Bingo encerrada');
 if(entries.includes(jid))throw new Error('Apenas uma cartela por jogador na edição');
 if(entries.length>=V2_BINGO.maxCardsPerEdition)throw new Error('Bingo V2 atingiu limite de cartelas desta edição');
 return {allowed:true,cost:V2_BINGO.ticket};
}
export function planBingoV2Payouts({editionId, winners, settled={}}){
 if(!/^bingo_v2_\d{8}_(1600|1930)$/.test(String(editionId||''))||
    !Array.isArray(winners)||!settled||Array.isArray(settled)||typeof settled!=='object')
    throw new Error('Estado de premiação inválido');
 const milestones=Object.keys(V2_BINGO.milestones);
 if(Object.keys(settled).some(x=>!milestones.includes(x)))
    throw new Error('Premiação antiga incompatível com Bingo V2');
 const verified=new Set();
 const final=new Map(Object.entries(settled));
 for(const [name,jid]of final){
  if(typeof jid!=='string'||!jid.trim())
   throw new Error('Pagamento liquidado sem vencedor');
 }
 const payments=[];
 for(const row of winners){
  const milestone=String(row?.milestone||''),jid=row?.jid;
  if(!milestones.includes(milestone)||typeof jid!=='string'||!jid.trim())
    throw new Error('Vencedor não validado');
  if(verified.has(milestone))throw new Error('Prêmio duplicado nesta edição');
  verified.add(milestone);
  if(final.has(milestone)){
   if(final.get(milestone)!==jid)throw new Error('Conflito com prêmio já liquidado');
   continue;
  }
  final.set(milestone,jid);
  payments.push({jid,amount:V2_BINGO.milestones[milestone].cash,
   key:editionId+':'+milestone,milestone});
 }
 const total=[...final.keys()].reduce((a,k)=>a+V2_BINGO.milestones[k].cash,0);
 if(total>V2_BINGO.maxEmission)throw new Error('Bingo acima do limite de emissão');
 return {payments,totalEditionEmission:total,remainingBudget:V2_BINGO.maxEmission-total,
  resolved:Object.fromEntries(final)};
}
