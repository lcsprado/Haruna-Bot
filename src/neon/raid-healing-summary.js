// Sem seção vazia ou repetição do nome da habilidade; o boletim de poderes
// identifica separadamente os gatilhos efetivos de cada herói/classe.
export function formatRaidPlayerHealing(x={},fmt=value=>Math.round(Number(value)||0).toLocaleString('pt-BR')){
  const pet=Math.max(0,Number(x.petSkillHealing||0))
  const combat=Math.max(0,Number(x.classHealing||0))
  const potions=Math.max(0,Number(x.potionHealing||0))
  const total=pet+combat+potions
  if(total<=0)return ''
  const sources=[]
  if(combat>0){
    const id=String(x.activeHeroId||'').replace(/^pecado_/,'')
    const actor=id?'herói '+id.charAt(0).toUpperCase()+id.slice(1):'classe'
    sources.push(actor+' +'+fmt(combat))
  }
  if(pet>0)sources.push('skill pet +'+fmt(pet))
  if(potions>0)sources.push('poções +'+fmt(potions)+' ('+Math.max(0,Number(x.potionUses||0))+'×)')
  return '\n💚 Cura recebida: +'+fmt(total)+' HP ('+sources.join(' · ')+')'
}
