import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 BUSINESS_REBALANCE_EFFECTIVE_AT as firstCut,
 BUSINESS_RECOVERY_EFFECTIVE_AT as secondCut,
 BUSINESS_LEGACY_PROFIT_HOUR as oldRates,
 BUSINESS_REBALANCED_PROFIT_HOUR as lowRates,
 BUSINESS_RECOVERED_PROFIT_HOUR as newRates,
 businessIntervalGross
} from '../src/neon/business-profit.js'
import {PET_POTION_ECONOMY_PRICES,chooseEconomicPetPotion} from '../src/neon/pet-potion-economy.js'
const progression=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const catalog=[
 ['carrinho_lanche',300,8],['barbearia',800,8],['loja_roupas',2000,10],
 ['restaurante',4500,10],['posto',7000,12],['mercado',12000,12],
 ['hotel',24000,16],['shopping',50000,18],['tech',110000,24]
]
function gross(hours,rateIndex){
 const rates=rateIndex==='old'?oldRates:rateIndex==='low'?lowRates:newRates
 return catalog.reduce((acc,[id,currentRate,capacityHours])=>{
  const rate=rates[id]??currentRate
  return acc+rate*2*Math.min(hours,capacityHours+4)
 },0)
}
const potionRows=(ids)=>ids.map(id=>({item_id:id,quantity:99}))
const f='pocao_pet_full',s='pocao_pet_suprema'
test('corte de recuperação posterior, sem lucros duplicados nos limites',()=>{
 assert.ok(secondCut>firstCut)
 for(const [id,profitHour,capacityHours] of catalog){
  const item={id,profitHour,capacityHours}
  const level=5
  const rateLow=lowRates[id]??profitHour
  const rateOld=oldRates[id]??profitHour
  assert.equal(businessIntervalGross(item,{last_collected_at:firstCut-3600,level},firstCut),rateOld*2)
  assert.equal(businessIntervalGross(item,{last_collected_at:secondCut-3600,level},secondCut),rateLow*2)
  assert.equal(businessIntervalGross(item,{last_collected_at:secondCut,level},secondCut+3600),profitHour*2)
  assert.equal(businessIntervalGross(item,{last_collected_at:secondCut-3600,level},secondCut+3600),(rateLow+profitHour)*2)
 }
})
test('passagem pelas duas tabelas preserva faturamento histórico até o limite',()=>{
 const business={id:'tech',profitHour:110000,capacityHours:24}
 const claimed=businessIntervalGross(business,{last_collected_at:firstCut-7200,level:5},secondCut+7200)
 const hoursLow=(secondCut-firstCut)/3600
 assert.equal(claimed,2*(2*330000+hoursLow*55000+2*110000))
 assert.equal(businessIntervalGross(business,{last_collected_at:secondCut,level:5},secondCut+100*3600),28*2*110000)
})
test('rendimento dos nove negócios Lv5 melhora sem atingir padrão inflacionado',()=>{
 assert.equal(gross(24,'old'),25_496_400)
 assert.equal(gross(24,'low'),4_732_400)
 assert.equal(gross(24,'new'),9_256_400)
 const net=val=>val-Math.floor(val*.10)
 assert.equal(net(gross(24,'new')),8_330_760)
 assert.ok(gross(24,'new')>gross(24,'low')*1.8)
 assert.ok(gross(24,'new')<gross(24,'old')*.4)
 for(const [id,rate] of Object.entries(newRates)){
  assert.match(progression,new RegExp("id:'"+id+"'[^\\n]*profitHour:"+rate))
 }
})
test('preço da Suprema e Full é único e a Suprema passa a valer a pena por HP',()=>{
 assert.equal(PET_POTION_ECONOMY_PRICES.pocao_pet_full,20_000)
 assert.equal(PET_POTION_ECONOMY_PRICES.pocao_pet_suprema,6_000)
 assert.ok(3*PET_POTION_ECONOMY_PRICES[s]<PET_POTION_ECONOMY_PRICES[f])
 assert.match(db,/\['pocao_pet_full'[^\n]*'consumable',20000,'legendary'\]/)
 assert.match(db,/\['pocao_pet_suprema'[^\n]*'consumable',6000,'legendary'\]/)
})
test('HP 35% em pet grande prioriza Suprema quando cura é segura',()=>{
 const chosen=chooseEconomicPetPotion(potionRows([f,s,'pocao_pet_epica']),2200,
   {currentHp:1100,maxHp:3300,imminentDamage:350,context:'raid-preventive'})
 assert.equal(chosen.item_id,s)
 assert.equal(chosen.heal,800)
})
test('HP de pet crítico ou zero reserva Full, respeitando o estoque',()=>{
 for(const hp of [0,200,380]){
  const chosen=chooseEconomicPetPotion(potionRows([s,f]),3300-hp,{currentHp:hp,maxHp:3300,imminentDamage:300})
  assert.equal(chosen.item_id,f)
 }
 const fallback=chooseEconomicPetPotion(potionRows([s]),3300,{currentHp:0,maxHp:3300})
 assert.equal(fallback.item_id,s)
})
test('sem Full usa melhor cura, nunca debita quando falta estoque',()=>{
 assert.equal(chooseEconomicPetPotion([],2000,{currentHp:1000,maxHp:3300}),null)
 const fallback=chooseEconomicPetPotion(potionRows(['pocao_pet_rara',s]),2600,{currentHp:700,maxHp:3300})
 assert.equal(fallback.item_id,s)
 const noFull=chooseEconomicPetPotion(potionRows([s,'pocao_pet_epica']),2200,{currentHp:1100,maxHp:3300})
 assert.equal(noFull.item_id,s)
})
test('Raid preventiva, revival e Boss usam a mesma regra com HP real',()=>{
 assert.match(games,/import \{chooseEconomicPetPotion\} from '\.\/pet-potion-economy\.js'/)
 assert.match(games,/return chooseEconomicPetPotion\(rows,missingHp,context\)/)
 assert.match(games,/context:'raid-preventive'/)
 assert.match(games,/context:'raid-fainted'/)
 assert.match(games,/context:'raid-revive'/)
 assert.match(games,/imminentDamage:Math\.ceil\(Number\(bossAtk\|\|0\)\*\.52\)/)
 assert.match(games,/Math\.ceil\(Number\(cfg\.atk\|\|0\)\*\.60\)/)
})
