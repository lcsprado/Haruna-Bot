// Somente combate V2. Catálogo e prévia de composição continuam independentes de HP.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export function activeCombatPetTeam(team=[],snapshots=[],{enabled=classesOnlyRebootEnabled(),lastEnergyActive=false}={}){
 if(!enabled)return team;
 const rows=Array.isArray(team)?team:[];
 return rows.map(row=>{
  const pet=snapshots.find(p=>p&&Number(p.teamSlot)===Number(row.slot)&&p.species===row.species);
  if(!pet)return row;
  return {...row,hp:pet.hp,energy:lastEnergyActive&&pet.roundActive&&Number(pet.hp)>0?Math.max(1,Number(pet.energy||0)):pet.energy};
 }).filter(p=>p&&Number(p.hp)>0&&Number(p.energy)>0);
}
