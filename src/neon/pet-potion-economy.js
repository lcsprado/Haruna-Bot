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

// Uma poção por pet por rodada, respeitando o estoque e a transação do combate.
// Em vez de obrigar o pet a atingir 55% do HP, considera o dano estimado de
// duas rodadas e evita curas pequenas que levariam a outro gasto imediato.
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
  const capacity=Number(maxHp)
  const current=Number(currentHp)
  // Mantém compatibilidade com consumidores que não fornecem HP atual.
  if(!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(current)){
    const byHeal=available.sort((a,b)=>a.heal-b.heal)
    return byHeal.find(item=>item.heal>=amount)||byHeal.at(-1)
  }

  const hp=Math.max(0,Math.min(capacity,current))
  const expectedHit=Number(imminentDamage)
  const hit=Math.max(0,Number.isFinite(expectedHit)?Math.ceil(expectedHit):0)
  if(hp===0&&full)return full

  const after=item=>Math.min(capacity,hp+item.heal)
  // A próxima rodada verifica a autocura novamente abaixo de 35%.
  // Objetivo: cruzar esse limite com margem para dois golpes prováveis.
  const target=Math.min(capacity,Math.ceil(capacity*.35)+2*hit)
  const survivable=partial.filter(item=>after(item)>2*hit)
  const sustainable=survivable.filter(item=>after(item)>=target)
  if(sustainable.length){
    // A mais barata que atende ao horizonte, sem obrigar uma Suprema.
    sustainable.sort((a,b)=>a.price-b.price||after(a)-after(b))
    return sustainable[0]
  }
  // Full fica para pet nocauteado ou sem cura parcial capaz de sustentar
  // dois ataques estimados. Não forçamos Full só porque não chegou à meta.
  if(!survivable.length&&full)return full
  if(survivable.length){
    // Sem alcançar a meta, a maior cura parcial adia a próxima compra.
    survivable.sort((a,b)=>after(b)-after(a)||a.price-b.price)
    return survivable[0]
  }
  // Sem Full em estoque, ainda tentamos evitar a perda do pet.
  return partial.sort((a,b)=>after(b)-after(a)||a.price-b.price)[0]||null
}
