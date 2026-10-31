import {HALLOWEEN_SOUL_ID} from './halloween-rules.js'
export const AFTERPARTY_START=Date.parse('2026-11-01T13:00:00-03:00')
export const AFTERPARTY_RAID_END=Date.parse('2026-11-02T00:00:00-03:00')
export const AFTERPARTY_SHOP_END=Date.parse('2026-11-03T00:00:00-03:00')
export const AFTERPARTY_SOUL_CAP=120
export const AFTERPARTY_RAID_BASE_SOULS=12
export const AFTERPARTY_DOUBLE_WINDOWS=Object.freeze([
 [Date.parse('2026-11-01T14:00:00-03:00'),Date.parse('2026-11-01T16:00:00-03:00')],
 [Date.parse('2026-11-01T20:00:00-03:00'),Date.parse('2026-11-01T22:00:00-03:00')]
])
export const AFTERPARTY_OFFERS=Object.freeze({
 suprimentos:{id:'suprimentos',name:'🧪 Kit de Sobrevivência',cost:60,itemId:'pocao_pet_full',quantity:2,detail:'2 Poções Full Pet'},
 elixires:{id:'elixires',name:'✨ Kit de Elixires',cost:100,itemId:'elixir_supremo',quantity:2,detail:'2 Elixires Supremos'},
 epicas:{id:'epicas',name:'🟣 Reserva Épica',cost:160,itemId:'caixa_epica',quantity:2,detail:'2 Caixas Épicas'},
 lendaria:{id:'lendaria',name:'🟠 Herança das Almas',cost:220,itemId:'caixa_lendaria',quantity:1,detail:'1 Caixa Lendária garantida'}
})
const aliases={suprimento:'suprimentos',suprimentos:'suprimentos',kit:'suprimentos',
 elixir:'elixires',elixires:'elixires',epica:'epicas',epicas:'epicas',lendaria:'lendaria',lenda:'lendaria'}
export const afterpartyShopOpen=(now=Date.now())=>now>=AFTERPARTY_START&&now<AFTERPARTY_SHOP_END
export const afterpartySoulRate=(now=Date.now())=>{
 if(now<AFTERPARTY_START||now>=AFTERPARTY_RAID_END)return 0
 return AFTERPARTY_DOUBLE_WINDOWS.some(([start,end])=>now>=start&&now<end)?2:1
}
export const afterpartyOffer=(text='')=>AFTERPARTY_OFFERS[aliases[String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()]||'']||null
export function afterpartyShopCatalog(){
 return Object.values(AFTERPARTY_OFFERS).map(x=>x.name+' — *'+x.cost+' Almas*\n'+x.detail+
  '\n👉 *!halloween trocar '+x.id+'*').join('\n\n')
}
export const afterpartyAnnouncement=()=>[
 '🎃🛍️ *NOVIDADE ALPHA — DOMINGO 01/11!*',
 '⏰ *Às 13h (São Paulo)* abre a *LOJA DAS ALMAS RENASCIDAS*.',
 '💀 Suas Almas Amaldiçoadas atuais continuam valendo; nada será zerado.',
 '🎁 Novos kits de poções, elixires e Caixas Épicas e Lendárias.',
 '⚔️ Novas Almas serão ganhas nas *Raids concluídas*.',
 '',
 '🔥 *EVENTOS DE ALMAS EM DOBRO* — DOMINGO:',
 '🕑 *14h às 16h*',
 '🌙 *20h às 22h*',
 '🧩 Raid concluída: *12 Almas* normalmente ou *24 Almas* no 2×.',
 '🔒 Teto de *120 Almas por jogador* na continuação, com participação real.',
 '📍 Apenas no grupo AlphaBot.',
 '👉 A partir das 13h: *!halloween loja*'
].join('\n')
export const afterpartyOpenAnnouncement=()=>[
 '🛍️🎃 *LOJA DAS ALMAS RENASCIDAS ABERTA!*',
 '⏰ De 01/11 às 13h até 02/11 às 23h59 (São Paulo).',
 '🧩 Almas antigas preservadas; confira *!halloween loja*.',
 '⚔️ Raid concluída: *12 Almas* até 23h59 de hoje.',
 '🔥 *2× ALMAS NAS RAIDS*: 14h–16h e 20h–22h = 24 Almas por Raid.',
 '🔒 Teto de 120 Almas por jogador; participação mínima obrigatória.'
].join('\n')
export async function initAfterparty(c){
 await c.query('CREATE TABLE IF NOT EXISTS halloween_afterparty_raid_souls_2026(jid TEXT NOT NULL,raid_key TEXT NOT NULL,amount INTEGER NOT NULL,created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,PRIMARY KEY(jid,raid_key))')
}
export async function afterpartyRaidSouls(c,{jid,raidKey,damage,totalDamage,now=Date.now()}){
 const rate=afterpartySoulRate(now)
 if(!rate||!jid||!raidKey||Number(damage)<2500||Number(damage)/Math.max(1,Number(totalDamage))<0.02)
  return {amount:0,rate}
 const u=await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
 if(!u.rowCount)return {amount:0,rate}
 const total=await c.query('SELECT COALESCE(SUM(amount),0)::int AS earned FROM halloween_afterparty_raid_souls_2026 WHERE jid=$1',[jid])
 const amount=Math.min(AFTERPARTY_SOUL_CAP-Number(total.rows[0]?.earned||0),AFTERPARTY_RAID_BASE_SOULS*rate)
 if(amount<=0)return {amount:0,rate,capped:true}
 const key=String(raidKey).slice(0,160)
 const inserted=await c.query('INSERT INTO halloween_afterparty_raid_souls_2026(jid,raid_key,amount) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING amount',[jid,key,amount])
 if(!inserted.rowCount)return {amount:0,rate,duplicate:true}
 await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity',[jid,HALLOWEEN_SOUL_ID,amount])
 return {amount,rate}
}
