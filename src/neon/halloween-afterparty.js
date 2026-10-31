// Continuação Halloween. A nova loja usa as Almas existentes e abre às 18h.
export const AFTERPARTY_START=Date.parse('2026-11-01T13:00:00-03:00')
export const AFTERPARTY_SHOP_START=Date.parse('2026-11-01T18:00:00-03:00')
export const AFTERPARTY_SHOP_END=Date.parse('2026-11-03T00:00:00-03:00')
export const AFTERPARTY_ANNOUNCE=Date.parse('2026-10-31T00:00:00-03:00')
export const AFTERPARTY_OFFERS=Object.freeze({
 suprimentos:Object.freeze({id:'suprimentos',name:'🧪 Kit de Sobrevivência',cost:60,itemId:'pocao_pet_full',quantity:2,detail:'2 Poções Full Pet'}),
 elixires:Object.freeze({id:'elixires',name:'✨ Kit de Elixires',cost:100,itemId:'elixir_supremo',quantity:2,detail:'2 Elixires Supremos'}),
 epicas:Object.freeze({id:'epicas',name:'🟣 Reserva Épica',cost:160,itemId:'caixa_epica',quantity:2,detail:'2 Caixas Épicas'}),
 lendaria:Object.freeze({id:'lendaria',name:'🟠 Herança das Almas',cost:220,itemId:'caixa_lendaria',quantity:1,detail:'1 Caixa Lendária garantida'})
})
const aliases={suprimento:'suprimentos',suprimentos:'suprimentos',kit:'suprimentos',
 elixir:'elixires',elixires:'elixires',epica:'epicas',epicas:'epicas',lendaria:'lendaria',lenda:'lendaria'}
export const afterpartyShopOpen=(now=Date.now())=>now>=AFTERPARTY_SHOP_START&&now<AFTERPARTY_SHOP_END
export const afterpartyOffer=(text='')=>AFTERPARTY_OFFERS[aliases[String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()]||'']||null
export function afterpartyShopCatalog(){
 return Object.values(AFTERPARTY_OFFERS).map(x=>x.name+' — *'+x.cost+' Almas*\n'+x.detail+
  '\n👉 *!halloween trocar '+x.id+'*').join('\n\n')
}
export const afterpartyAnnouncement=()=>[
 '🎃 *HALLOWEEN ALPHA — EVENTO EXTRA AMANHÃ!*',
 '📅 Domingo, *01/11* (horário de São Paulo).',
 '⚔️ *13h*: começa a CAÇADA DAS ALMAS RENASCIDAS!',
 '🔥 *ALMAS EM DOBRO* durante todo o Boss, até 23h59.',
 '🧩 Marcos: 8 Almas • Vitória: 16 Almas (para elegíveis).',
 '👉 Para entrar: *!halloween entrar* (renove a cada hora).',
 '',
 '🛍️ *18h*: abre a NOVA LOJA DAS ALMAS RENASCIDAS!',
 '🎁 Poções, elixires e Caixas Épicas/Lendárias.',
 '💀 Seu saldo antigo de Almas continua valendo. Compras não serão zeradas.',
 '📍 Avisos só no grupo AlphaBot.',
 '🎃 A loja atual continua até domingo às 12h.'
].join('\n')
export const afterpartyStartAnnouncement=()=>[
 '⚔️🎃 *CAÇADA DAS ALMAS RENASCIDAS COMEÇOU!*',
 '🕐 Domingo 01/11, *13h–23h59* (São Paulo).',
 '🔥 *TODAS AS ALMAS DROPADAS NOS MARCOS E VITÓRIAS ESTÃO EM DOBRO!*',
 '🧩 8 Almas por marco • 16 por vitória, respeitando a participação mínima.',
 '👉 Use *!halloween entrar* para participar. Renove a sessão a cada hora.',
 '🛍️ Nova loja de Almas abre às *18h*; o saldo anterior será preservado.'
].join('\n')
export const afterpartyOpenAnnouncement=()=>[
 '🛍️🎃 *LOJA DAS ALMAS RENASCIDAS ABERTA!*',
 '⏰ Domingo 01/11, *18h*, até segunda 02/11 às 23h59 (São Paulo).',
 '🧩 Saldo antigo preservado. Confira *!halloween loja*.',
 '🎁 Kits de poções, elixires e Caixas Épicas/Lendárias.',
 '🔥 Boss de Almas em dobro continua até 23h59 de hoje.'
].join('\n')
