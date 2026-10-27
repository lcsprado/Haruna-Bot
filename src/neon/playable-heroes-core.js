import {PECADOS_HEROES} from './sete-pecados-catalog.js'

// Combatente jogavel ≠ companion/pet. A classe e seus Despertares continuam no banco.
export const HERO_COMBAT_PROFILES=Object.freeze({
  pecado_meliodas:{hp:70,atk:18,def:10,spd:13,role:'Contra-ataque',skill:'Full Counter'},
  pecado_ban:{hp:100,atk:14,def:11,spd:15,role:'Regeneração',skill:'Snatch'},
  pecado_escanor:{hp:85,atk:21,def:10,spd:7,role:'Explosão solar',skill:'The One'},
  pecado_king:{hp:100,atk:11,def:17,spd:10,role:'Suporte',skill:'Chastiefol'},
  pecado_diane:{hp:130,atk:12,def:22,spd:5,role:'Proteção',skill:'Gideon'},
  pecado_gowther:{hp:60,atk:15,def:9,spd:14,role:'Controle',skill:'Rewrite Light'},
  pecado_merlin:{hp:70,atk:18,def:9,spd:13,role:'Magia',skill:'Infinity'}
});
export const PLAYABLE_HERO_IDS=Object.freeze(PECADOS_HEROES.map(x=>x.species));
export const playableHero=id=>PECADOS_HEROES.find(x=>x.species===String(id||''))||null;
export const heroMasteryStage=x=>Math.min(5,1+[100,300,700,1300].filter(t=>Number(x||0)>=t).length);

export function heroCombatStats(st,heroId){
  const hero=HERO_COMBAT_PROFILES[heroId];
  if(!hero)return null;
  const n=(k,other=0)=>Number(st?.[k]??other)||0;
  const maxHp=Math.max(1,n('max_hp',100)-n('class_hp_bonus')+hero.hp);
  const sourceMax=Math.max(1,n('max_hp',100));
  return {
    heroId,hp:Math.max(0,Math.min(maxHp,Math.round(n('hp')/sourceMax*maxHp))),
    maxHp,
    atk:Math.max(1,n('atk')-n('class_atk_bonus')+hero.atk),
    def:Math.max(1,n('def')-n('class_def_bonus')+hero.def),
    spd:Math.max(1,n('spd')-n('class_spd_bonus')+hero.spd),
    persistentMaxHp:sourceMax
  };
}
// Vida temporária do herói volta à escala do jogador original; nunca grava
// os bônus do herói ou substitui a classe/Despertar no banco.
export function heroHpToPersistent(hp,combatMaxHp,persistentMaxHp){
  const combat=Math.max(1,Number(combatMaxHp)||1),max=Math.max(1,Number(persistentMaxHp)||1);
  return Math.max(0,Math.min(max,Math.floor(Math.max(0,Number(hp)||0)/combat*max)));
}
export function excludeActiveHeroPet(team,heroId){
  if(!heroId)return [...(team||[])];
  return (team||[]).filter(p=>String(p?.species||'')!==heroId);
}

// Efeitos pessoais e limitados, sem debuff global permanente de Boss.
// Nao usam passivas da classe, bonus especiais do mesmo pet nem Despertar.
export function heroAttack({heroId,damage=0,hp=1,maxHp=1,attackIndex=1,state={},context='raid'}={}){
  const id=String(heroId||''),n=Math.max(1,Math.floor(Number(damage)||1));
  if(!HERO_COMBAT_PROFILES[id])return {damage:n,heal:0,allyHeal:0,state:{...(state||{})},activated:false};
  const next={...(state||{})};
  const index=Math.max(1,Math.floor(Number(attackIndex)||1));
  const special=index%8===0,ultimate=index%25===0;
  let bonus=0,heal=0,allyHeal=0;
  if(id==='pecado_escanor'){
    bonus=Number(hp)/Math.max(1,Number(maxHp))>.7?.04:0;
    if(special)bonus+=.15;
    if(ultimate)next.sunCharges=3;
    if(Number(next.sunCharges||0)>0){bonus+=.25;next.sunCharges--;}
  }else if(id==='pecado_meliodas'){
    bonus=.03+(special?.12:0);
    if(ultimate)next.assaultCharges=3;
    if(Number(next.assaultCharges||0)>0){bonus+=.15;next.assaultCharges--;}
  }else if(id==='pecado_ban'){
    bonus=.02+(special?.10:0)+(ultimate?.15:0);
    if(special)heal+=Math.ceil(Math.max(1,Number(maxHp))*.01);
    if(ultimate)heal+=Math.ceil(Math.max(1,Number(maxHp))*.05);
  }else if(id==='pecado_diane'){
    bonus=special?.10:0;
    if(ultimate)next.guardCharges=1;
  }else if(id==='pecado_king'){
    bonus=.02+(special?.10:0);
    if(special)allyHeal=Math.ceil(Math.max(1,Number(maxHp))*.02);
    if(ultimate)allyHeal+=Math.ceil(Math.max(1,Number(maxHp))*.05);
  }else if(id==='pecado_merlin'){
    bonus=.03+(special?.15:0);
    if(ultimate)next.cubeCharges=1;
  }else if(id==='pecado_gowther'){
    if(special)next.weaknessCharges=3;
    bonus=(Number(next.weaknessCharges||0)>0?.04:0)+(ultimate?.15:0);
    if(Number(next.weaknessCharges||0)>0)next.weaknessCharges--;
  }
  // Guardrail contra boosts multiplicativos descontrolados.
  const cap=context==='boss'?.30:.35;
  return {damage:Math.max(1,Math.floor(n*(1+Math.min(cap,bonus)))),heal,allyHeal,
    state:next,activated:special||ultimate};
}
export function heroDefense({heroId,damage=0,state={}}={}){
  const next={...(state||{})};let rate=0;
  if(heroId==='pecado_diane'){
    rate=.04;
    if(Number(next.guardCharges||0)>0){rate+=.20;next.guardCharges--;}
  }
  if(heroId==='pecado_merlin'&&Number(next.cubeCharges||0)>0){rate+=.20;next.cubeCharges--;}
  if(heroId==='pecado_king')rate=.03;
  if(heroId==='pecado_ban')rate=.02;
  return {damage:Math.max(0,Math.round(Math.max(0,Number(damage)||0)*(1-Math.min(.30,rate)))),healAfter:0,state:next};
}
