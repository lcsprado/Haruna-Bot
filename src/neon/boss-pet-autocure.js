import {spendAutoPetPotion} from './pet-potion-auto-policy.js'

// Autocura transacional de pet em Boss. Recebe o pet do slot real de combate
// (principal ou reserva), nunca procura outro pet por nome ou por slot implícito.
export async function autoHealBossCombatPet({client,jid,pet,maxHp,choosePotion,persistPet}) {
  if (!pet) return null
  const capacity=Math.max(1,Number(maxHp)||1)
  const before=Math.max(0,Number(pet.hp)||0)
  if(before>=capacity) return null

  const potionIds=['pocao_pet_comum','pocao_pet_rara','pocao_pet_epica','pocao_pet_suprema','pocao_pet_full']
  const inventory=(await client.query(
    'SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[]) FOR UPDATE',
    [jid,potionIds]
  )).rows
  const chosen=choosePotion(inventory,capacity-before)
  if(!chosen) return null

  // Limite diário e auditoria são transacionais com o débito e a cura.
  const debit=await spendAutoPetPotion(client,{jid,itemId:chosen.item_id,context:'boss',petName:pet.name})
  if(!debit.spent) return null

  const hp=Math.min(capacity,before+Math.max(0,Number(chosen.heal)||0))
  if(hp<=before) throw new Error('Poção de pet inválida: cura não positiva.')
  pet.hp=hp
  pet.petFainted=false
  await persistPet(client,jid,pet)
  return {
    id:chosen.item_id,name:chosen.name,heal:hp-before,before,hp,maxHp:capacity,
    petName:pet.name,remaining:debit.remaining
  }
}
