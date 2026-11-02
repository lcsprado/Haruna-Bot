// Relatório de cura da Raid: personagem herói substitui a classe em combate.
// classHealing é o nome legado do acumulador; sua origem depende do heroId ativo.
export function formatRaidPlayerHealing(x={}, fmt=value=>Math.round(Number(value)||0).toLocaleString('pt-BR')){
  const petSkillHealing=Math.max(0,Number(x.petSkillHealing||0));
  const characterHealing=Math.max(0,Number(x.classHealing||0));
  const potionHealing=Math.max(0,Number(x.potionHealing||0));
  const healActivations=Math.max(0,Number(x.classHealingActivations||0));
  const healedTotal=petSkillHealing+characterHealing+potionHealing;
  let text='';
  if(healedTotal>0){
    text+='\n💚 *Cura recebida: +'+fmt(healedTotal)+' HP*';
    if(petSkillHealing>0)text+='\n   🐾 Skill do pet: +'+fmt(petSkillHealing)+' HP';
    if(characterHealing>0){
      if(x.activeHeroId){
        const heroId=String(x.activeHeroId).replace(/^pecado_/,'');
        const name=heroId.charAt(0).toUpperCase()+heroId.slice(1);
        text+='\n   🌈 Cura do herói '+name+': +'+fmt(characterHealing)+' HP ('+healActivations+' ativações)';
      }else{
        text+='\n   ⚜️ Passiva da classe: +'+fmt(characterHealing)+' HP';
      }
    }
    if(potionHealing>0)text+='\n   🧪 Poções: +'+fmt(potionHealing)+' HP ('+Number(x.potionUses||0)+' uso(s))';
  }else{
    text+='\n💚 Cura recebida: *0 HP* (nenhuma cura ativada)';
  }
  // Não atribuir a bênção do Paladino ao Ban ou a outro herói equipado.
  if(!x.activeHeroId&&String(x.playerClassId||'')==='paladin'){
    const opportunities=Math.max(0,Number(x.classHealingOpportunities||0));
    text+='\n🛡️ Bênção Restauradora: *'+healActivations+' ativação(ões)* / '+opportunities+' oportunidade(s) • *+'+fmt(characterHealing)+' HP*';
  }
  return text;
}
