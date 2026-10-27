// Regras puras para o coringa exclusivo do Leilão das Sombras.
// Mantém o bônus normal de um estilo único, ou fornece só um bônus universal
// quando a dupla possui estilos diferentes ou não classificados.
export function resolveAstralLynxWildcard(species=[],styles=[]){
  if(!Array.isArray(species)||!Array.isArray(styles)||species.length!==3||styles.length!==3)return null
  if(new Set(species).size!==3)return null
  const index=species.findIndex(id=>['lince_astral','onca_eclipse_20261026','guaxinim_errante_20261027'].includes(id))
  if(index<0)return null
  const others=styles.filter((_,i)=>i!==index)
  const sameStyle=others[0] && others[0]===others[1]
  return sameStyle?{style:others[0],universal:false}:{style:'coringa',universal:true}
}

// Coringas registrados: nenhuma recompensa antiga passa a ser Coringa por engano.
export const PET_TEAM_WILDCARD_SPECIES=Object.freeze([
  'morcego_madrugada',
  'camaleao_lendario',
  'lince_astral',
  'onca_eclipse_20261026',
  'guaxinim_errante_20261027'
])

// Sinergia exclusiva de Collab; os atributos individuais continuam separados.
// A formação deve ter exatamente 3 pets diferentes pertencentes à mesma collab
// ou substituídos pelos Coringas registrados. Não mistura duas collabs.
export function resolveCollabWildcardTeam(species=[],collabGroups=[]){
  if(!Array.isArray(species)||species.length!==3||new Set(species).size!==3)return null
  if(!Array.isArray(collabGroups))return null
  const wildcards=new Set(PET_TEAM_WILDCARD_SPECIES)
  const wildcardCount=species.filter(id=>wildcards.has(id)).length
  if(wildcardCount===3)return null // Nenhuma collab sem ao menos um herói original.
  const matches=collabGroups.filter(group=>{
    if(!Array.isArray(group?.species)||!group.species.length)return false
    const heroes=new Set(group.species)
    return species.every(id=>heroes.has(id)||wildcards.has(id)) &&
      species.filter(id=>heroes.has(id)).length===3-wildcardCount
  })
  if(matches.length!==1)return null // Grupo ambíguo ou misturado: sem bônus.
  const tier=[
    {attack:.20,crit:.05}, // 3 heróis originais
    {attack:.12,crit:.03}, // 2 originais + 1 Coringa
    {attack:.06,crit:.01}  // 1 original + 2 Coringas
  ][wildcardCount]
  if(!tier)return null
  return {
    id:matches[0].id,label:matches[0].label,
    heroesCount:3-wildcardCount,wildcardCount,
    full:wildcardCount===0,attack:tier.attack,crit:tier.crit
  }
}
