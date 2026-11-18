import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {V2_CONSUMABLE_PRICES,V2_NPC_PRICES,consumableCatalogPrice,effectiveNpcBasePrice,rebootLevelReward} from '../src/neon/reboot-progression-rewards.js'
import {candidateShopCatalogItem} from '../src/neon/reboot-economy-policy.js'
import {unlockedLevelMilestones,levelRewardHistoryProblem} from '../src/neon/level-reward-safety.js'
import {chooseEconomicPetPotion,PET_POTION_ECONOMY_PRICES} from '../src/neon/pet-potion-economy.js'
const yes={enabled:true},no={enabled:false}
test('V2: todos os 20 marcos até nível 100 somam 119.500 e nenhum prêmio máximo ou collab',()=>{
 const levels=unlockedLevelMilestones(100,[])
 assert.equal(levels.length,20)
 assert.equal(levels.reduce((sum,lv)=>sum+rebootLevelReward(lv).cash,0),119500)
 assert.equal(rebootLevelReward(5).cash,1000)
 assert.equal(rebootLevelReward(50).cash,5500)
 assert.equal(rebootLevelReward(100).cash,15000)
 const rewards=levels.flatMap(lv=>rebootLevelReward(lv).items)
 assert.equal(rewards.filter(r=>r[0]==='caixa_epica').reduce((n,r)=>n+r[1],0),3)
 assert.ok(rewards.every(([id,qty])=>!/(pecado|raid_70|raid_75|voucher_|caixa_lendaria)/.test(id)&&qty<=2))
 const r=rebootLevelReward(5);r.items[0][1]=999
 assert.equal(rebootLevelReward(5).items[0][1],2)
})
test('marcos avançados têm teto de 15 mil e cadência original, sem chaves de alto nível',()=>{
 for(const lv of unlockedLevelMilestones(1000,[])){
   const r=rebootLevelReward(lv)
   assert.ok(r&&r.cash>0&&r.cash<=15000)
   if(lv>100)assert.equal(r.items.some(([id])=>id.startsWith('chave_raid_')),false)
 }
 for(const lv of [0,1,6,101,105,199,201,Infinity,NaN])assert.equal(rebootLevelReward(lv),null)
 assert.equal(rebootLevelReward(1000).cash,15000)
 assert.ok(rebootLevelReward(200).items.some(([id])=>id==='pergaminho_reclassificacao'))
 assert.match(levelRewardHistoryProblem({level:15,claimedMilestones:[5,10],auditedMilestones:[5,10,15],recoveryActive:false}),/desapareceu/)
})
test('preços de cura são centralizados, V1 permanece idêntica e drop sem preço continua exclusivo',()=>{
 const old={pocao_p:500,pocao_m:1200,pocao_g:3000,elixir_supremo:9000,
  ...PET_POTION_ECONOMY_PRICES,energetico_pet:12000}
 for(const [id,price] of Object.entries(old)){
  const row=[id,id,'','consumable',price,'rare']
  assert.equal(consumableCatalogPrice(id,price,yes),V2_CONSUMABLE_PRICES[id])
  assert.equal(candidateShopCatalogItem(row,yes)[4],V2_CONSUMABLE_PRICES[id])
  assert.ok(V2_CONSUMABLE_PRICES[id]<price)
  assert.equal(candidateShopCatalogItem(row,no),row)
 }
 assert.equal(candidateShopCatalogItem(['pocao_ressurreicao','','','consumable',0,'epic'],yes)[4],0)
 assert.equal(candidateShopCatalogItem(['chave_raid_70','','','special',390000,'legendary'],yes)[4],60000)
})
test('NPC usa preço exclusivo V2 apenas quando há oferta própria; não reaplica desconto',()=>{
 for(const [id,price] of Object.entries(V2_NPC_PRICES)){
  assert.equal(effectiveNpcBasePrice({id,npcPrice:99999},{price:0},yes),price)
  assert.equal(effectiveNpcBasePrice({id,npcPrice:99999},{price:0},no),99999)
  assert.ok(price>=2500)
 }
 assert.equal(effectiveNpcBasePrice({id:'pocao_g'},{price:950},yes),950)
 assert.equal(effectiveNpcBasePrice({id:'chave_raid_10'},{price:2000},yes),2000)
})
test('autocura usa valor V2 sem alterar o HP curado',()=>{
 const before=process.env.ALPHA_REBOOT_MODE
 try{
  process.env.ALPHA_REBOOT_MODE='classes_only'
  const rows=[{item_id:'pocao_pet_suprema',quantity:2}]
  const potion=chooseEconomicPetPotion(rows,800)
  assert.equal(potion.heal,800)
  assert.equal(potion.price,2400)
  delete process.env.ALPHA_REBOOT_MODE
  assert.equal(chooseEconomicPetPotion(rows,800).price,6000)
 }finally{
  if(before===undefined)delete process.env.ALPHA_REBOOT_MODE
  else process.env.ALPHA_REBOOT_MODE=before
 }
})
test('resgate e prévia continuam compartilhando a regra com auditoria de duplicidade; NPC usa mesma base na compra',()=>{
 const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 assert.match(db,/function levelRewardFor\(milestone\)\{[\s\S]*?if\(classesOnlyRebootEnabled\(\)\)return rebootLevelReward\(milestone\)/)
 assert.match(db,/const reward=levelRewardFor\(milestone\)/)
 assert.match(db,/const nextReward=levelRewardFor\(nextMilestone\)/)
 assert.match(db,/export function getLevelRewardPreview\(milestone\)\{\s*const reward=levelRewardFor\(milestone\)/)
 assert.match(db,/INSERT INTO level_reward_audit\(jid,milestone,claimed_at\)/)
 const npc=readFileSync(new URL('../src/neon/npc-shops.js',import.meta.url),'utf8')
 assert.match(npc,/basePrice=effectiveNpcBasePrice\(g,item\)/)
 assert.match(npc,/basePrice=effectiveNpcBasePrice\(selected,item\)/)
})
