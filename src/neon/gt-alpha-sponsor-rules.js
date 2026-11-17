// Regras puras de patrocínio do GT Alpha, sem acesso ao banco.
import {rebootEconomyEnabled} from './reboot-economy-policy.js'
export const GT_SPONSORS=Object.freeze([
 {id:'oficina',name:'🧰 AutoCenter Alpha',goal:3,measure:'etapas',reward:'1 reparo com até R$ 200.000 de desconto',kind:'repair',cap:200000},
 {id:'pitstop',name:'🔧 Pit Stop Oficial',goal:3,measure:'pódios em provas',reward:'30% de desconto na próxima melhoria, limitado a R$ 300.000',kind:'upgrade',cap:300000},
 {id:'turbo',name:'🏁 TurboMax',goal:2,measure:'vitórias em provas',reward:'R$ 500.000 uma única vez',kind:'cash',cap:500000}
])
// C4f: prêmios compatíveis com o GT V2, sem alterar contratos históricos V1.
export const V2_GT_SPONSOR_BUDGET=Object.freeze({
 oficina:Object.freeze({cap:5_000,reward:'1 reparo com até R$ 5.000 de desconto'}),
 pitstop:Object.freeze({cap:10_000,reward:'20% de desconto na próxima melhoria, limitado a R$ 10.000'}),
 turbo:Object.freeze({cap:5_000,reward:'R$ 5.000 uma única vez'})
});
export function gtEffectiveSponsor(id,{enabled=rebootEconomyEnabled()}={}){
 const base=GT_SPONSORS.find(x=>x.id===id)||null;
 if(!base||!enabled)return base;
 const budget=V2_GT_SPONSOR_BUDGET[id];
 if(!budget)throw new Error('Patrocínio sem orçamento V2');
 return {...base,...budget};
}
export function gtEffectiveSponsorCatalog({enabled=rebootEconomyEnabled()}={}){
 return GT_SPONSORS.map(s=>gtEffectiveSponsor(s.id,{enabled}));
}
export function gtSponsorIncrement(id,heats,jid){
 if(id==='oficina')return 1
 if(id==='pitstop')return heats.filter(h=>h.positions.some(p=>p.jid===jid&&p.place<=3)).length
 if(id==='turbo')return heats.filter(h=>h.positions[0]?.jid===jid).length
 return 0
}
export function gtSponsorDiscount(id,cost,{enabled=rebootEconomyEnabled()}={}){
 const value=Math.max(0,Math.floor(Number(cost)||0));
 const cap=gtEffectiveSponsor(id,{enabled})?.cap||0;
 if(id==='oficina')return Math.min(cap,value);
 if(id==='pitstop')return Math.min(cap,Math.floor(value*(enabled ? .20 : .30)));
 return 0;
}

// Atalhos do menu WhatsApp, sem depender de ordenação de banco ou texto livre.
export const GT_SPONSOR_NUMBER_IDS=Object.freeze({'1':'oficina','2':'pitstop','3':'turbo'})
export function gtSponsorOption(input){
 const value=String(input??'').trim().toLowerCase()
 return GT_SPONSOR_NUMBER_IDS[value] || (GT_SPONSORS.some(s=>s.id===value)?value:null)
}
