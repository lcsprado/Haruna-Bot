// Somente módulos informativos podem falhar sem derrubar a identidade,
// carteira, inventário, pets, combate ou permissões do jogador.
export function createOptionalBootstrapLoader(onFailure=()=>{}){
  const unavailableSections=[];
  async function optional(section,run,fallback){
    try{return await run();}
    catch(error){
      unavailableSections.push(section);
      try{onFailure({section,code:String(error?.code||error?.name||'UNKNOWN').slice(0,48)});}
      catch{} // logging is never allowed to hide an already degraded section
      return fallback;
    }
  }
  return {optional,unavailableSections};
}
