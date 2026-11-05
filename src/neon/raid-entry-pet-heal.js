import {autoHealBossCombatPet} from './boss-pet-autocure.js'

// Raid: um pet que já estava com 0 HP quando a rodada começou também pode
// ser recuperado, desde que tenha energia para entrar na luta. Sem esta etapa,
// roundActive=false impede a rotina de autocura posterior de ser executada.
// O débito, o HP e os contadores fazem parte da mesma transação da rodada.
export async function autoHealRaidEntryCombatPet({client,player,choosePotion,persistPet}){
  const pet=player?.pet
  if(!pet || Number(pet.hp)>0 || Number(pet.energy)<=0) return null
  const result=await autoHealBossCombatPet({
    client,jid:player.jid,pet,maxHp:Number(pet.maxHp),
    choosePotion,persistPet
  })
  if(!result) return null
  player.petPotionHealing=Number(player.petPotionHealing||0)+result.heal
  player.petPotionUses=Number(player.petPotionUses||0)+1
  return result
}
