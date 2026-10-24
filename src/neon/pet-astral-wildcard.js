// Regras puras para o coringa exclusivo do Leilão das Sombras.
// Mantém o bônus normal de um estilo único, ou fornece só um bônus universal
// quando a dupla possui estilos diferentes ou não classificados.
export function resolveAstralLynxWildcard(species=[],styles=[]){
  if(!Array.isArray(species)||!Array.isArray(styles)||species.length!==3||styles.length!==3)return null
  if(new Set(species).size!==3)return null
  const index=species.indexOf('lince_astral')
  if(index<0)return null
  const others=styles.filter((_,i)=>i!==index)
  const sameStyle=others[0] && others[0]===others[1]
  return sameStyle?{style:others[0],universal:false}:{style:'coringa',universal:true}
}
