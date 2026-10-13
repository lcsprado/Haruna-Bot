// Coleção interativa por habilidades, como o catálogo de adoção.
// Somente apresentação e filtragem; equipar/sacrificar é executado no index.js.
import { PET_ADOPTION_CATEGORIES } from './pet-adoption-menu.js'
import { petCombatSpecialty, petSacrificeReward } from './game-catalog.js'

export const PET_COLLECTION_CATEGORIES = Object.freeze([
  ...PET_ADOPTION_CATEGORIES.map(c=>({id:c.id,key:c.key,label:c.label,keys:c.keys})),
  {id:9,key:'lendarios',label:'🌟 Lendários de Raid'},
  {id:10,key:'todos',label:'📚 Todos os pets'}
])

export function petCollectionCategory(selection){
  const n=Number(selection)
  const key=String(selection||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return PET_COLLECTION_CATEGORIES.find(c=>c.id===n||c.key===key)||null
}

export function petCollectionCategoryPets(pets=[],selection,isLegendary=()=>false){
  const category=petCollectionCategory(selection)
  if(!category)return []
  return (Array.isArray(pets)?pets:[]).filter(p=>{
    if(category.id===10)return true
    if(category.id===9)return isLegendary(p.species)
    const spec=petCombatSpecialty(p.species)
    return category.keys.some(key=>Number(spec[key]||0)>0)
  })
}

export function petCollectionMenuText(pets=[],{mode='manage',isLegendary=()=>false}={}){
  const sacrifice=mode==='sacrifice'
  let text=sacrifice?'♻️ *SACRIFICAR — SUA COLEÇÃO*\n\n':'🐾 *SUA COLEÇÃO DE PETS*\n\n'
  text+=`🐾 Você possui *${pets.length} pet(s)*.\n`
  text+=sacrifice?'Escolha uma categoria para consultar os pets e os valores do sacrifício:\n\n':'Escolha uma categoria para encontrar seu pet:\n\n'
  for(const c of PET_COLLECTION_CATEGORIES){
    const count=petCollectionCategoryPets(pets,c.id,isLegendary).length
    text+=`*${c.id}.* ${c.label} — *${count}*\n`
  }
  text+='\n💡 Um pet pode aparecer em várias categorias.\n'
  text+='🔒 Pet ativo, no time ou em expedição não pode ser sacrificado.\n'
  text+='\n👉 Responda com o *número da categoria*.\n0️⃣ Sair'
  return text
}

function petStatus(p,{teamIds=new Set(),expeditionIds=new Set()}={}){
  const id=Number(p.id)
  if(p.active)return '🟢 Ativo'
  if(teamIds.has(id))return '🛡️ No time'
  if(expeditionIds.has(id))return '🧭 Em expedição'
  return '⚪ Reserva'
}

export function petCollectionListText(pets,selection,{
  mode='manage',isLegendary=()=>false,style=species=>species,
  teamIds=new Set(),expeditionIds=new Set(),maxHp=()=>0
}={}){
  const c=petCollectionCategory(selection)
  if(!c)return '🐾 Categoria não encontrada. Use *!meuspets*.'
  const selected=petCollectionCategoryPets(pets,c.id,isLegendary)
  let text=`${mode==='sacrifice'?'♻️':'🐾'} *COLEÇÃO — ${c.label.toUpperCase()}*\n`
  text+=`📋 *${selected.length} pet(s)* nessa categoria\n\n`
  if(!selected.length)text+='Nenhum pet nesta categoria.\n'
  selected.forEach((p,i)=>{
    const legendary=isLegendary(p.species)
    text+=`*${i+1}.* ${legendary?'🌟 ':''}*${p.name}* — ${petStatus(p,{teamIds,expeditionIds})}\n`
    text+=`   ⭐ Nv.${p.level} • ❤️ ${p.hp}/${maxHp(p.level,p.xp,p.species)} • ${style(p.species)}\n`
  })
  text+='\n👉 Responda com o *número do pet* para ver detalhes e ações.\n'
  text+='99️⃣ Voltar às categorias • 0️⃣ Sair'
  return text
}

export function petCollectionDetailText(p,{
  isLegendary=()=>false,identity=species=>species,bonus=()=>({label:'',text:''}),
  teamIds=new Set(),expeditionIds=new Set(),maxHp=()=>0,maxEnergy=()=>0,
  mode='manage',money=n=>String(n)
}={}){
  const itemBonus=bonus(p)
  const blocked=p.active||teamIds.has(Number(p.id))||expeditionIds.has(Number(p.id))
  const reward=petSacrificeReward(p.species,p.level,p.xp,p.purchase_price)
  const reason=p.active?'pet equipado':teamIds.has(Number(p.id))?'pet no time':expeditionIds.has(Number(p.id))?'pet em expedição':''
  let text=`🐾 *${p.name.toUpperCase()}* ${isLegendary(p.species)?'🌟 LENDÁRIO':''}\n\n`
  text+=`📍 Situação: *${petStatus(p,{teamIds,expeditionIds})}*\n`
  text+=`${identity(p.species)}\n`
  text+=`⭐ Nível: *${p.level}* • ⚔️ Poder: *${p.power}*\n`
  text+='ℹ️ Poder serve para duelos de pets; não aumenta o dano no Boss/Raid.\n'
  text+=`❤️ HP: *${p.hp}/${maxHp(p.level,p.xp,p.species)}*\n`
  text+=`⚡ Energia: *${p.energy}/${maxEnergy(p.level,p.species)}*\n\n`
  text+=`✨ *${itemBonus.label}*\n${itemBonus.text}\n\n`
  text+=`♻️ *Sacrifício:* ${blocked?'🔒 Bloqueado ('+reason+')':'💰 R$ '+money(reward.cash)+' • ✨ +'+money(reward.exp)+' EXP'}\n`
  text+='\n'
  text+=`1️⃣ ${p.active?'Pet já equipado':'Equipar pet'}\n`
  text+=`2️⃣ ${blocked?'🔒 Sacrifício indisponível':'♻️ Ver e confirmar sacrifício'}\n`
  text+='99️⃣ Voltar à lista • 0️⃣ Sair'
  return text
}

export function petCollectionSacrificeText(p,{money=n=>String(n),isLegendary=()=>false}={}){
  const reward=petSacrificeReward(p.species,p.level,p.xp,p.purchase_price)
  let text=`⚠️ *CONFIRMAR SACRIFÍCIO*\n\n🐾 Pet: *${p.name}*${isLegendary(p.species)?' 🌟 LENDÁRIO':''}\n`
  text+=`🆔 Identificação: *${p.id}* • ⭐ Nível: *${reward.level}*\n\n`
  if(reward.shopRefund)text+=`🛒 Preço de adoção: *R$ ${money(reward.originalPrice)}*\n♻️ Reembolso: *50% do preço de adoção*\n`
  else text+='🌟 Pet de Raid/evento: retorno simbólico, sem reembolso de compra.\n'
  text+=`💰 Você receberá: *R$ ${money(reward.cash)}*\n✨ EXP do personagem: *+${money(reward.exp)}*\n\n`
  text+='🚨 *IRREVERSÍVEL:* este pet será excluído definitivamente.\n'
  text+='🛡️ Pets ativos, no time ou em expedição estão protegidos.\n\n'
  text+='1️⃣ *CONFIRMAR SACRIFÍCIO*\n'
  text+='2️⃣ Não sacrificar — voltar ao pet\n'
  text+='0️⃣ Cancelar'
  return text
}
