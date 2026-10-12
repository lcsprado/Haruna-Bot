// Catálogo de adoção por habilidade. Somente apresentação; economia/adoção ficam no db.js.
import {ADOPTABLE_PETS, petCombatSpecialty} from './game-catalog.js'

export const PET_ADOPTION_CATEGORIES=Object.freeze([
  {id:1,key:'dano',label:'⚔️ Dano e Boss',keys:['damage','bossDamage']},
  {id:2,key:'defesa',label:'🛡️ Defesa',keys:['defense']},
  {id:3,key:'cura',label:'💚 Cura',keys:['healPct']},
  {id:4,key:'critico',label:'🎯 Crítico',keys:['crit']},
  {id:5,key:'esquiva',label:'🌀 Esquiva',keys:['dodge']},
  {id:6,key:'velocidade',label:'👢 Velocidade',keys:['speed']},
  {id:7,key:'xp',label:'✨ Experiência (XP)',keys:['xp']},
  {id:8,key:'drop',label:'🍀 Sorte e Drop',keys:['drop']}
])

export function petAdoptionCategory(selection){
  const id=Number(selection)
  const key=String(selection||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return PET_ADOPTION_CATEGORIES.find(c=>c.id===id||c.key===key)||null
}

export function petAdoptionCategoryPets(selection){
  const category=petAdoptionCategory(selection)
  if(!category)return []
  return ADOPTABLE_PETS.filter(p=>{
    const spec=petCombatSpecialty(p.species)
    return category.keys.some(k=>Number(spec[k]||0)>0)
  })
}

export function petAdoptionMenuText(){
  let text='🐾 *ADOÇÃO DE PETS*\n\n'
  text+='Escolha a habilidade que procura:\n\n'
  for(const category of PET_ADOPTION_CATEGORIES){
    text+=`*${category.id}.* ${category.label} (${petAdoptionCategoryPets(category.id).length})\n`
  }
  text+='\n👉 Responda com o *número da categoria*.\n'
  text+='0️⃣ Sair\n\n'
  text+='🛒 *Comprar:* !adotar espécie Nome\n'
  text+='Ex.: *!adotar papagaio Asa*'
  return text
}

export function petAdoptionListText(selection,{style,ability,money}={}){
  const category=petAdoptionCategory(selection)
  if(!category)return petAdoptionMenuText()
  const pets=petAdoptionCategoryPets(category.id)
  let text=`🐾 *PETS — ${category.label.toUpperCase()}*\n`
  text+=`📋 ${pets.length} opções • Ordenadas por preço\n\n`
  pets.forEach((p,i)=>{
    text+=`*${i+1}.* ${p.label} — *R$ ${money?money(p.price):p.price.toLocaleString('pt-BR')}*\n`
    text+=`   ⭐ Nv.${p.level} • ${style?style(p.species):p.species}\n`
    text+=`   ✨ ${ability?ability(p.species):''}\n`
  })
  text+='\n👉 Mande o *número* para ver o pet.\n'
  text+='9️⃣ Voltar às categorias • 0️⃣ Sair\n'
  text+='🛒 *!adotar espécie Nome* para comprar.'
  return text
}

export function petAdoptionDetailText(species,{style,ability,money}={}){
  const p=ADOPTABLE_PETS.find(x=>x.species===String(species||''))
  if(!p)return '🐾 Pet não encontrado. Use *!adotar* para voltar ao catálogo.'
  let text=`🐾 *${p.label}*\n\n`
  text+=`🏷️ Categoria: ${style?style(p.species):p.species}\n`
  text+=`⭐ Nível mínimo: *${p.level}*\n`
  text+=`💰 Preço: *R$ ${money?money(p.price):p.price.toLocaleString('pt-BR')}*\n`
  text+=`✨ Habilidades: *${ability?ability(p.species):''}*\n\n`
  text+=`🛒 Para comprar: *!adotar ${p.species} Nome*\n`
  text+='9️⃣ Voltar à lista • 0️⃣ Sair'
  return text
}
