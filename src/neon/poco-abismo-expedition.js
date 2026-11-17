// Expedicao do Poco: 30 andares reais, um chefe automatico por andar.
// Motor puro: nenhuma consulta SQL, credito, timer ou envio ao WhatsApp.
import {POCO_SEASON} from './poco-abismo-rules.js'

export const POCO_EXPEDITION=Object.freeze({
 id:'expedition-v1-20261117',
 baseHp:1000,baseAtk:100,baseDef:100,baseShield:100,
 upgrades:Object.freeze({1:'Recuperar 25% do HP',2:'+25% ataque-base',3:'+25% defesa-base',4:'+25% escudo-base'}),
 floorMinutes:Object.freeze({early:10,middle:15,late:20}),
 floors:30,
});
function rng(s){s.seed=(Math.imul(s.seed>>>0,1664525)+1013904223)>>>0;return s.seed/4294967296}
const cap=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function pocoExpFloorMs(floor){
 if(!Number.isInteger(floor)||floor<1||floor>30)throw new RangeError('Andar invalido')
 return (floor<=10?10:floor<=20?15:20)*60_000
}
export function pocoExpStart({seed=1,now=Date.now(),attempt=1}={}){
 if(!Number.isInteger(attempt)||attempt<1)throw new RangeError('Tentativa invalida')
 return {
  version:POCO_EXPEDITION.id,season:POCO_SEASON.id,attempt,phase:'exploring',floor:1,
  cleared:0,seed:seed>>>0,readyAt:now+pocoExpFloorMs(1),
  stats:{hp:1000,maxHp:1000,atk:100,def:100,shield:100,maxShield:100},
  last:null,startedAt:now,endedAt:null
 }
}
export function pocoExpDue(state,now=Date.now()){
 return state?.phase==='exploring'&&Number.isFinite(state.readyAt)&&now>=state.readyAt
}
export function pocoExpResolve(state,{now=Date.now()}={}){
 if(state?.version!==POCO_EXPEDITION.id)throw new Error('Expedicao invalida')
 if(state.phase!=='exploring')throw new Error('Andar sem exploracao ativa')
 if(!pocoExpDue(state,now))return {state,ready:false,remainingMs:state.readyAt-now}
 const s=structuredClone(state);
 const f=s.floor,v=s.stats;
 // Descobertas da exploracao; o restante e batalha inteiramente automatica.
 const discovery=rng(s);
 let event='nenhum achado';
 if(discovery<.12){
  const hit=Math.max(5,Math.round(12+f*2.1));
  const absorbed=Math.min(v.shield,hit);
  v.shield-=absorbed;v.hp=Math.max(0,v.hp-(hit-absorbed));
  event='armadilha: -'+hit+' pontos de protecao/vida';
 }else if(discovery<.23){
  const restore=Math.max(0,Math.round(v.maxHp*.10));
  v.hp=cap(v.hp+restore,0,v.maxHp);
  event='fonte restauradora';
 }else if(discovery<.33)event='bau antigo';
 const bossType=['Colosso','Caçador','Vigia','Carrasco','Tecelao'][(f-1)%5];
 const bossName=bossType+' do andar '+f;
 let bossHp=130+f*18;
 const bossMaxHp=bossHp;
 const bossAttack=25+f*5;
 let turns=0,damageTaken=0;
 while(bossHp>0&&v.hp>0&&turns<45){
  turns++;
  const damage=Math.max(1,Math.round(v.atk*(.85+rng(s)*.30)*(bossType==='Colosso'?.86:1)));
  bossHp-=damage;
  if(bossHp<=0)break;
  const variation=.87+rng(s)*.26;
  const bite=Math.max(1,Math.round(bossAttack*variation*
    (bossType==='Carrasco'?1.20:1)*(bossType==='Caçador'?1.08:1)*
    (100/(100+Math.max(0,v.def)))));
  const block=Math.min(v.shield,bite);
  v.shield-=block;const loss=bite-block;
  v.hp=Math.max(0,v.hp-loss);
  damageTaken+=loss;
 }
 const won=bossHp<=0&&v.hp>0;
 if(won)s.cleared=f;
 s.last={floor:f,bossName,bossMaxHp,turns,won,damageTaken,event,hp:v.hp,shield:v.shield};
 s.readyAt=null;
 if(!won){s.phase='ended';s.endedAt=now}
 else if(f===30){s.phase='completed';s.endedAt=now}
 else s.phase='choose';
 return {state:s,ready:true,won,clearedFloor:won?f:null,summary:s.last};
}
export function pocoExpAdvance(state,upgrade=1,{now=Date.now()}={}){
 if(state?.version!==POCO_EXPEDITION.id||state.phase!=='choose')throw new Error('Conclua o andar primeiro')
 const choice=Number(upgrade);
 if(!Number.isInteger(choice)||choice<1||choice>4)throw new RangeError('Escolha 1, 2, 3 ou 4')
 if(state.floor>=30)throw new Error('Poço concluido')
 const s=structuredClone(state),v=s.stats;
 if(choice===1)v.hp=cap(v.hp+Math.round(v.maxHp*.25),0,v.maxHp);
 if(choice===2)v.atk+=25;
 if(choice===3)v.def+=25;
 if(choice===4){v.maxShield+=25;v.shield=v.maxShield}
 s.floor+=1;s.phase='exploring';s.readyAt=now+pocoExpFloorMs(s.floor);
 s.lastUpgrade=choice;
 return s;
}
export function pocoExpStop(state,{now=Date.now()}={}){
 if(!state||!['exploring','choose'].includes(state.phase))throw new Error('Sem expedicao ativa')
 const s=structuredClone(state);s.phase='ended';s.readyAt=null;s.endedAt=now;
 return s
}
