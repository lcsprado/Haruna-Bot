import test from 'node:test'
import assert from 'node:assert/strict'
import {
 pocoClaimFloorInTx,pocoClaimBossDropInTx,pocoOpenBoxInTx,
 pocoClaimRankPrizeInTx,pocoXpForFloor,pocoBoxContents,
 POCO_BOX_EPIC_ID,POCO_BOX_LEGEND_ID
} from '../src/neon/poco-abismo-rewards.js'
import {POCO_ABISMO_GEAR} from '../src/neon/poco-abismo-gear.js'

function makeDb(){
 const claims=new Map(),items=new Map(),bound=new Map(),forged=new Map(),effective=new Map()
 const transactions=[],wallet={cash:0},registered=new Set([
 ...POCO_ABISMO_GEAR.map(g=>g.id),POCO_BOX_EPIC_ID,POCO_BOX_LEGEND_ID,
 'fragmento_universal_raid','coroa_abissal','pocao_pet_epica',
 'caixa_rara','pergaminho_experiencia','pocao_pet_suprema','caixa_epica','caixa_lendaria'
 ])
 const db={
  claims,items,bound,forged,effective,transactions,wallet,
  async query(sql,a=[]){
   const statement=sql.trim().replace(/\s+/g,' ')
   const row=()=>({rows:[],rowCount:0})
   const key=(s,j,c)=>s+':'+j+':'+c
   if(statement.startsWith('INSERT INTO poco_abismo_claims')){
    const k=key(a[0],a[1],a[2]);if(claims.has(k))return row()
    claims.set(k,{});return {rows:[{claim_key:a[2]}],rowCount:1}
   }
   if(statement.startsWith('SELECT result FROM poco_abismo_claims')){
    const result=claims.get(key(a[0],a[1],a[2]))
    return result?{rows:[{result}],rowCount:1}:row()
   }
   if(statement.startsWith('UPDATE poco_abismo_claims')){
    claims.set(key(a[0],a[1],a[2]),JSON.parse(a[3]));return {rows:[],rowCount:1}
   }
   if(statement.startsWith('UPDATE wallets SET cash=cash+')){
    wallet.cash+=a[0];return {rows:[{jid:a[1]}],rowCount:1}
   }
   if(statement.startsWith('INSERT INTO transactions')){
    transactions.push(a);return {rows:[],rowCount:1}
   }
   if(statement.startsWith('SELECT id FROM items WHERE id=')){
    return registered.has(a[0])?{rows:[{id:a[0]}],rowCount:1}:row()
   }
   if(statement.startsWith('SELECT quantity FROM inventories')){
    const qty=items.get(a[1])||0
    return qty>0?{rows:[{quantity:qty}],rowCount:1}:row()
   }
   if(statement.startsWith('UPDATE inventories SET quantity=quantity-1')){
    const qty=items.get(a[1])||0;if(!qty)return row()
    items.set(a[1],qty-1);return {rows:[{quantity:qty-1}],rowCount:1}
   }
   if(statement.startsWith('INSERT INTO inventories')){
    items.set(a[1],(items.get(a[1])||0)+a[2]);return {rows:[],rowCount:1}
   }
   if(statement.startsWith('INSERT INTO bound_inventory_items')){
    bound.set(a[1],a[2]);return {rows:[],rowCount:1}
   }
   if(statement.startsWith('INSERT INTO equipment_star_forges')){
    forged.set(a[1],{stars:5,level:10});return {rows:[],rowCount:1}
   }
   if(statement.startsWith('SELECT COALESCE(MAX(level),1)')){
    return {rows:[{level:1}],rowCount:1}
   }
   if(statement.startsWith('SELECT level,stars FROM equipment_star_forges')){
    const f=forged.get(a[1]);return f?{rows:[f],rowCount:1}:row()
   }
   if(statement.startsWith('INSERT INTO equipment_upgrades')){
    effective.set(a[1],a[2]);return {rows:[],rowCount:1}
   }
   if(statement.startsWith('SELECT stars,level FROM equipment_star_forges')){
    const f=forged.get(a[1]);return f?{rows:[f],rowCount:1}:row()
   }
   throw new Error('SQL não simulada: '+statement.slice(0,120))
  }
 }
 return db
}
const fixedXp=async(_c,_jid,amount)=>{assert.ok(amount>=500);return amount}
test('dinheiro e EXP apenas na primeira conquista do andar',async()=>{
 const c=makeDb()
 const one=await pocoClaimFloorInTx(c,'a@jid',1,{grantExp:fixedXp})
 const repeat=await pocoClaimFloorInTx(c,'a@jid',1,{grantExp:()=>{throw Error('EXP duplicado')}})
 assert.equal(one.cash,30000);assert.equal(one.xp,500)
 assert.equal(repeat.alreadyClaimed,true)
 assert.equal(c.wallet.cash,30000)
 assert.equal(c.transactions.length,1)
 assert.equal(pocoXpForFloor(30),2800)
})
test('5 equipamentos são recebidos forjados ★5 Lv10 e sem segunda concessão no mesmo dia',async()=>{
 const c=makeDb()
 for(let n=0;n<5;n++){
  const gear=POCO_ABISMO_GEAR[n]
  const day='2026-11-16'
  const floor=[5,10,15,20,25][n]
  const result=await pocoClaimBossDropInTx(c,'a@jid',floor,day,()=>.0001+n*.0012)
  assert.equal(result.itemId,gear.id)
  assert.equal(result.stars,5);assert.equal(result.level,10)
  assert.deepEqual(c.forged.get(gear.id),{stars:5,level:10})
  assert.equal(c.effective.get(gear.id).level,10)
  assert.equal(c.effective.get(gear.id).stars,5)
  assert.ok(c.bound.has(gear.id))
  const again=await pocoClaimBossDropInTx(c,'a@jid',floor,day,()=>.5)
  assert.equal(again.alreadyClaimed,true)
  assert.equal(c.items.get(gear.id),1)
 }
})
test('segundo drop do mesmo modelo vira caixa, nunca peça comum falsamente ★5',async()=>{
 const c=makeDb()
 const first=await pocoClaimBossDropInTx(c,'a@jid',5,'2026-11-16',()=>0)
 const second=await pocoClaimBossDropInTx(c,'a@jid',5,'2026-11-17',()=>0)
 assert.equal(first.kind,'exclusive')
 assert.equal(second.kind,'duplicate_converted')
 assert.equal(c.items.get(first.itemId),1)
 assert.equal(c.items.get(POCO_BOX_LEGEND_ID),1)
})
test('caixas têm conteúdos fechados e abertura não duplica após retransmissão',async()=>{
 const c=makeDb();c.items.set(POCO_BOX_EPIC_ID,1)
 assert.equal(pocoBoxContents('epic').reduce((a,b)=>a+b.weight,0),100)
 assert.equal(pocoBoxContents('legendary').reduce((a,b)=>a+b.weight,0),100)
 const result=await pocoOpenBoxInTx(c,'a@jid','epic','msg-123',()=>.1)
 const again=await pocoOpenBoxInTx(c,'a@jid','epic','msg-123',()=>.9)
 assert.equal(result.cash,115000)
 assert.equal(again.alreadyClaimed,true)
 assert.equal(c.items.get(POCO_BOX_EPIC_ID),0)
 assert.equal(c.wallet.cash,115000)
 assert.equal(result.itemId,'fragmento_universal_raid')
})
test('ranking permite uma concessão por jogador, mesmo que posição seja alterada',async()=>{
 const c=makeDb()
 const first=await pocoClaimRankPrizeInTx(c,'a@jid',1)
 const repeat=await pocoClaimRankPrizeInTx(c,'a@jid',2)
 assert.equal(first.cash,25000000)
 assert.equal(repeat.alreadyClaimed,true)
 assert.equal(c.wallet.cash,25000000)
 assert.equal(c.transactions.length,1)
})
test('dia e Guardião inválidos são rejeitados',async()=>{
 const c=makeDb()
 await assert.rejects(()=>pocoClaimBossDropInTx(c,'a@jid',12,'2026-11-16'),RangeError)
 await assert.rejects(()=>pocoClaimBossDropInTx(c,'a@jid',10,'2026-11-22'),RangeError)
})
