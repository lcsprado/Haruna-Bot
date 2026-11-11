// Fonte única para a escolha e precificação das poções de pet em combate.
// R$ 6.000 / 800 HP da Suprema preserva a economia frente à Full de R$ 20.000:
// três Supremas (2.400 HP) custam R$ 18.000.
export const PET_POTION_ECONOMY_PRICES=Object.freeze({
  pocao_pet_comum:500,
  pocao_pet_rara:1500,
  pocao_pet_epica:3500,
  pocao_pet_suprema:6000,
  pocao_pet_full:20000
})
const POTIONS=Object.freeze({
  pocao_pet_comum:{heal:60,name:'Poção de Pet Comum'},
  pocao_pet_rara:{heal:160,name:'Poção de Pet Rara'},
  pocao_pet_epica:{heal:320,name:'Poção de Pet Épica'},
  pocao_pet_suprema:{heal:800,name:'Poção de Pet Suprema'},
  pocao_pet_full:{heal:Number.MAX_SAFE_INTEGER,name:'Poção Full de Pet'}
})

// Mantém uma poção por pet por rodada, sem alterar o consumo nem o risco de desmaio.
// Com HP crítico ou revival, Full tem prioridade; durante a prevenção usamos
// a menor poção que devolve uma margem de vida útil ao pet (55% do HP máximo).
export function chooseEconomicPetPotion(rows,missingHp,{currentHp,maxHp,imminentDamage=0}={}){
  const available=(Array.isArray(rows)?rows:[]).filter(row=>
    Number(row?.quantity)>0&&Boolean(POTIONS[row.item_id]))
    .map(row=>({...row,
      name:POTIONS[row.item_id].name,
      heal:POTIONS[row.item_id].heal,
      price:PET_POTION_ECONOMY_PRICES[row.item_id]}))
  if(!available.length)return null

  const amount=Math.max(1,Math.floor(Number(missingHp)||1))
  const full=available.find(item=>item.item_id==='pocao_pet_full')
  const partial=available.filter(item=>item.item_id!=='pocao_pet_full')
  // Compatibilidade com consumidores antigos que informam somente o HP faltante.
  const capacity=Number(maxHp)
  const current=Number(currentHp)
  if(!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(current)){
    const byHeal=available.sort((a,b)=>a.heal-b.heal)
    return byHeal.find(item=>item.heal>=amount)||byHeal.at(-1)
  }

  const hp=Math.max(0,Math.min(capacity,current))
  const danger=hp===0||hp/capacity<=.12||hp<=Math.max(0,Number(imminentDamage)||0)*1.5
  if(danger&&full)return full

  // Só usamos cura parcial se ela realmente tira o pet da zona preventiva.
  const safeHp=Math.max(capacity*.55,Math.max(0,Number(imminentDamage)||0)*2)
  const viable=partial.filter(item=>hp+item.heal>=safeHp)
  if(viable.length){
    viable.sort((a,b)=>a.price-b.price||a.heal-b.heal)
    return viable[0]
  }
  if(full)return full
  // Sem Full: salvar com a melhor cura disponível, sem deixar desmaiar por preço.
  return partial.sort((a,b)=>b.heal-a.heal||a.price-b.price)[0]||null
}
