// Cerco V4: regras puras para objetivos e suprimentos (inspirado em cercos de RPGs,
// sem reproduzir arte ou código de terceiros).
// V1-V3 permanecem imutáveis em src/neon/clan-siege.js.
export const SIEGE_V4_FRONTS=Object.freeze(['castle','gate','depot']);
export const SIEGE_V4_ACTIONS=Object.freeze(['attack','defend','repair','spy','supply']);
const FRONT=new Set(SIEGE_V4_FRONTS);
const pair={blue:'red',red:'blue'};
const full=(v,low,high)=>Math.min(high,Math.max(low,Number(v)||0));
const name={castle:'Castelo',gate:'Portão',depot:'Suprimentos'};
const symbols={attack:'⚔️',defend:'🛡️',repair:'🔨',spy:'🕵️',supply:'📦'};
const cap=3, gateMax=2, repairMax=2;
export const SIEGE_REPAIR_HP_V5=280; // somente novas partidas com rules_version >= 5
export const siegeRepairHp=rulesVersion=>Number(rulesVersion||4)>=5?SIEGE_REPAIR_HP_V5:220;

export function validateSiegeV4Move(action,target){
  if(!SIEGE_V4_ACTIONS.includes(action))throw new Error('Ação do Cerco inválida.');
  if(!FRONT.has(target))throw new Error('Escolha um objetivo válido para sua ação.');
  if(action==='supply'&&target!=='depot')throw new Error('Reabastecer utiliza o Depósito.');
  if(action==='repair'&&target==='depot')throw new Error('Reparar exige escolher Castelo ou Portão.');
  return {action,target};
}
function movesOf(match,moves){
  const sides={blue:[],red:[]};
  for(const m of moves){
    const side=String(m.clan_id)===String(match.blue_clan_id)?'blue':
      String(m.clan_id)===String(match.red_clan_id)?'red':null;
    if(!side)continue;
    const action=String(m.action||'');
    const target=action==='supply'?'depot':String(m.target||'castle');
    validateSiegeV4Move(action,target);
    sides[side].push({action,target});
  }
  return sides;
}
const count=(s,action,target)=>s.filter(m=>m.action===action&&(target==null||m.target===target)).length;
const tactics=side=>side.map(m=>symbols[m.action]+' '+name[m.target]).join(' + ')||'Sem ação';
const spyFor=(match,side,target)=>{
  const state=match[side+'_spy_state']||{};
  if(typeof state==='string'){
    try{return full(JSON.parse(state)?.[target],0,2)}catch{return 0}
  }
  return full(state[target],0,2);
};

export function resolveSiegeRoundV4(match,moves){
  const sides=movesOf(match,moves);
  const gate={blue:full(match.blue_gate??gateMax,0,gateMax),
    red:full(match.red_gate??gateMax,0,gateMax)};
  const supplies={blue:full(match.blue_supplies??1,0,cap),
    red:full(match.red_supplies??1,0,cap)};
  const score={blue:full(match.blue_score??0,0,9999),
    red:full(match.red_score??0,0,9999)};
  const hp={blue:full(match.blue_hp,0,2250),red:full(match.red_hp,0,2250)};
  const repairs={blue:full(match.blue_repairs,0,repairMax),
    red:full(match.red_repairs,0,repairMax)};
  const maxHp=Object.fromEntries(['blue','red'].map(side=>[
    side,full(match[side+'_fortress']?.maxHp||2000,2000,2250)]));
  const damage={blue:0,red:0},blocked={blue:0,red:0},counter={blue:0,red:0};
  const gateBreak={blue:0,red:0},raided={blue:0,red:0};
  const spent={blue:0,red:0},healed={blue:0,red:0},supplied={blue:0,red:0};
  const gateRestored={blue:0,red:0};
  const repairWithoutEffect={blue:[],red:[]};
  const strike={blue:{castle:0,gate:0,depot:0},red:{castle:0,gate:0,depot:0}};

  // Todos os ataques são simultâneos; muralha rompida só amplifica
  // ataques ao Castelo a partir da rodada SEGUINTE.
  for(const side of ['blue','red']){
    const rival=pair[side],ally=sides[side],defenders=sides[rival];
    const castleBonus=1+full(match[side+'_fortress']?.attackPct,0,.1);
    const rivalDefense=1-full(match[rival+'_fortress']?.defensePct,0,.075);
    for(const front of SIEGE_V4_FRONTS){
      const hits=count(ally,'attack',front);
      if(!hits)continue;
      const sameSpy=count(ally,'spy',front);
      const priorSpy=spyFor(match,side,front);
      const sameDef=count(defenders,'defend',front);
      const otherDef=count(defenders,'defend')-sameDef;
      const raw=Math.round(({castle:180,gate:105,depot:110})[front]*hits*
        (hits===2?1.1:1)*(sameSpy?1.3:1)*(1+.6*priorSpy)*
        (front==='castle'&&gate[rival]===0?1.25:1)*castleBonus);
      // Guarda do objetivo certo: -50% por defensor (teto -75%).
      // Defesa fora do objetivo: só -10% por defensor, sem contra-ataque.
      const mitigated=Math.round(raw*Math.max(.25,1-.5*sameDef)*
        Math.max(.8,1-.1*otherDef)*rivalDefense);
      strike[side][front]=mitigated;
      blocked[rival]+=raw-mitigated;
      damage[side]+=mitigated;
      counter[rival]+=sameDef*80;
    }
    // O Portão é um objetivo real: duas investidas o rompem. Guardar o
    // Portão anula uma investida por defensor. Reconstruir exige suprimentos.
    gateBreak[side]=Math.min(gate[rival],Math.max(0,
      count(ally,'attack','gate')-count(defenders,'defend','gate')));
    // Atacar o Depósito corta recursos; guardas no Depósito impedem saque.
    raided[side]=Math.max(0,count(ally,'attack','depot')-
      count(defenders,'defend','depot'));
  }
  for(const side of ['blue','red']){
    const rival=pair[side];
    hp[side]=Math.max(0,hp[side]-damage[rival]-counter[rival]);
    gate[side]=Math.max(0,gate[side]-gateBreak[rival]);
    score[side]+=2*gateBreak[side];
    const collects=count(sides[side],'supply');
    supplied[side]=Math.min(cap-supplies[side],collects);
    supplies[side]+=supplied[side];
  }
  // Ações de suprimento e reparo são resolvidas antes do saque inimigo:
  // o rival não consegue invalidar um reparo já confirmado no mesmo turno.
  for(const side of ['blue','red']){
    for(const move of sides[side].filter(m=>m.action==='repair')){
      if(repairs[side]>=repairMax){
        repairWithoutEffect[side].push('limite de 2 reparos atingido');continue;
      }
      if(supplies[side]<=0){
        repairWithoutEffect[side].push('sem suprimentos nesta rodada');continue;
      }
      if(move.target==='castle'&&hp[side]<maxHp[side]){
        const restored=Math.min(siegeRepairHp(match.rules_version),maxHp[side]-hp[side]);
        healed[side]+=restored;hp[side]+=restored;
      }else if(move.target==='gate'&&gate[side]<gateMax){
        gate[side]++;gateRestored[side]++;
      }else {
        repairWithoutEffect[side].push(move.target==='castle'?
          'Castelo já estava no HP máximo após os ataques':
          'Portão já estava intacto após os ataques');
        continue; // não consome recurso com estrutura cheia
      }
      supplies[side]--;repairs[side]++;spent[side]++;
    }
  }
  const loot={blue:0,red:0};
  for(const side of ['blue','red']){
    const rival=pair[side];
    loot[side]=Math.min(raided[side],supplies[rival]);
  }
  for(const side of ['blue','red']){
    supplies[side]=Math.max(0,supplies[side]-loot[pair[side]]);
    supplies[side]=Math.min(cap,supplies[side]+loot[side]);
    score[side]+=2*loot[side];
  }
  const spyState={blue:{castle:0,gate:0,depot:0},
    red:{castle:0,gate:0,depot:0}};
  for(const side of ['blue','red'])for(const m of sides[side])
    if(m.action==='spy')spyState[side][m.target]++;

  const finished=hp.blue===0||hp.red===0||Number(match.round)>=6;
  let winner=null,reason='tie';
  if(finished){
    const comparisons=[
      ['hp',hp.blue-hp.red],
      ['objectives',score.blue-score.red],
      ['gate',gate.blue-gate.red],
      ['supplies',supplies.blue-supplies.red]
    ];
    const decider=comparisons.find(([,difference])=>difference!==0);
    if(decider){
      reason=decider[0];
      winner=decider[1]>0?String(match.blue_clan_id):String(match.red_clan_id);
    }
  }
  const result={rulesVersion:4,round:Number(match.round),
    blueHp:hp.blue,redHp:hp.red,
    blueDamage:damage.blue+counter.blue,redDamage:damage.red+counter.red,
    blueBlocked:blocked.blue,redBlocked:blocked.red,
    blueCounter:counter.blue,redCounter:counter.red,
    blueDefends:count(sides.blue,'defend'),redDefends:count(sides.red,'defend'),
    blueSpies:count(sides.blue,'spy'),redSpies:count(sides.red,'spy'),
    blueRepairs:spent.blue,redRepairs:spent.red,
    blueGate:gate.blue,redGate:gate.red,
    blueSupplies:supplies.blue,redSupplies:supplies.red,
    blueScore:score.blue,redScore:score.red,
    blueLoot:loot.blue,redLoot:loot.red,
    blueSupplyGained:supplied.blue,redSupplyGained:supplied.red,
    blueHeal:healed.blue,redHeal:healed.red,
    blueRepairWithoutEffect:repairWithoutEffect.blue,
    redRepairWithoutEffect:repairWithoutEffect.red,
    blueGateRebuilt:gateRestored.blue,redGateRebuilt:gateRestored.red,
    blueTactic:tactics(sides.blue),redTactic:tactics(sides.red),
    blueSubmitted:sides.blue.length,redSubmitted:sides.red.length,
    victoryRule:reason,blueDamageFronts:strike.blue,redDamageFronts:strike.red};
  return {hp,repairs,spy:{blue:count(sides.blue,'spy'),
    red:count(sides.red,'spy')},finished,winner,result,
    v4:{gate,supplies,score,spyState}};
}
