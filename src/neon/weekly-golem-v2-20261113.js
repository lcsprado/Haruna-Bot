// Recompensas exclusivas da edição em andamento (13–14/11/2026).
// As regras são determinísticas; crédito, escolha e encerramento são transacionais.
export const WEEKLY_GOLEM_V2_KEY='2026-11-13'
export const WEEKLY_GOLEM_V2_VOUCHER='escolha_golem_ancestral_forja5_20261113'
export const WEEKLY_GOLEM_V2_MIN_DAMAGE=10_000
export const WEEKLY_GOLEM_V2_GEAR=Object.freeze([
 Object.freeze({id:'martelo_coracao_ancestral_20261113',name:'Martelo do Coração Ancestral',category:'weapon',atk:220,def:80,hp:0,spd:0,crit:.03,description:'Arma exclusiva do Superboss 13/11/2026. Entregue FORJADA ★★★★★, Lv.10.'}),
 Object.freeze({id:'armadura_tita_ancestral_golem_20261113',name:'Armadura do Titã Ancestral — Golem',category:'armor',atk:0,def:190,hp:550,spd:0,crit:0,description:'Armadura exclusiva do Superboss 13/11/2026. Entregue FORJADA ★★★★★, Lv.10.'}),
 Object.freeze({id:'elmo_soberano_pedra_20261113',name:'Elmo do Soberano de Pedra',category:'helmet',atk:0,def:135,hp:420,spd:0,crit:0,description:'Elmo exclusivo do Superboss 13/11/2026. Entregue FORJADO ★★★★★, Lv.10.'})
])
export const WEEKLY_GOLEM_V2_GEAR_IDS=Object.freeze(WEEKLY_GOLEM_V2_GEAR.map(i=>i.id))
const CASH_TOP=Object.freeze([12_000_000,10_000_000,8_000_000,6_000_000,5_000_000])
export function weeklyGolemV2Cash({weekendKey,position,damage}={}){
 if(String(weekendKey)!==WEEKLY_GOLEM_V2_KEY)return 0
 const rank=Number(position),total=Number(damage)
 if(!Number.isInteger(rank)||rank<1||!Number.isFinite(total)||total<WEEKLY_GOLEM_V2_MIN_DAMAGE)return 0
 return CASH_TOP[rank-1]??3_000_000
}
export function weeklyGolemV2Choice({weekendKey,position,damage}={}){
 return String(weekendKey)===WEEKLY_GOLEM_V2_KEY&&[1,2].includes(Number(position))&&weeklyGolemV2Cash({weekendKey,position,damage})>0
}
export function weeklyGolemV2GearSelection(value){
 const i=Number(value)
 return Number.isInteger(i)&&i>=1&&i<=WEEKLY_GOLEM_V2_GEAR.length?WEEKLY_GOLEM_V2_GEAR[i-1]:null
}
export function weeklyGolemV2Ranking(participants){
 return Object.entries(participants||{}).map(([jid,p])=>({
  jid,name:String(p?.name||'Jogador'),damage:Math.max(0,Number(p?.damage)||0),
  attacks:Math.max(0,Number(p?.attacks)||0)
 })).filter(p=>p.damage>0).sort((a,b)=>b.damage-a.damage||a.jid.localeCompare(b.jid))
}
