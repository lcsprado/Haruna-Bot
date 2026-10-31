import {HALLOWEEN_SHOP_END} from './halloween-rules.js'
import {AFTERPARTY_SHOP_START,AFTERPARTY_SHOP_END} from './halloween-afterparty.js'

export const HALLOWEEN_ALTAR_START=Date.parse('2026-10-31T00:00:00-03:00')
export const HALLOWEEN_INSIGNIA_ID='insignia_noite_eterna_halloween_20261031'
export const HALLOWEEN_TITLE_ID='titulo_soberano_almas_halloween_20261031'
export const HALLOWEEN_CHEST_ID='bau_supremo_halloween_20261031'
export const HALLOWEEN_TROPHY_ID='trofeu_vigia_noite_halloween_20261031'

// O Corcel continua com o preço e a regra de resgate já publicados.
// Cada novo resgate é único por jogador, inclusive caixas e baú.
export const HALLOWEEN_ALTAR_OFFERS=Object.freeze({
 caixa:Object.freeze({
  id:'caixa',name:'🎁 Caixa Lendária — edição Halloween',cost:150,
  itemId:'caixa_lendaria',quantity:1,
  detail:'Caixa Lendária garantida; abre normalmente em !caixas.'
 }),
 insignia:Object.freeze({
  id:'insignia',name:'💀 Insígnia da Noite Eterna',cost:250,
  itemId:HALLOWEEN_INSIGNIA_ID,quantity:1,
  detail:'+4% de dano e +1 p.p. de CRIT em Boss/Raid. Equipe em !reliquias; sem PvP.'
 }),
 titulo:Object.freeze({
  id:'titulo',name:'👑 Título Soberano das Almas',cost:400,
  itemId:HALLOWEEN_TITLE_ID,quantity:1,
  detail:'Título permanente: +10% de EXP de jogador e pets em Boss/Raid. Passivo, sem equipar e sem PvP.'
 }),
 bau:Object.freeze({
  id:'bau',name:'🔮 Baú Supremo de Halloween',cost:600,
  itemId:HALLOWEEN_CHEST_ID,quantity:1,
  detail:'Abra em !halloween abrir bau: 4 Caixas Lendárias, 4 Épicas, 2 Poções Full Pet e troféu exclusivo.'
 })
})

// Baú abre sem sorteio oculto: conteúdo garantido; todos recebem exatamente
// o mesmo pacote. Não concede equipamento acima dos exclusivos das collabs.
export const HALLOWEEN_CHEST_CONTENTS=Object.freeze([
 Object.freeze({itemId:'caixa_lendaria',quantity:4,name:'Caixa Lendária'}),
 Object.freeze({itemId:'caixa_epica',quantity:4,name:'Caixa Épica'}),
 Object.freeze({itemId:'pocao_pet_full',quantity:2,name:'Poção Full de Pet'}),
 Object.freeze({itemId:HALLOWEEN_TROPHY_ID,quantity:1,name:'Troféu Vigia da Noite'})
])

export const HALLOWEEN_ALTAR_ITEMS=Object.freeze([
 Object.freeze({
  id:HALLOWEEN_INSIGNIA_ID,name:'💀 Insígnia da Noite Eterna',
  description:'Insígnia exclusiva do Halloween 2026. Equipável via !reliquias. +4% dano e +1 p.p. CRIT Boss/Raid; sem PvP e não acumula com outra insígnia.',
  rarity:'event'
 }),
 Object.freeze({
  id:HALLOWEEN_TITLE_ID,name:'👑 Soberano das Almas',
  description:'Título permanente do Halloween 2026, exibido no perfil. Passiva independente: +10% de EXP do jogador e time pet nas recompensas de Boss/Raid, sem PvP.',
  rarity:'event'
 }),
 Object.freeze({
  id:HALLOWEEN_CHEST_ID,name:'🔮 Baú Supremo de Halloween',
  description:'Abra por !halloween abrir bau. Contém 4 Caixas Lendárias, 4 Caixas Épicas, 2 Poções Full Pet e um Troféu Vigia da Noite.',
  rarity:'legendary'
 }),
 Object.freeze({
  id:HALLOWEEN_TROPHY_ID,name:'🏆 Troféu Vigia da Noite',
  description:'Troféu cosmético exclusivo de quem abriu o Baú Supremo de Halloween 2026. Sem atributos de combate.',
  rarity:'event'
 })
])

const ALIASES=Object.freeze({
 caixa:'caixa',lendaria:'caixa',lendária:'caixa',box:'caixa',
 insignia:'insignia',insígnia:'insignia',reliquia:'insignia',relíquia:'insignia',
 titulo:'titulo',título:'titulo',
 bau:'bau',baú:'bau',supremo:'bau'
})

export function halloweenAltarOffer(raw){
 return HALLOWEEN_ALTAR_OFFERS[ALIASES[String(raw||'').toLowerCase().trim()]]||null
}
export function halloweenAltarOpen(now=Date.now()){
 const at=Number(now)
 return (at>=HALLOWEEN_ALTAR_START&&at<HALLOWEEN_SHOP_END)||
  (at>=AFTERPARTY_SHOP_START&&at<AFTERPARTY_SHOP_END)
}
export function halloweenAltarCatalogText(){
 return Object.values(HALLOWEEN_ALTAR_OFFERS).map(o=>
  o.name+' — *'+o.cost+' Almas*\n'+o.detail+'\n👉 *!halloween trocar '+o.id+'*'
 ).join('\n\n')
}

 // Título é uma passiva permanente, independente de !reliquias e sem PvP.
 // Apenas EXP de recompensas PvE (Boss e Raid), jamais EXP de classe, PvP,
 // profissão, trabalho, minigames ou de outros sistemas.
export const HALLOWEEN_TITLE_XP_BONUS=0.10
export function halloweenTitleBonusXp(amount,owned=false){
 const base=Math.max(0,Math.floor(Number(amount)||0))
 return owned?Math.round(base*(1+HALLOWEEN_TITLE_XP_BONUS)):base
}
export async function ownsHalloweenTitle(queryable,jid){
 const result=await queryable.query(
  'SELECT 1 FROM inventories WHERE jid=$1 AND item_id=$2 AND quantity>0 LIMIT 1',
  [jid,HALLOWEEN_TITLE_ID])
 return result.rowCount>0||Boolean(result.rows?.length)
}
