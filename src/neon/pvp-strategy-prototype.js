// Prototype ONLY: not imported by production PvP. Legacy battles remain unchanged.

// Each modifier is applied at most once by a future integration adapter; no database writes.

export const ROLE_PLAYBOOK=Object.freeze({
  "warrior": {
    "name": "Guerreiro",
    "technique": "Contra-ataque de Guerra",
    "attack": 0.035,
    "guard": 0.025,
    "heal": 0
  },
  "paladin": {
    "name": "Paladino",
    "technique": "Égide Sagrada",
    "attack": 0,
    "guard": 0.07,
    "heal": 0.01
  },
  "berserker": {
    "name": "Berserker",
    "technique": "Frenesi",
    "attack": 0.04,
    "guard": 0,
    "heal": 0,
    "lowHpAttack": 0.04,
    "exposure": 0.035
  },
  "necromancer": {
    "name": "Necromante",
    "technique": "Drenagem",
    "attack": 0.03,
    "guard": 0,
    "heal": 0.018
  },
  "samurai": {
    "name": "Samurai",
    "technique": "Postura Iai",
    "attack": 0.04,
    "guard": 0.012,
    "heal": 0,
    "vsAggressiveAttack": 0.03
  },
  "assassin": {
    "name": "Assassino",
    "technique": "Execução",
    "attack": 0.06,
    "guard": 0,
    "heal": 0,
    "exposure": 0.02
  },
  "mage": {
    "name": "Mago",
    "technique": "Selo Arcano",
    "attack": 0.045,
    "guard": 0.015,
    "heal": 0
  },
  "archer": {
    "name": "Arqueiro",
    "technique": "Flecha de Precisão",
    "attack": 0.055,
    "guard": 0,
    "heal": 0
  },
  "monk": {
    "name": "Monge",
    "technique": "Chi Defensivo",
    "attack": 0.025,
    "guard": 0.045,
    "heal": 0.01
  },
  "druid": {
    "name": "Druida",
    "technique": "Raízes Curativas",
    "attack": 0,
    "guard": 0.04,
    "heal": 0.018
  },
  "pecado_meliodas": {
    "name": "Meliodas",
    "technique": "Full Counter preparado",
    "attack": 0.04,
    "guard": 0.04,
    "heal": 0
  },
  "pecado_ban": {
    "name": "Ban",
    "technique": "Snatch direcionado",
    "attack": 0.03,
    "guard": 0.01,
    "heal": 0.018
  },
  "pecado_diane": {
    "name": "Diane",
    "technique": "Heavy Metal",
    "attack": 0,
    "guard": 0.085,
    "heal": 0
  },
  "pecado_escanor": {
    "name": "Escanor",
    "technique": "Pressão Solar",
    "attack": 0.045,
    "guard": 0,
    "heal": 0,
    "lateAttack": 0.025,
    "exposure": 0.02
  },
  "pecado_king": {
    "name": "King",
    "technique": "Chastiefol Guardian",
    "attack": 0,
    "guard": 0.065,
    "heal": 0.012
  },
  "pecado_gowther": {
    "name": "Gowther",
    "technique": "Rewrite Light",
    "attack": 0.03,
    "guard": 0.02,
    "heal": 0,
    "vsTacticalGuard": 0.025
  },
  "pecado_merlin": {
    "name": "Merlin",
    "technique": "Perfect Cube",
    "attack": 0.025,
    "guard": 0.05,
    "heal": 0
  }
});

export const POSTURES=Object.freeze(["equilibrada","agressiva","defensiva","tatica"]);

export const ACTIONS=Object.freeze(["normal","atacar","proteger","tecnica"]);

export const DECISION_ROUNDS=Object.freeze([3,7,11]);

export const MAX_INTERVENTIONS=3;

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,Number(x)||0));

export function normalizePosture(value){const p=String(value||"equilibrada").toLowerCase();return POSTURES.includes(p)?p:"equilibrada"}

export function strategicAdvantage(a,b){const p=normalizePosture(a),q=normalizePosture(b);return p==="agressiva"&&q==="defensiva"||p==="defensiva"&&q==="tatica"||p==="tatica"&&q==="agressiva"}

export function strategyModifiers({fighterId,posture="equilibrada",opponentPosture="equilibrada",action="normal",round=1,hpRatio=1}={}){
  const p=normalizePosture(posture),q=normalizePosture(opponentPosture),a=ACTIONS.includes(action)?action:"normal";
  const role=ROLE_PLAYBOOK[String(fighterId||"")]||null;
  let attack=0,guard=0,exposure=0,heal=0,technique=null;
  if(p==="agressiva"){attack+=.035;exposure+=.025}
  if(p==="defensiva"){attack-=.025;guard+=.04}
  if(p==="tatica"){attack-=.01;guard+=.015}
  if(strategicAdvantage(p,q))attack+=.025;
  if(a==="atacar"){attack+=.045;exposure+=.015}
  if(a==="proteger"){attack-=.03;guard+=.06}
  if(a==="tecnica"&&role){
    attack+=role.attack||0;guard+=role.guard||0;heal+=role.heal||0;
    exposure+=role.exposure||0;
    if(Number(hpRatio)<.5)attack+=role.lowHpAttack||0;
    if(Number(round)>=7)attack+=role.lateAttack||0;
    if(q==="agressiva")attack+=role.vsAggressiveAttack||0;
    if(q==="tatica")guard+=role.vsTacticalGuard||0;
    technique=role.technique;
  }
  return Object.freeze({attackMultiplier:1+clamp(attack,-.08,.15),damageReduction:clamp(guard,0,.14),
    receivedMultiplier:1+clamp(exposure,0,.075),healMaxHpPct:clamp(heal,0,.025),technique});
}

export function makeDuelRound({players,round,nowMs,timeoutMs=30000}={}){
  if(!Array.isArray(players)||players.length!==2||players[0]===players[1]||players.some(x=>!x))throw new Error("duel requires exactly two distinct players");
  if(!DECISION_ROUNDS.includes(round))throw new Error("round is not a decision window");
  if(!Number.isFinite(nowMs)||!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new Error("invalid deadline");
  return {players:[...players],round,deadlineAt:nowMs+timeoutMs,hiddenChoices:Object.create(null)};
}

export function duelRoundPublic(state){return {round:state.round,deadlineAt:state.deadlineAt,submittedCount:Object.keys(state.hiddenChoices).length,ready:Object.keys(state.hiddenChoices).length===2}}

export function submitDuelChoice(state,{playerId,choice,nowMs}={}){
  if(!state?.players?.includes(playerId))throw new Error("unknown participant");
  if(!Number.isFinite(nowMs)||nowMs>state.deadlineAt)throw new Error("deadline expired");
  if(!["atacar","proteger","tecnica"].includes(choice))throw new Error("invalid intervention");
  if(Object.prototype.hasOwnProperty.call(state.hiddenChoices,playerId))throw new Error("choice already locked");
  const hiddenChoices=Object.assign(Object.create(null),state.hiddenChoices,{[playerId]:choice});
  return {...state,hiddenChoices};
}

export function resolveDuelRound(state,nowMs){
  if(!Number.isFinite(nowMs))throw new Error("invalid timestamp");
  if(Object.keys(state.hiddenChoices).length<2&&nowMs<state.deadlineAt)throw new Error("waiting for private choices");
  return {round:state.round,choices:Object.fromEntries(state.players.map(id=>[id,state.hiddenChoices[id]||"normal"])),
    timedOut:state.players.filter(id=>!Object.prototype.hasOwnProperty.call(state.hiddenChoices,id))};
}
