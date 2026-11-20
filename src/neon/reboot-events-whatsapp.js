// WhatsApp: comandos tradicionais e aliases V2 usam exclusivamente o novo serviço.
// Nunca inicia sorteio, agenda edição ou ativa socket paralelo.
import {db,getGroupLicense,groupLicenseIsActive} from './db.js';
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
import {bingoV2Status,buyBingoV2Ticket,auctionV2Status,bidAuctionV2}
 from './reboot-events-service.js';
const money=x=>'R$ '+Number(x).toLocaleString('pt-BR');
const COMMAND_ALIASES=Object.freeze({bingo:'bingov2',cartela:'cartelav2',leilao:'leilaov2',lance:'lancev2'});
export function rebootEventCommand(cmd){return Object.hasOwn(COMMAND_ALIASES,cmd)?COMMAND_ALIASES[cmd]:cmd;}
export async function handleRebootEventsCommand({cmd,args=[],sender,chat,reply}){
 if(!classesOnlyRebootEnabled())return false;
 cmd=rebootEventCommand(cmd);
 if(!['bingov2','cartelav2','leilaov2','lancev2'].includes(cmd))return false;
 if(!String(chat||'').endsWith('@g.us')){
   await reply('🔒 Os eventos V2 exigem grupo vinculado e licenciado.');
   return true;
 }
 const license=await getGroupLicense(chat);
 if(!groupLicenseIsActive(license)){
   await reply('🔒 O grupo não possui licença ativa.');
   return true;
 }
 try{
   if(cmd==='bingov2'){
     const r=await buyBingoV2Ticket(db,sender);
     await reply((r.alreadyOwned?'🎟️ Cartela já registrada.':'✅ Cartela V2 comprada por R$ 500.')+
       '\n🗓️ Edição: '+r.id+'\n🎫 Sua cartela: '+
       (r.card||[]).map(n=>n===null?'LIV':String(n).padStart(2,'0')).join(' · ')+
       '\n🏆 Prêmio total do evento: '+money(9000)+'.');
   }else if(cmd==='cartelav2'){
     const s=await bingoV2Status(db,sender);
     await reply(!s.available?'🎟️ Bingo V2 ainda não agendado.':
       '🎟️ Bingo V2: '+s.phase+' • '+s.id+
       '\n🎫 '+(s.card?s.card.map(n=>n===null?'LIV':n).join(' · '):'Sem cartela. Use !bingov2')+
       '\n🔢 Bolas: '+s.drawn.length+'/40');
   }else if(cmd==='leilaov2'){
     const s=await auctionV2Status(db);
     await reply(!s.available?'🔨 Leilão V2 ainda não agendado.':
       '🔨 Leilão V2: '+s.phase+' • '+s.id+
       '\n🎁 '+(s.lot?.itemId||'Sem lote')+
       '\n💰 Próximo lance: '+money(s.nextMinimum||0)+
       '\n📩 Lance: !lancev2 VALOR');
   }else{
     const amount=Number(args[0]);
     if(!Number.isSafeInteger(amount)||amount<500||args.length!==1)
       throw Error('Use !lancev2 VALOR, sem abreviações');
     const r=await bidAuctionV2(db,sender,amount);
     await reply('✅ Lance V2 registrado: '+money(r.amount)+
       ' • '+r.lotId+'. A disputa usa o mesmo banco da Web.');
   }
 }catch(err){
   await reply('⛔ '+String(err?.message||'Ação indisponível').slice(0,180));
 }
 return true;
}
