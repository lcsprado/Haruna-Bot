import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
// Política candidata V2: mesma coleção e especialidades, aquisição sem privilégios.
export const V2_PET_ALTAR_COSTS=Object.freeze({10:50,15:100,20:100,25:100,30:100,40:100,50:100,60:100,65:100,70:100})
export function effectivePetAltar(altar,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return altar
 const cost=V2_PET_ALTAR_COSTS[altar.raidLevel]
 if(!cost)throw Error('Altar não disponível na V2')
 const pets=altar.pets.map(p=>({...p}))
 let redistributed=0
 for(const p of pets)if(p.chance===8){redistributed+=3;p.chance=5}
 pets[0].chance+=redistributed
 return {...altar,summonCost:cost,pets}
}
export function assertV2PetAltarAccess(raidLevel,playerLevel,manualWins,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return true
 const required=Number(raidLevel)===70?90:Number(raidLevel)
 if(!Number.isSafeInteger(required)||!V2_PET_ALTAR_COSTS[raidLevel]||!Number.isFinite(playerLevel)||playerLevel<required)
   throw Error('Nível insuficiente para este altar: mínimo '+required)
 if(!Number.isFinite(manualWins)||manualWins<1)throw Error('Vença esta Raid manualmente antes de invocar seu pet.')
 return true
}
export const petSummonStartLevel=(raidLevel,{enabled=classesOnlyRebootEnabled()}={})=>enabled?1:Math.max(1,Number(raidLevel||1))
export function petDuplicateCash(legacy,raidLevel,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?Math.min(2000,Number(raidLevel)*25):legacy
}
export function petCombatExperience(base,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?Math.max(0,Math.floor(base*.35)):base
}
export function petAdventureCash(base,{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?Math.max(1,Math.floor(base*.10)):base
}
export const V2_EXPEDITION_PLANS=Object.freeze({2:{xp:40,cash:200},4:{xp:80,cash:450},8:{xp:180,cash:1000}})
export const V1_EXPEDITION_PLANS=Object.freeze({2:{xp:70,cash:500},4:{xp:150,cash:1100},8:{xp:330,cash:2500}})
export const effectiveExpeditionPlans=({enabled=classesOnlyRebootEnabled()}={})=>enabled?V2_EXPEDITION_PLANS:V1_EXPEDITION_PLANS
export const petExpeditionLimit=({enabled=classesOnlyRebootEnabled()}={})=>enabled?3:12
export function v2PetSacrifice({level,exp,cash,originalPrice,shopRefund},{enabled=classesOnlyRebootEnabled()}={}){
 return enabled?{level,exp:Math.min(100,exp),cash:Math.min(500,200+Math.floor(level*3)),originalPrice:0,shopRefund:false}:{level,exp,cash,originalPrice,shopRefund}
}
