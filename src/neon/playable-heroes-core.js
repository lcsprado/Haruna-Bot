import {PECADOS_HEROES,PECADOS_WEAPONS,PECADOS_ARMORS} from './sete-pecados-catalog.js'

// Combatente jogavel ≠ companion/pet. A classe e seus Despertares continuam no banco.
export const HERO_COMBAT_PROFILES=Object.freeze({
  pecado_meliodas:{hp:70,atk:18,def:10,spd:13,role:'Atacante • contra-ataque',range:'Corpo a corpo',skill:'Full Counter'},
  pecado_ban:{hp:100,atk:14,def:11,spd:15,role:'Lutador • sobrevivência',range:'Corpo a corpo',skill:'Snatch'},
  pecado_escanor:{hp:85,atk:21,def:10,spd:7,role:'Atacante • explosão solar',range:'Corpo a corpo',skill:'The One'},
  pecado_king:{hp:100,atk:11,def:17,spd:10,role:'Suporte • cura e proteção',range:'Longa distância',skill:'Chastiefol'},
  pecado_diane:{hp:130,atk:12,def:22,spd:5,role:'Defensora • tanque',range:'Corpo a corpo',skill:'Gideon'},
  pecado_gowther:{hp:60,atk:15,def:9,spd:14,role:'Controlador • debuff',range:'Longa distância',skill:'Rewrite Light'},
  pecado_merlin:{hp:70,atk:18,def:9,spd:13,role:'Maga • dano e barreira',range:'Longa distância',skill:'Infinity'}
});
export const PLAYABLE_HERO_IDS=Object.freeze(PECADOS_HEROES.map(x=>x.species));
export const playableHero=id=>PECADOS_HEROES.find(x=>x.species===String(id||''))||null;
// XP é requisito, não uma promoção automática. O estágio pago fica salvo na tabela.
export const HERO_MASTERY_XP=Object.freeze([0,300,900,1800,3200]);
export const HERO_MASTERY_COSTS=Object.freeze([0,500000,2000000,5000000,10000000]);
export const heroMasteryStage=x=>Math.min(5,1+HERO_MASTERY_XP.slice(1).filter(t=>Number(x||0)>=t).length);
export const heroNextMastery=stage=>{
  const n=Math.max(1,Math.min(5,Math.floor(Number(stage)||1)));
  return n<5?{stage:n+1,xp:HERO_MASTERY_XP[n],cash:HERO_MASTERY_COSTS[n]}:null;
};
// Recompensa somente o equipamento exclusivo do próprio personagem, nunca
// qualquer item da collab. Bônus menores em PvP para preservar as classes.
export function heroGearSynergy(heroId,weaponId,armorId,context='raid'){
  const index=PECADOS_HEROES.findIndex(h=>h.species===heroId);
  if(index<0)return {weapon:false,armor:false,full:false,attackBonus:0,defenseBonus:0};
  const weapon=PECADOS_WEAPONS[index]?.id===String(weaponId||'');
  const armor=PECADOS_ARMORS[index]?.id===String(armorId||'');
  const full=weapon&&armor;
  const pvp=context==='pvp';
  return {weapon,armor,full,attackBonus:(weapon?(pvp?.015:.03):0)+(full?(pvp?.01:.015):0),
    defenseBonus:(armor?(pvp?.02:.03):0)+(full?(pvp?.01:.015):0)};
}

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
// Ficha de visualização com a MESMA fórmula inicial usada na entrada da Raid/Boss:
// classe substituída pelo herói + equipamentos/encantos, sem alterar o banco.
export function heroCombatSheetFromProfile(profile,heroId){
  if(!profile||!HERO_COMBAT_PROFILES[heroId])return null;
  const h=heroCombatStats(profile,heroId);
  const number=v=>Number(v)||0;
  return {
    ...h,
    name:playableHero(heroId)?.name||heroId,
    role:HERO_COMBAT_PROFILES[heroId].role,
    range:HERO_COMBAT_PROFILES[heroId].range,
    skill:HERO_COMBAT_PROFILES[heroId].skill,
    maxHp:h.maxHp+number(profile.equipment_hp),
    hp:Math.min(h.hp,h.maxHp+number(profile.equipment_hp)),
    atk:Math.round((h.atk+number(profile.equipment_atk))*(1+number(profile.attack_pct_bonus))),
    def:h.def+number(profile.equipment_def),
    spd:h.spd+number(profile.equipment_spd)
  };
}
// Vida temporária do herói volta à escala do jogador original; nunca grava
// os bônus do herói ou substitui a classe/Despertar no banco.
export function heroHpToPersistent(hp,combatMaxHp,persistentMaxHp){
  const combat=Math.max(1,Number(combatMaxHp)||1),max=Math.max(1,Number(persistentMaxHp)||1);
  return Math.max(0,Math.min(max,Math.max(Number(hp)>0?1:0,Math.floor(Math.max(0,Number(hp)||0)/combat*max))));
}
// Salva somente o DELTA de HP desde o ultimo golpe. O resto fracionario
// permanece no estado da luta, evitando erosao de 1 HP por turno causada
// por converter constantemente entre escalas da classe e do heroi.
export function persistHeroHpDelta({previousPersistentHp=0,previousCombatHp=0,
  currentCombatHp=0,combatMaxHp=1,persistentMaxHp=1,remainder=0}={}){
  const pmax=Math.max(1,Number(persistentMaxHp)||1);
  const cmax=Math.max(1,Number(combatMaxHp)||1);
  const before=Math.max(0,Number(previousCombatHp)||0);
  const after=Math.max(0,Number(currentCombatHp)||0);
  const safeRemainder=Number.isFinite(Number(remainder))?Math.max(-1,Math.min(1,Number(remainder))):0;
  const exact=(after-before)*pmax/cmax+safeRemainder;
  const integral=Math.trunc(exact);
  let hp=Math.max(0,Math.min(pmax,Math.round(Number(previousPersistentHp)||0)+integral));
  let rest=exact-integral;
  if(after<=0){hp=0;rest=0;}
  else if(after>=cmax){hp=pmax;rest=0;}
  else {hp=Math.max(1,hp);if(hp>=pmax)rest=0;}
  return {hp,remainder:rest};
}

export function excludeActiveHeroPet(team,heroId){
  // Hero-only: nenhum dos sete pode servir como pet, independentemente
  // de qual classe/heroi esta equipado no momento.
  return (team||[]).filter(p=>p&&!PLAYABLE_HERO_IDS.includes(String(p.species||'')));
}

// Efeitos pessoais e limitados, sem debuff global permanente de Boss.
// Nao usam passivas da classe, bonus especiais do mesmo pet nem Despertar.

/** Técnica e efeito de jogo: adaptações limitadas dos poderes oficiais do anime. */
export const HERO_SKILL_GUIDE=Object.freeze({
  pecado_meliodas:{passive:'Hellblaze: +3% de dano com chamas negras.',
    special:'Full Counter: a cada 8 ataques prepara contra-ataque; parte do próximo golpe recebido volta no ataque seguinte.',
    ultimate:'Revenge Counter: a cada 25 ataques converte dano sofrido em explosão e mantém fogo demoníaco por 2 ataques.'},
  pecado_ban:{passive:'Imortalidade: regenera 1% do HP máximo a cada 8 ataques; -2% do dano recebido.',
    special:'Snatch: a cada 8 ataques rouba força; +10% de dano e reduz golpes recebidos por até 3 impactos.',
    ultimate:'Hunter Fest: a cada 25 ataques, +15% de dano e recupera 5% do HP máximo.'},
  pecado_escanor:{passive:'Sunshine: o sol fortalece os ataques enquanto houver luz do dia e HP acima de 70%.',
    special:'Cruel Sun: ataque solar com +15% de dano a cada 8 ataques.',
    ultimate:'The One: a cada 25 ataques entra no estado solar por 3 golpes (+25% de dano).'},
  pecado_king:{passive:'Disaster/Chastiefol: +2% de dano e -3% de dano recebido.',
    special:'Guardian: a cada 8 ataques, protege o próximo golpe e cura um aliado ferido em Raid.',
    ultimate:'Sunflower: a cada 25 ataques, explosão solar e cura reforçada de um aliado em Raid.'},
  pecado_diane:{passive:'Heavy Metal: pele de metal que reduz em 4% o dano recebido.',
    special:'Creation: a cada 8 ataques, +10% de dano e resistência extra no próximo golpe.',
    ultimate:'Mother Catastrophe: a cada 25 ataques, +15% de dano e uma barreira pesada para o próximo golpe.'},
  pecado_gowther:{passive:'Invasion: interfere na leitura do inimigo, reduzindo 3% dos golpes recebidos.',
    special:'Rewrite Light: a cada 8 ataques, confunde o inimigo por 3 golpes; aumenta o seu dano e reduz dano recebido.',
    ultimate:'Nightmare Teller: a cada 25 ataques, +15% de dano e uma proteção mental temporária.'},
  pecado_merlin:{passive:'Infinity: magia sustentada com +3% de dano.',
    special:'Exterminate: a cada 8 ataques, +15% de dano e magia residual nos 2 golpes seguintes.',
    ultimate:'Perfect Cube: a cada 25 ataques, +10% de dano e uma barreira que reduz o próximo golpe em 20%.'}
});
const HERO_SUN_HOUR=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'});

export function heroAttack({heroId,damage=0,hp=1,maxHp=1,attackIndex=1,state={},context='raid',masteryStage=1,nowMs=Date.now(),gear=null}={}){
  const id=String(heroId||''),n=Math.max(1,Math.floor(Number(damage)||1));
  if(!HERO_COMBAT_PROFILES[id])return {damage:n,heal:0,allyHeal:0,state:{...(state||{})},activated:false};
  const next={...(state||{})};
  const index=Math.max(1,Math.floor(Number(attackIndex)||1));
  const stage=Math.max(1,Math.min(5,Math.floor(Number(masteryStage)||1)));
  const special=index%8===0&&stage>=2,ultimate=index%25===0&&stage>=3;
  const healthRatio=Math.max(0,Math.min(1,Number(hp)/Math.max(1,Number(maxHp))));
  let bonus=0,heal=0,allyHeal=0,technique=null;
  if(id==='pecado_meliodas'){
    // Hellblaze, Full Counter (próximo golpe recebido), Revenge Counter.
    bonus=.03;
    if(stage>=3){
      next.revengeStored=Math.max(0,Math.min(n*.10,Number(next.revengeStored||0)));
    }
    if(Number(next.counterStored||0)>0){
      bonus+=Math.min(.16,Number(next.counterStored)/n);
      next.counterStored=0;
      technique='Full Counter';
    }
    if(special){next.fullCounterReady=true;technique=technique||'Full Counter preparado';}
    if(ultimate){
      bonus+=.12+Math.min(.10,Number(next.revengeStored||0)/n);
      next.revengeStored=0;next.revengeCharges=3;technique='Revenge Counter';
    }
    if(Number(next.revengeCharges||0)>0){bonus+=.08;next.revengeCharges--;}
  }else if(id==='pecado_ban'){
    bonus=.02;
    if(special){bonus+=.10;next.snatchCharges=3;technique='Snatch';}
    if(index%8===0)heal+=Math.ceil(Math.max(1,Number(maxHp))*.01);
    if(ultimate){bonus+=.15;heal+=Math.ceil(Math.max(1,Number(maxHp))*.05);technique='Hunter Fest';}
  }else if(id==='pecado_escanor'){
    const hour=Number(HERO_SUN_HOUR.format(new Date(Number(nowMs)||Date.now())));
    if(hour>=6&&hour<18&&healthRatio>.7)bonus+=hour>=11&&hour<13?.06:.04;
    if(special){bonus+=.15;technique='Cruel Sun';}
    if(ultimate){next.sunCharges=3;technique='The One';}
    if(Number(next.sunCharges||0)>0){bonus+=.25;next.sunCharges--;}
  }else if(id==='pecado_diane'){
    if(special){bonus+=.10;next.heavyMetalCharges=1;technique='Creation';}
    if(ultimate){bonus+=.15;next.guardCharges=1;technique='Mother Catastrophe';}
  }else if(id==='pecado_king'){
    bonus=.02;
    if(special){
      bonus+=.10;next.guardianCharges=1;
      allyHeal=Math.ceil(Math.max(1,Number(maxHp))*.02);technique='Chastiefol — Guardian';
    }
    if(ultimate){
      bonus+=.10;next.sunflowerCharges=3;
      allyHeal+=Math.ceil(Math.max(1,Number(maxHp))*.05);technique='Chastiefol — Sunflower';
    }
    if(Number(next.sunflowerCharges||0)>0){bonus+=.07;next.sunflowerCharges--;}
  }else if(id==='pecado_merlin'){
    bonus=.03;
    if(special){bonus+=.15;next.infinityCharges=3;technique='Exterminate';}
    if(ultimate){bonus+=.10;next.cubeCharges=1;technique='Perfect Cube';}
    if(Number(next.infinityCharges||0)>0){bonus+=.06;next.infinityCharges--;}
  }else if(id==='pecado_gowther'){
    if(special){next.weaknessCharges=3;next.confusionBlocks=3;technique='Rewrite Light';}
    if(Number(next.weaknessCharges||0)>0){bonus+=.04;next.weaknessCharges--;}
    if(ultimate){bonus+=.15;next.nightmareBlocks=1;technique='Nightmare Teller';}
  }
  // Maestria IV e V concedem +1% cada; o bônus final nunca excede o teto.
  bonus+=(stage>=4?.01:0)+(stage>=5?.01:0);
  bonus+=heroGearSynergy(id,gear?.weaponId,gear?.armorId,context).attackBonus;
  const cap=context==='boss'?.30:.35;
  return {damage:Math.max(1,Math.floor(n*(1+Math.min(cap,bonus)))),heal,allyHeal,
    technique,state:next,activated:special||ultimate};
}
export function heroDefense({heroId,damage=0,state={},gear=null,context='raid'}={}){
  const next={...(state||{})};let rate=0;
  const incoming=Math.max(0,Number(damage)||0);
  if(heroId==='pecado_diane'){
    rate=.04; // Heavy Metal, sempre.
    if(Number(next.heavyMetalCharges||0)>0){rate+=.08;next.heavyMetalCharges--;}
    if(Number(next.guardCharges||0)>0){rate+=.20;next.guardCharges--;}
  }
  if(heroId==='pecado_meliodas'){
    if(next.fullCounterReady&&incoming>0){
      // O motor não distingue golpe físico de mágico: contra-ataque de energia
      // limitado, acumulado no próximo golpe. Nunca subtrai HP de Boss fora da transação.
      next.counterStored=Math.min(500,Math.round(incoming*.30));next.fullCounterReady=false;
    }
    next.revengeStored=Math.max(0,Math.min(500,Number(next.revengeStored||0)+incoming*.05));
  }
  if(heroId==='pecado_ban'){
    rate=.02;
    if(Number(next.snatchCharges||0)>0){rate+=.10;next.snatchCharges--;}
  }
  if(heroId==='pecado_king'){
    rate=.03;
    if(Number(next.guardianCharges||0)>0){rate+=.12;next.guardianCharges--;}
  }
  if(heroId==='pecado_gowther'){
    rate=.03;
    if(Number(next.confusionBlocks||0)>0){rate+=.08;next.confusionBlocks--;}
    if(Number(next.nightmareBlocks||0)>0){rate+=.10;next.nightmareBlocks--;}
  }
  if(heroId==='pecado_merlin'&&Number(next.cubeCharges||0)>0){
    rate+=.20;next.cubeCharges--;
  }
  rate+=heroGearSynergy(heroId,gear?.weaponId,gear?.armorId,context).defenseBonus;
  return {damage:Math.max(0,Math.round(incoming*(1-Math.min(.30,rate)))),healAfter:0,state:next};
}

// PvP tem até 20 ataques por combatente; técnicas disparam mais cedo e com
// limites menores que Boss/Raid. Toda a memória é local ao duelo.
export function heroPvpAttack({heroId,damage=0,hp=1,maxHp=1,attackIndex=1,masteryStage=1,
  state={},gear=null,nowMs=Date.now()}={}){
  const id=String(heroId||''),base=Math.max(1,Math.round(Number(damage)||1));
  const next={...(state||{})};
  if(!HERO_COMBAT_PROFILES[id])return {damage:base,heal:0,state:next,technique:null,debuffHits:0};
  const stage=Math.max(1,Math.min(5,Math.floor(Number(masteryStage)||1)));
  const index=Math.max(1,Math.floor(Number(attackIndex)||1));
  const special=stage>=2&&index%4===0;
  const ultimate=stage>=3&&index>=10&&!next.ultimateUsed;
  let bonus=0,heal=0,technique=null,debuffHits=0;
  if(id==='pecado_meliodas'){
    bonus=.02;
    if(next.counterStored){bonus+=Math.min(.12,Number(next.counterStored)/base);next.counterStored=0;technique='Full Counter';}
    if(special){next.counterReady=true;technique=technique||'Full Counter preparado';}
    if(ultimate){bonus+=.12;technique='Revenge Counter';}
  }else if(id==='pecado_ban'){
    bonus=.015;
    if(index%5===0&&Number(next.regenUses||0)<3){heal+=Math.ceil(Math.max(1,Number(maxHp))*.005);next.regenUses=Number(next.regenUses||0)+1;}
    if(special){bonus+=.08;next.snatchCharges=2;technique='Snatch';}
    if(ultimate){bonus+=.10;heal+=Math.ceil(Math.max(1,Number(maxHp))*.03);technique='Hunter Fest';}
  }else if(id==='pecado_escanor'){
    const hour=Number(HERO_SUN_HOUR.format(new Date(Number(nowMs)||Date.now())));
    if(hour>=6&&hour<18&&Number(hp)/Math.max(1,Number(maxHp))>.7)bonus+=.03;
    if(special){bonus+=.10;technique='Cruel Sun';}
    if(ultimate){bonus+=.17;technique='The One';}
  }else if(id==='pecado_diane'){
    if(special){bonus+=.05;next.heavyMetalCharges=1;technique='Creation';}
    if(ultimate){bonus+=.08;next.guardCharges=1;technique='Mother Catastrophe';}
  }else if(id==='pecado_king'){
    bonus=.01;
    if(special){next.guardianCharges=1;heal+=Math.ceil(Number(maxHp)*.012);technique='Guardian';}
    if(ultimate){bonus+=.10;heal+=Math.ceil(Number(maxHp)*.035);technique='Sunflower';}
  }else if(id==='pecado_gowther'){
    if(special){bonus+=.06;debuffHits=2;technique='Rewrite Light';}
    if(ultimate){bonus+=.09;debuffHits=2;technique='Nightmare Teller';}
  }else if(id==='pecado_merlin'){
    bonus=.02;
    if(special){bonus+=.10;technique='Exterminate';}
    if(ultimate){next.cubeCharges=1;bonus+=.08;technique='Perfect Cube';}
  }
  if(ultimate)next.ultimateUsed=true;
  // Enfraquecimento aplicado por Gowther: máximo dois ataques, 8%.
  if(Number(next.debuffHits||0)>0){bonus-=.08;next.debuffHits--;}
  bonus+=(stage>=4?.005:0)+(stage>=5?.005:0);
  bonus+=heroGearSynergy(id,gear?.weaponId,gear?.armorId,'pvp').attackBonus;
  return {damage:Math.max(1,Math.round(base*(1+Math.max(-.08,Math.min(.18,bonus))))),
    heal:Math.max(0,heal),state:next,technique,debuffHits};
}
export function heroPvpDefense({heroId,damage=0,state={},gear=null}={}){
  const next={...(state||{})},incoming=Math.max(0,Number(damage)||0);
  let rate=0;
  if(heroId==='pecado_diane'){
    rate=.05;
    if(Number(next.heavyMetalCharges||0)>0){rate+=.10;next.heavyMetalCharges--;}
    if(Number(next.guardCharges||0)>0){rate+=.17;next.guardCharges--;}
  }else if(heroId==='pecado_ban'){
    rate=.015;
    if(Number(next.snatchCharges||0)>0){rate+=.08;next.snatchCharges--;}
  }else if(heroId==='pecado_meliodas'){
    if(next.counterReady&&incoming>0){next.counterStored=Math.min(300,incoming*.25);next.counterReady=false;}
  }else if(heroId==='pecado_king'){
    rate=.02;
    if(Number(next.guardianCharges||0)>0){rate+=.12;next.guardianCharges--;}
  }else if(heroId==='pecado_gowther'){
    rate=.025;
  }else if(heroId==='pecado_merlin'&&Number(next.cubeCharges||0)>0){
    rate=.17;next.cubeCharges--;
  }
  rate+=heroGearSynergy(heroId,gear?.weaponId,gear?.armorId,'pvp').defenseBonus;
  return {damage:Math.max(0,Math.round(incoming*(1-Math.min(.25,rate)))),state:next};
}
