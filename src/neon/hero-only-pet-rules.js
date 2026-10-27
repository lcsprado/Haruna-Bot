import {PECADOS_HERO_IDS} from './sete-pecados-catalog.js'

// Pure policy: a Pecado is now a playable character/unlock, never a pet.
export const isSevenSinHeroSpecies=species=>PECADOS_HERO_IDS.includes(String(species||''))

// Keep surviving pet-team order where possible. Use current healthy/non-expedition
// companions provided by caller, then fall back to a normal owned pet.
// This never mutates pet data; persistence is audited by the caller.
export function planHeroOnlyPetTeam(oldTeam=[],eligiblePets=[]){
  const eligible=(Array.isArray(eligiblePets)?eligiblePets:[])
    .filter(p=>p&&!isSevenSinHeroSpecies(p.species))
  const allowed=new Set(eligible.map(p=>Number(p.id)))
  const ids=[]
  for(const row of [...(oldTeam||[])].sort((a,b)=>Number(a.slot)-Number(b.slot))){
    if(isSevenSinHeroSpecies(row.species))continue
    const id=Number(row.pet_id)
    if(allowed.has(id)&&!ids.includes(id))ids.push(id)
  }
  const active=eligible.find(p=>p.active)
  if(active&&!ids.includes(Number(active.id)))ids.unshift(Number(active.id))
  if(!ids.length&&eligible.length)ids.push(Number(eligible[0].id))
  const teamIds=ids.slice(0,3)
  return {teamIds,primary:eligible.find(p=>Number(p.id)===teamIds[0])||null}
}
