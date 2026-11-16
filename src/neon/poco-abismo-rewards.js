// Serviço de premiações do Poço do Abismo.
// Não é chamado pela prévia e não realiza transações ao importar.
// O chamador deve abrir BEGIN/COMMIT com conexão dedicada; nenhuma recompensa
// pode ser enviada se a gravação do estado/recorde falhar.
import {randomInt} from 'node:crypto'
import {POCO_SEASON,pocoCashForFloor,pocoRollDrop} from './poco-abismo-rules.js'
import {POCO_ABISMO_GEAR_ID_SET,pocoGearById} from './poco-abismo-gear.js'
import {syncEffectiveGear} from './equipment-star-logic.js'
import {grantExpInTransaction} from './db.js'
export const POCO_BOX_EPIC_ID='caixa_epica_abissal_20261116'
export const POCO_BOX_LEGEND_ID='caixa_lendaria_abissal_20261116'
export const POCO_REWARD_SCHEMA=`
CREATE TABLE IF NOT EXISTS poco_abismo_claims (
 season TEXT NOT NULL,
 jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
 claim_key TEXT NOT NULL,
 result JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
 PRIMARY KEY(season,jid,claim_key)
)`
export async function pocoInitRewardLedger(db){
 await db.query(POCO_REWARD_SCHEMA)
}
export const pocoXpForFloor=floor=>{
 if(!Number.isInteger(floor)||floor<1||floor>30)return 0
 return [500,750,1100,1500,2000,2800][Math.floor((floor-1)/5)]
}
async function claim(c,jid,key,perform){
 if(!jid || !/^[a-zA-Z0-9_:-]{1,80}$/.test(key))throw new Error('Claim inválido')
 const marker=await c.query(`INSERT INTO poco_abismo_claims(season,jid,claim_key)
 VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING claim_key`,[POCO_SEASON.id,jid,key])
 if(!marker.rowCount){
  const previous=await c.query('SELECT result FROM poco_abismo_claims WHERE season=$1 AND jid=$2 AND claim_key=$3',[POCO_SEASON.id,jid,key])
  if(!previous.rows[0])throw new Error('Claim ausente após conflito')
  return {...previous.rows[0].result,alreadyClaimed:true}
 }
 const result=await perform(c)
 await c.query('UPDATE poco_abismo_claims SET result=$4::jsonb WHERE season=$1 AND jid=$2 AND claim_key=$3',
  [POCO_SEASON.id,jid,key,JSON.stringify(result)])
 return {...result,alreadyClaimed:false}
}
async function addCash(c,jid,amount,type,key){
 if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Dinheiro inválido')
 if(amount===0)return
 const updated=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2 RETURNING jid',[amount,jid])
 if(updated.rowCount!==1)throw new Error('Carteira não encontrada: pagamento cancelado')
 await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',
  ['system',jid,amount,type,POCO_SEASON.id+':'+key])
}
async function addItem(c,jid,itemId,amount=1){
 if(!Number.isInteger(amount)||amount<1)throw new Error('Quantidade inválida')
 const found=await c.query('SELECT id FROM items WHERE id=$1',[itemId])
 if(found.rowCount!==1)throw new Error('Item não cadastrado: '+itemId)
 await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
 ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[jid,itemId,amount])
}
async function grantExclusive(c,jid,itemId,claimKey){
 const gear=pocoGearById(itemId)
 if(!gear||!POCO_ABISMO_GEAR_ID_SET.has(itemId))throw new Error('Drop exclusivo inválido')
 const owned=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])).rows[0]
 if(Number(owned?.quantity||0)>0){
  // O modelo de forja suporta uma única peça ★5 por modelo. Não inserir
  // uma segunda peça comum sob o nome de "forjada": o prêmio é convertido
  // em caixa lendária do Poço, de modo explícito e auditável.
  await addItem(c,jid,POCO_BOX_LEGEND_ID)
  return {kind:'duplicate_converted',gearId:itemId,boxId:POCO_BOX_LEGEND_ID}
 }
 await addItem(c,jid,itemId)
 await c.query(`INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity)
 VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING`,
 [jid,itemId,POCO_SEASON.id+':'+claimKey])
 await c.query(`INSERT INTO equipment_star_forges(jid,item_id,stars,level,updated_at)
 VALUES($1,$2,5,10,EXTRACT(EPOCH FROM NOW())::bigint)
 ON CONFLICT(jid,item_id) DO UPDATE SET stars=5,level=10,updated_at=EXCLUDED.updated_at`,[jid,itemId])
 await syncEffectiveGear(c,jid,itemId)
 const verified=(await c.query('SELECT stars,level FROM equipment_star_forges WHERE jid=$1 AND item_id=$2',[jid,itemId])).rows[0]
 if(Number(verified?.stars)!==5||Number(verified?.level)!==10)throw new Error('Falha na forja: premiação revertida')
 return {kind:'exclusive',itemId,stars:5,level:10}
}
export async function pocoClaimFloorInTx(c,jid,floor){
 if(!Number.isInteger(floor)||floor<1||floor>POCO_SEASON.floorLimit)throw new RangeError('Andar inválido')
 return claim(c,jid,'floor:'+floor,async()=>{
  const cash=pocoCashForFloor(floor),xp=pocoXpForFloor(floor)
  await addCash(c,jid,cash,'poco_floor','floor:'+floor)
  if(xp)await grantExpInTransaction(c,jid,xp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
  return {kind:'floor',floor,cash,xp}
 })
}
export async function pocoClaimBossDropInTx(c,jid,floor,day,random=()=>randomInt(0,10000)/10000){
 if(!POCO_SEASON.bossFloors.includes(floor))throw new RangeError('Guardião inválido')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))throw new RangeError('Dia inválido')
 const key='boss:'+day+':'+floor
 return claim(c,jid,key,async()=>{
  const drop=pocoRollDrop(random)
  if(drop.kind==='none')return {kind:'none',floor,day}
  if(drop.kind==='exclusive')return {...await grantExclusive(c,jid,drop.itemId,key),floor,day}
  if(drop.kind==='legendary_box'||drop.kind==='epic_box'){
   const itemId=drop.kind==='legendary_box'?POCO_BOX_LEGEND_ID:POCO_BOX_EPIC_ID
   await addItem(c,jid,itemId)
   return {kind:drop.kind,itemId,floor,day}
  }
  if(drop.kind==='forge_materials'){
   await addItem(c,jid,'fragmento_universal_raid',3)
   return {kind:drop.kind,itemId:'fragmento_universal_raid',quantity:3,floor,day}
  }
  if(drop.kind==='fragments'){
   await addItem(c,jid,'coroa_abissal',2)
   return {kind:drop.kind,itemId:'coroa_abissal',quantity:2,floor,day}
  }
  if(drop.kind==='cash_bonus'){
   const cash=randomInt(30,71)*1000
   await addCash(c,jid,cash,'poco_boss_cash',key)
   return {kind:drop.kind,cash,floor,day}
  }
  throw new Error('Drop sem implementação: '+drop.kind)
 })
}
export async function pocoClaimRankPrizeInTx(c,jid,position){
 if(!Number.isInteger(position)||position<1||position>3)throw new RangeError('Classificação inválida')
 return claim(c,jid,'ranking:'+position,async()=>{
  const cash=POCO_SEASON.prizes[position-1]
  await addCash(c,jid,cash,'poco_ranking','ranking:'+position)
  return {kind:'ranking',position,cash}
 })
}
