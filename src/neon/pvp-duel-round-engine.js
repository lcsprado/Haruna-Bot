// Executor determinístico de rodadas para o futuro !duelo (NÃO IMPORTADO NA PRODUÇÃO).
// Mesmas funções de ataque/defesa de classes e Sete Pecados do PvP atual.
// Sem banco, rede, Date.now(), Math.random() ou efeitos financeiros.
// Snapshots devem vir de um carregador autenticado; NUNCA do jogador.
import {effectiveShieldedCritChance,shieldedCriticalMultiplier} from './anti-crit-shields.js';
import {heroPvpAttack,heroPvpDefense} from './playable-heroes-core.js';
import {classPvpAttack,classPvpDefense} from './pvp-class-powers.js';
import {vitalPulseHeal} from './vital-pets.js';
import {pvpWinnerByHealth} from './pvp-outcome-policy.js';
import {ACTIONS,DECISION_ROUNDS,ROLE_PLAYBOOK,strategyModifiers} from './pvp-strategy-prototype.js';

const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const bounded=(v,low,high)=>Math.max(low,Math.min(high,finite(v)));
const int=(v,defaultValue=0)=>Math.max(0,Math.trunc(finite(v,defaultValue)));
const jsonCopy=value=>JSON.parse(JSON.stringify(value));
const heroOrClass=f=>String(f.heroId||f.classId||'');
const hasOwn=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);

function normalizeFighter(value){
  if(!value||typeof value.jid!=='string'||!value.jid||value.jid.length>200)throw new Error('invalid fighter identity');
  const id=heroOrClass(value);
  if(!hasOwn(ROLE_PLAYBOOK,id))throw new Error('unsupported PvP combatant '+id);
  if(!Number.isFinite(value.maxHp)||!Number.isFinite(value.hp)||!Number.isFinite(value.atk)||
     !Number.isFinite(value.def)||!Number.isFinite(value.spd))throw new Error('invalid combat snapshot');
  const maxHp=int(value.maxHp),hp=int(value.hp);
  if(maxHp<1||maxHp>10_000_000||hp<1||hp>maxHp)throw new Error('invalid fighter HP');
  const bonus=value.petBonus||{};
  return {
    jid:value.jid,name:String(value.name||id).slice(0,100),heroId:value.heroId||null,
    classId:value.classId||null,classApplied:Boolean(value.classApplied),
    heroMasteryStage:bounded(value.heroMasteryStage??1,1,5),
    awakeningStage:bounded(value.awakeningStage??0,0,5),
    heroGear:jsonCopy(value.heroGear||{}),heroState:jsonCopy(value.heroState||{}),
    awakeningState:jsonCopy(value.awakeningState||{}),lastProcAttack:int(value.lastProcAttack),
    attackIndex:int(value.attackIndex),hp,maxHp,
    atk:int(value.atk),def:int(value.def),spd:int(value.spd),
    crit:bounded(value.crit??.10,0,1),collabCrit:bounded(value.collabCrit,0,1),
    shieldCritResist:bounded(value.shieldCritResist,0,.20),
    shieldCritGuard:bounded(value.shieldCritGuard,0,.30),
    enchantDamage:bounded(value.enchantDamage,0,2),collabDamage:bounded(value.collabDamage,0,2),
    petSpecies:String(value.petSpecies||'').slice(0,90),
    petBonus:{
      crit:bounded(bonus.crit,0,1),dodge:bounded(bonus.dodge,0,1),
      damage:bounded(bonus.damage,0,2),defense:bounded(bonus.defense,0,1),
      healPct:bounded(bonus.healPct,0,1),healCooldown:int(bonus.healCooldown)
    },
    petHealUses:int(value.petHealUses),vitalPulseUsed:Boolean(value.vitalPulseUsed),
    vitalPulseRate:bounded(value.vitalPulseRate,0,.05),
    strategyPosture:value.strategyPosture||'equilibrada'
  };
}

// Mulberry32: advance state is stored in JSONB; random stream survives bot restarts.
function roll(state){
  state.rngState=(state.rngState+0x6d2b79f5)>>>0;
  let t=state.rngState;
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),61|t);
  return ((t^(t>>>14))>>>0)/4294967296;
}
export function newDuelCombatSnapshot({fighterA,fighterB,seed,maxRounds=20}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('server RNG seed required');
  if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>20)throw new Error('invalid round limit');
  const a=normalizeFighter(fighterA),b=normalizeFighter(fighterB);
  if(a.jid===b.jid)throw new Error('duel requires two players');
  return {
    version:1,round:1,maxRounds,rngState:seed>>>0,
    firstJid:a.spd>=b.spd?a.jid:b.jid,
    fighters:[a,b],log:[],outcome:null
  };
}

function hit(state,from,to,choices){
  from.attackIndex++;
  const variance=.85+roll(state)*.30;
  const critRoll=roll(state);
  const critBase=Math.max(0,Number(from.crit||.10)+Number(from.collabCrit||0));
  const critWithoutPet=effectiveShieldedCritChance(critBase,to.shieldCritResist);
  const crit=critRoll<effectiveShieldedCritChance(critBase+Number(from.petBonus?.crit||0),to.shieldCritResist);
  const petCrit=crit&&critRoll>=critWithoutPet;
  const critMultiplier=shieldedCriticalMultiplier(1.6,to.shieldCritGuard);
  const dodged=Number(to.petBonus?.dodge||0)>0&&roll(state)<Number(to.petBonus.dodge);
  const raw=Math.max(1,Math.round((from.atk-to.def*.45)*variance));
  const damageWithoutPet=1+Number(from.enchantDamage||0)+Number(from.collabDamage||0);
  const adjusted=Math.max(1,Math.round(raw*(damageWithoutPet+Number(from.petBonus?.damage||0))));
  const adjustedNoPet=Math.max(1,Math.round(raw*damageWithoutPet));
  const classRoll=roll(state);

  const fromEffects=strategyModifiers({
    fighterId:heroOrClass(from),posture:from.strategyPosture,
    opponentPosture:to.strategyPosture,action:choices[from.jid]||'normal',
    round:state.round,hpRatio:from.hp/from.maxHp
  });
  const toEffects=strategyModifiers({
    fighterId:heroOrClass(to),posture:to.strategyPosture,
    opponentPosture:from.strategyPosture,action:choices[to.jid]||'normal',
    round:state.round,hpRatio:to.hp/to.maxHp
  });

  const attackArgs={classId:from.classId,applied:from.classApplied,critical:crit,
    hp:from.hp,maxHp:from.maxHp,attackIndex:from.attackIndex,
    lastProcAttack:from.lastProcAttack,roll:classRoll,
    awakeningStage:from.awakeningStage,awakeningState:from.awakeningState};
  const initialState=from.heroState;
  const baseDamage=crit?Math.round(adjusted*critMultiplier):adjusted;
  const attack=from.heroId
    ?heroPvpAttack({heroId:from.heroId,damage:baseDamage,hp:from.hp,maxHp:from.maxHp,
      attackIndex:from.attackIndex,masteryStage:from.heroMasteryStage,
      state:initialState,gear:from.heroGear})
    :classPvpAttack({...attackArgs,damage:baseDamage});
  const noPetAttack=Number(from.petBonus?.damage||0)>0
    ?(from.heroId?heroPvpAttack({heroId:from.heroId,
        damage:crit?Math.round(adjustedNoPet*critMultiplier):adjustedNoPet,
        hp:from.hp,maxHp:from.maxHp,attackIndex:from.attackIndex,
        masteryStage:from.heroMasteryStage,state:initialState,gear:from.heroGear})
      :classPvpAttack({...attackArgs,
        damage:crit?Math.round(adjustedNoPet*critMultiplier):adjustedNoPet}))
    :attack;
  if(from.heroId)from.heroState=attack.state;
  else from.awakeningState=attack.awakeningState;
  from.lastProcAttack=attack.lastProcAttack??from.lastProcAttack;

  const strategicAttack=Math.max(0,Math.round(attack.damage*fromEffects.attackMultiplier));
  const strategicNoPet=Math.max(0,Math.round(noPetAttack.damage*fromEffects.attackMultiplier));
  const defenseRoll=roll(state);
  const defenseArgs={classId:to.classId,applied:to.classApplied,
    damage:dodged?0:strategicAttack,roll:defenseRoll,
    hp:to.hp,maxHp:to.maxHp,awakeningStage:to.awakeningStage,
    awakeningState:to.awakeningState};
  const oldHeroDefenseState=to.heroState;
  const defense=to.heroId
    ?heroPvpDefense({heroId:to.heroId,damage:dodged?0:strategicAttack,
      state:oldHeroDefenseState,gear:to.heroGear})
    :classPvpDefense(defenseArgs);
  const classDamage=Number(defense.damage)||0;
  const fullyDodged=dodged||Boolean(defense.dodged);
  const noPetClassDamage=noPetAttack===attack?classDamage:
    (to.heroId?heroPvpDefense({heroId:to.heroId,damage:dodged?0:strategicNoPet,
      state:oldHeroDefenseState,gear:to.heroGear}).damage
      :classPvpDefense({...defenseArgs,damage:dodged?0:strategicNoPet}).damage);
  if(to.heroId)to.heroState=defense.state;
  else to.awakeningState=defense.awakeningState;
  const petDefense=Number(to.petBonus?.defense||0);
  const reduction=(1-toEffects.damageReduction)*toEffects.receivedMultiplier;
  const dmg=fullyDodged?0:Math.max(0,Math.round(classDamage*(1-petDefense)*reduction));
  const noPetDmg=fullyDodged?0:Math.max(0,Math.round(noPetClassDamage*(1-petDefense)*reduction));
  const targetBefore=to.hp;
  const petExtraDamage=Math.max(0,Math.min(targetBefore,dmg)-Math.min(targetBefore,noPetDmg));
  const petDamageBlocked=dodged?0:Math.max(0,Math.round(classDamage)-dmg);
  const defenseBlocked=dodged?0:Math.max(0,strategicAttack-classDamage);
  to.hp=Math.max(0,to.hp-dmg);
  const hpAfterHit=to.hp;

  state.log.push({round:state.round,fromJid:from.jid,toJid:to.jid,
    dmg,actualDamage:targetBefore-hpAfterHit,crit:!fullyDodged&&crit,
    dodged:fullyDodged,hp:hpAfterHit,petCrit:!fullyDodged&&petCrit,
    petDodge:dodged,petExtraDamage,petDamageBlocked,defenseBlocked,
    shieldAbsorbed:Number(defense.shieldAbsorbed||0),
    ...(attack.technique?{technique:attack.technique}:{}),
    ...(defense.technique?{defenseTechnique:defense.technique}:{})});

  // Vital pulse can heal only a living fighter; it is a combat-only effect.
  const pulse=vitalPulseHeal(to.hp,to.maxHp,to.vitalPulseUsed,to.vitalPulseRate);
  if(pulse.used&&!to.vitalPulseUsed){
    to.hp=pulse.hp;to.vitalPulseUsed=true;
    state.log.push({round:state.round,vitalPulse:true,toJid:to.jid,heal:pulse.heal,hp:to.hp});
  }
  const beforeHeal=from.hp;
  const tacticalHeal=Math.round(from.maxHp*fromEffects.healMaxHpPct);
  if(from.hp>0&&(Number(attack.heal||0)+tacticalHeal)>0){
    from.hp=Math.min(from.maxHp,from.hp+Number(attack.heal||0)+tacticalHeal);
  }
  if(from.hp>beforeHeal)state.log.push({round:state.round,fromJid:from.jid,
    classHeal:true,heal:from.hp-beforeHeal,hp:from.hp,
    strategic:fromEffects.technique||null});
  if(fromEffects.technique)state.log.push({round:state.round,fromJid:from.jid,
    strategicTechnique:fromEffects.technique});

  const cooldown=Number(from.petBonus?.healCooldown||0);
  if(from.hp>0&&cooldown>0&&from.petHealUses<3&&Number(from.petBonus?.healPct||0)>0&&
     from.attackIndex%cooldown===0&&from.hp/from.maxHp<.70){
    const before=from.hp;
    from.hp=Math.min(from.maxHp,from.hp+
      Math.max(1,Math.round(from.maxHp*Number(from.petBonus.healPct))));
    if(from.hp>before){
      from.petHealUses++;
      state.log.push({round:state.round,petHeal:true,fromJid:from.jid,
        heal:from.hp-before,hp:from.hp});
    }
  }
}

export function executeDuelRound(combat,{choices={}}={}){
  if(combat?.version!==1||combat.outcome||combat.round<1||combat.round>combat.maxRounds)
    throw new Error('combat not in a runnable round');
  if(!choices||typeof choices!=='object')throw new Error('invalid round choices');
  const next=jsonCopy(combat),[a,b]=next.fighters;
  for(const key of Object.keys(choices)){
    if(key!==a.jid&&key!==b.jid)throw new Error('unknown action owner');
    if(!ACTIONS.includes(choices[key]))throw new Error('invalid duel action');
    if(!DECISION_ROUNDS.includes(next.round)&&choices[key]!=='normal')
      throw new Error('intervention outside decision window');
  }
  const first=a.jid===next.firstJid?a:b,second=first===a?b:a;
  if(first.hp>0&&second.hp>0){
    hit(next,first,second,choices);
    if(second.hp>0)hit(next,second,first,choices);
  }
  next.round++;
  if(a.hp<=0||b.hp<=0||next.round>next.maxRounds){
    const winner=pvpWinnerByHealth(a,b,roll(next));
    next.outcome={
      winnerId:winner.jid,
      defeatedId:winner.jid===a.jid?b.jid:a.jid,
      decidedByLimit:a.hp>0&&b.hp>0,
      rounds:next.round-1,ending:{[a.jid]:a.hp,[b.jid]:b.hp}
    };
  }
  return next;
}

export function runDuelToNextDecision(combat,{revealed=[]}={}){
  if(combat?.version!==1)throw new Error('invalid combat state');
  let current=jsonCopy(combat);
  const actions=new Map();
  for(const row of revealed){
    if(!DECISION_ROUNDS.includes(row.round)||actions.has(row.round))
      throw new Error('duplicate or invalid revealed decisions');
    const ids=current.fighters.map(x=>x.jid);
    if(Object.keys(row.choices||{}).sort().join('|')!==ids.sort().join('|'))
      throw new Error('decision participants do not match combat');
    if(!ids.every(id=>ACTIONS.includes(row.choices[id])))throw new Error('invalid action');
    actions.set(row.round,row.choices);
  }
  while(!current.outcome){
    if(DECISION_ROUNDS.includes(current.round)&&!actions.has(current.round)){
      return {combat:current,awaitingRound:current.round,finished:false};
    }
    current=executeDuelRound(current,{choices:actions.get(current.round)||{}});
  }
  return {combat:current,awaitingRound:null,finished:true};
}
