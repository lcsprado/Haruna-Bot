// Sistema elemental dos sete Pecados — catálogo puro e cálculo opt-in.
// Nenhuma migração, crédito, débito ou alteração de atributos persistidos.
// Até a homologação dos combates, somente identificação e exibição ficam ativas.
export const HERO_ELEMENTS=Object.freeze({
  fire:Object.freeze({id:'fire',name:'Fogo',emoji:'🔥',role:'Ofensivo'}),
  water:Object.freeze({id:'water',name:'Água',emoji:'💧',role:'Sobrevivência'}),
  wind:Object.freeze({id:'wind',name:'Vento',emoji:'🌪️',role:'Agilidade'}),
  light:Object.freeze({id:'light',name:'Luz',emoji:'☀️',role:'Proteção'}),
  dark:Object.freeze({id:'dark',name:'Escuridão',emoji:'🌑',role:'Drenagem'})
});

export const SEVEN_SINS_ELEMENT_IDS=Object.freeze({
  pecado_meliodas:'dark',
  pecado_ban:'fire',
  pecado_diane:'water',
  pecado_king:'wind',
  pecado_gowther:'dark',
  pecado_merlin:'water',
  pecado_escanor:'light'
});

// Usa diretamente o identificador do combatente já selecionado em player_hero_mode.
// Classes tradicionais e IDs inválidos são neutros, sem exigir coluna nova no banco.
export function heroElement(heroId){
  return HERO_ELEMENTS[SEVEN_SINS_ELEMENT_IDS[String(heroId||'')]]||null;
}
export function heroElementLabel(heroId){
  const element=heroElement(heroId);
  return element?element.emoji+' '+element.name:'⚪ Neutro';
}

const TRIANGLE=Object.freeze({fire:'wind',wind:'water',water:'fire'});
export function elementalMatchup(attackerHeroId,defenderHeroId){
  const attacker=heroElement(attackerHeroId)?.id;
  const defender=heroElement(defenderHeroId)?.id;
  if(!attacker||!defender||attacker===defender)return 'neutral';
  if((attacker==='light'&&defender==='dark')||(attacker==='dark'&&defender==='light'))return 'clash';
  if(TRIANGLE[attacker]===defender)return 'advantage';
  if(TRIANGLE[defender]===attacker)return 'disadvantage';
  return 'neutral';
}

// Proposta inicial PARA TESTE: +6% apenas ao atacar com vantagem;
// Luz/Escuridão recebem +6% um contra o outro. Não penaliza atributos antigos.
export const ELEMENTAL_ADVANTAGE_BONUS=.06;
export function elementalDamageMultiplier(attackerHeroId,defenderHeroId){
  const relation=elementalMatchup(attackerHeroId,defenderHeroId);
  return relation==='advantage'||relation==='clash'?1+ELEMENTAL_ADVANTAGE_BONUS:1;
}

// Interruptor obrigatório: o motor de PvP/Boss/Raid NÃO chama esta função ainda.
// Integração real deve ser feita depois de testar snapshots de combatentes e
// compatibilidade com os tetos de habilidades, escudos e pets.
export function applyElementalDamage({damage=0,attackerHeroId=null,defenderHeroId=null,enabled=false}={}){
  const base=Math.max(0,Number.isFinite(Number(damage))?Number(damage):0);
  if(!enabled)return base;
  return Math.round(base*elementalDamageMultiplier(attackerHeroId,defenderHeroId));
}
