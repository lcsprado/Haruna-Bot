// Continuação Halloween: Altar original reabre às 18h com cinco equipamentos e quatro consumíveis/caixas.
export const AFTERPARTY_START=Date.parse('2026-11-01T13:00:00-03:00')
export const AFTERPARTY_SHOP_START=Date.parse('2026-11-01T18:00:00-03:00')
export const AFTERPARTY_SHOP_END=Date.parse('2026-11-03T00:00:00-03:00')
export const AFTERPARTY_ANNOUNCE=Date.parse('2026-10-31T00:00:00-03:00')
export const HALLOWEEN_ALTAR_NEW_GEAR=Object.freeze([
 Object.freeze({id:'halloween_espada_caveira_20261101',command:'espada',name:'💀 Espada da Caveira',category:'weapon',atk:155,def:0,hp:40,spd:0,crit:.04,cost:650,short:'+155 ATK, +40 HP e +4% CRIT'}),
 Object.freeze({id:'halloween_foice_ceifador_20261101',command:'foice',name:'⚰️ Foice do Ceifador',category:'weapon',atk:166,def:0,hp:0,spd:9,crit:.03,cost:760,short:'+166 ATK, +9 VEL e +3% CRIT'}),
 Object.freeze({id:'halloween_armadura_catacumbas_20261101',command:'armadura',name:'🦴 Armadura das Catacumbas',category:'armor',atk:0,def:192,hp:450,spd:0,crit:.015,cost:720,short:'+192 DEF, +450 HP e +1,5% CRIT'}),
 Object.freeze({id:'halloween_elmo_rei_morto_20261101',command:'elmo',name:'👑 Elmo do Rei Morto',category:'helmet',atk:0,def:120,hp:320,spd:0,crit:.02,cost:580,short:'+120 DEF, +320 HP e +2% CRIT'}),
 Object.freeze({id:'halloween_botas_arauto_20261101',command:'botas',name:'🔥 Botas do Arauto',category:'boots',atk:0,def:0,hp:110,spd:18,crit:.015,cost:540,short:'+18 VEL, +110 HP e +1,5% CRIT'})
])
export const HALLOWEEN_ALTAR_GEAR_IDS=Object.freeze(HALLOWEEN_ALTAR_NEW_GEAR.map(g=>g.id))
export const AFTERPARTY_OFFERS=Object.freeze({
 suprimentos:Object.freeze({id:'suprimentos',name:'🧪 Kit de Sobrevivência',cost:60,itemId:'pocao_pet_full',quantity:2,detail:'2 Poções Full Pet'}),
 elixires:Object.freeze({id:'elixires',name:'✨ Kit de Elixires',cost:100,itemId:'elixir_supremo',quantity:2,detail:'2 Elixires Supremos'}),
 epicas:Object.freeze({id:'epicas',name:'🟣 Reserva Épica',cost:160,itemId:'caixa_epica',quantity:2,detail:'2 Caixas Épicas'}),
 lendaria:Object.freeze({id:'lendaria',name:'🟠 Herança das Almas',cost:220,itemId:'caixa_lendaria',quantity:1,detail:'1 Caixa Lendária garantida'}),
 ...Object.fromEntries(HALLOWEEN_ALTAR_NEW_GEAR.map(g=>[g.id,Object.freeze({id:g.id,command:g.command,name:g.name,cost:g.cost,itemId:g.id,quantity:1,detail:g.short})]))
})
const aliases={suprimento:'suprimentos',suprimentos:'suprimentos',kit:'suprimentos',
 elixir:'elixires',elixires:'elixires',epica:'epicas',epicas:'epicas',lendaria:'lendaria',lenda:'lendaria',
 espada:'halloween_espada_caveira_20261101',caveira:'halloween_espada_caveira_20261101',
 foice:'halloween_foice_ceifador_20261101',ceifador:'halloween_foice_ceifador_20261101',
 armadura:'halloween_armadura_catacumbas_20261101',catacumbas:'halloween_armadura_catacumbas_20261101',
 elmo:'halloween_elmo_rei_morto_20261101',rei:'halloween_elmo_rei_morto_20261101',
 botas:'halloween_botas_arauto_20261101',arauto:'halloween_botas_arauto_20261101'}
export const afterpartyShopOpen=(now=Date.now())=>now>=AFTERPARTY_SHOP_START&&now<AFTERPARTY_SHOP_END
export const afterpartyOffer=(text='')=>{
 const key=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
 return AFTERPARTY_OFFERS[aliases[key]||key]||null
}
export function afterpartyShopCatalog(){
 return Object.values(AFTERPARTY_OFFERS).map(x=>x.name+' — *'+x.cost+' Almas*\n'+x.detail+
  '\n👉 *!halloween trocar '+(x.command||x.id)+'*').join('\n\n')
}
export const afterpartyAnnouncement=()=>[
 '🎃🔥 *2× ALMAS DE HALLOWEEN ATIVADO AGORA!*',
 '📅 Sábado, *31/10* (horário de São Paulo).',
 '⚔️ A partir de agora, marcos e vitórias dos Bosses de Halloween rendem *Almas em dobro*!',
 '🧩 Marcos: *8 Almas* • Vitória: *16 Almas* (para participantes elegíveis).',
 '👉 Participe com *!halloween entrar* (renovação por hora).',
 '',
 '💀 O evento de Almas em dobro continua amanhã, *01/11*, com Boss extra a partir das *13h*!',
 '🛍️ *18h de domingo*: o *ALTAR DAS ALMAS REABRE COM NOVOS ITENS*!',
 '⚔️ 5 EQUIPAMENTOS NOVOS: Espada da Caveira, Foice do Ceifador, Armadura das Catacumbas, Elmo do Rei Morto e Botas do Arauto.',
 '🎁 Também entram kits de poções, elixires e caixas. Equipamentos próximos dos Sete Pecados!',
 '💀 Almas e compras anteriores preservadas. Os resgates únicos não reiniciam.',
 '📍 Avisos só no grupo AlphaBot.',
 '🎃 A loja atual continua até domingo às 12h.'
].join('\n')
export const afterpartyStartAnnouncement=()=>[
 '⚔️🎃 *CAÇADA DAS ALMAS RENASCIDAS COMEÇOU!*',
 '🕐 Domingo 01/11, *13h–23h59* (São Paulo).',
 '🔥 *TODAS AS ALMAS DROPADAS NOS MARCOS E VITÓRIAS ESTÃO EM DOBRO!*',
 '🧩 8 Almas por marco • 16 por vitória, respeitando a participação mínima.',
 '👉 Use *!halloween entrar* para participar. Renove a sessão a cada hora.',
 '🛍️ O mesmo *Altar das Almas* reabre com mais itens às *18h*. Saldo preservado.'
].join('\n')
export const afterpartyOpenAnnouncement=()=>[
 '🛍️🎃 *ALTAR DAS ALMAS REABERTO COM NOVOS ITENS!*',
 '⏰ Domingo 01/11, *18h*, até segunda 02/11 às 23h59 (São Paulo).',
 '🧩 Mesma loja, com prêmios antigos e novos. Confira *!halloween loja*.',
 '⚔️ 5 equipamentos exclusivos novos, incluindo a Espada da Caveira!',
 '🎁 Novos kits e caixas. Consulte valores e atributos em *!halloween loja*.',
 '🔥 Boss de Almas em dobro continua até 23h59 de hoje. Compras anteriores não reiniciam.'
].join('\n')
