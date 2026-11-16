// Poço do Abismo — regras puras da temporada 16–20/11/2026.
// Não importa db, não concede recompensas e não publica eventos.
export const POCO_SEASON=Object.freeze({
  id:'poco-abismo-2026-11-16',startAt:Date.parse('2026-11-16T00:00:00-03:00'),
  endAt:Date.parse('2026-11-20T21:00:00-03:00'),floorLimit:30,
  responseMs:120_000,bossFloors:[5,10,15,20,25,30],dropBossFloors:[10,15,20,25,30],
  prizes:[25_000_000,15_000_000,10_000_000],
});
export const POCO_GEAR=Object.freeze([
  {id:'poco_lamina_abismo_20261116',name:'Cortajuramentos',category:'weapon'},
  {id:'poco_armadura_eclipse_20261116',name:'Couraça das Cem Cicatrizes',category:'armor'},
  {id:'poco_elmo_soberano_20261116',name:'Elmo do Vigia Sem Olhos',category:'helmet'},
  {id:'poco_escudo_eternidade_20261116',name:'Escudo das Correntes Partidas',category:'shield'},
  {id:'poco_botas_vazio_20261116',name:'Botas do Retorno Impossível',category:'boots'}
]);
export const POCO_DROP_WEIGHTS=Object.freeze([
  {kind:'exclusive',weight:60}, // 0,60%; cada uma das cinco peças = 0,12%.
  {kind:'legendary_box',weight:400},{kind:'epic_box',weight:1200},
  {kind:'forge_materials',weight:2000},{kind:'fragments',weight:2500},
  {kind:'cash_bonus',weight:1000},{kind:'none',weight:2840}
]);
// Balanceamento experimental EXCLUSIVO das novas tentativas no grupo beta.
// Nunca aplicado ao controlador de recompensas reais.
export const POCO_BETA_BALANCE=Object.freeze({
 id:'beta-v2',corridorMultiplier:.78,defendCounterMultiplier:.38,
 unblockedChargeFactor:2.40,
 specialAttackMultiplier:.85,
 bossHpMultipliers:Object.freeze({10:1.25,15:1.35,20:1.30,25:1.20,30:1.15})
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const floorMoney=f=>[30_000,50_000,80_000,120_000,170_000,250_000][Math.floor((f-1)/5)];
export function pocoCashForFloor(f){return Number.isInteger(f)&&f>=1&&f<=30?floorMoney(f):0}
export function pocoRewardTotal(){return Array.from({length:30},(_,i)=>pocoCashForFloor(i+1)).reduce((a,b)=>a+b,0)}
export function pocoRollDrop(random=Math.random){
  const roll=Number(random());
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new RangeError('Sorteio de drop inválido');
  let point=Math.min(9999,Math.floor(roll*10000+1e-9));
  for(const bucket of POCO_DROP_WEIGHTS){
    if(point<bucket.weight){
      if(bucket.kind!=='exclusive')return {kind:bucket.kind};
      const sub=Math.floor(point/12);
      return {kind:'exclusive',itemId:POCO_GEAR[sub].id};
    }
    point-=bucket.weight;
  }
  throw new Error('Distribuição incompleta');
}
function roleFor({heroId,classId}={}){
  const id=String(heroId||classId||'').toLowerCase();
  if(id.includes('diane')||id.includes('defens')||id.includes('paladino')||id.includes('guardiao'))
    return {id:'tank',atk:.95,hp:1.06,mitigation:.94};
  if(id.includes('meliodas')||id.includes('samurai')||id.includes('atacante'))
    return {id:'striker',atk:1.07,hp:.98,mitigation:1.00};
  if(id.includes('ban')||id.includes('lutador'))
    return {id:'fighter',atk:1.02,hp:1.02,mitigation:.98};
  return {id:'balanced',atk:1,hp:1,mitigation:1};
}
export function pocoNormalize(profile={}){
  const role=roleFor(profile);
  // Todo o progresso permanente, equipamento e pet cabe em no máximo 5%.
  // Diferença de papéis é trade-off ataque x vida x mitigação, não aumento linear.
  const level=clamp(profile.level,1,600),atk=clamp(profile.effective_atk||profile.atk,0,100000);
  const def=clamp(profile.effective_def||profile.def,0,100000);
  const gear=clamp((atk+def)/6000,0,1);
  const totalBonus=clamp(.05*(.65*(level/600)+.35*gear),0,.05);
  const factor=1+totalBonus;
  return Object.freeze({
    role:role.id,bonus:Number(totalBonus.toFixed(5)),
    maxHp:Math.round(4300*factor*role.hp),atk:Math.round(770*factor*role.atk),
    mitigation:role.mitigation,critChance:.12,
    composition:{
      heroId:String(profile.heroId||''),classId:String(profile.classId||profile.class_id||''),
      weaponId:String(profile.weapon_id||''),armorId:String(profile.armor_id||''),
      helmetId:String(profile.helmet_id||''),bootId:String(profile.boot_id||''),
      shieldId:String(profile.shield_id||''),
      petIds:Array.isArray(profile.petIds)?profile.petIds.map(String).slice(0,3):[]
    }
  });
}
export function pocoNextBoss(floor){return POCO_SEASON.bossFloors.find(x=>x>floor)||null}
export function pocoBossSkill(floor,turn=0){
  if(!POCO_SEASON.bossFloors.includes(floor))throw new RangeError('Andar sem Guardião');
  const offset=Math.floor(floor/5);
  const type=['charge','drain','barrier','bleed'][(turn+offset)%4];
  const names={charge:'Ruptura Abissal',drain:'Drenar Vida',barrier:'Escudo Sombrio',bleed:'Sangramento Profundo'};
  return {type,name:names[type],telegraphed:true};
}
function nextRandom(s){
  s.seed=(Math.imul((s.seed>>>0),1664525)+1013904223)>>>0;
  return s.seed/4294967296;
}
function newBoss(floor,balanceVersion='legacy'){
 const factor=balanceVersion===POCO_BETA_BALANCE.id?(POCO_BETA_BALANCE.bossHpMultipliers[floor]||1):1;
 const maxHp=Math.round((1500+110*floor)*factor);
 return {floor,hp:maxHp,maxHp,turn:0};
}
function finish(state,reason,explanation,now){
  state.status=reason==='completed'?'completed':'ended';
  state.deadline=null;state.boss=null;state.endedAt=now;
  state.report={reason,explanation,floor:state.floor,turns:state.turns,hp:state.hp,
    maxHp:state.stats.maxHp,potions:state.potions,skillCharges:state.skillCharges};
}
function advance(state,now){
  const cleared=[];
  let next=pocoNextBoss(state.floor);
  while(next!==null && state.floor+1<next){
    const f=state.floor+1;
    const loss=Math.max(10,Math.round((45+f*2)*state.stats.mitigation*(state.balanceVersion===POCO_BETA_BALANCE.id?POCO_BETA_BALANCE.corridorMultiplier:1)));
    state.hp=Math.max(0,state.hp-loss);
    state.turns++;
    if(state.hp===0){finish(state,'death','Os inimigos comuns esgotaram seu HP antes do próximo Guardião.',now);return cleared;}
    state.floor=f;state.reachedAt=now;cleared.push(f);
    // Sorte de encontrar poção não interfere nos drops econômicos diários.
    if([7,14,22,28].includes(f)&&nextRandom(state)<.55)state.potions=Math.min(3,state.potions+1);
    next=pocoNextBoss(state.floor);
  }
  if(next!==null){
    state.boss=newBoss(next,state.balanceVersion);
    state.deadline=now+POCO_SEASON.responseMs;
  }else finish(state,'completed','Você venceu todos os 30 andares.',now);
  return cleared;
}
export function pocoStart({profile={},attempt=1,seed=1,now=Date.now(),balanceVersion='legacy'}={}){
  if(!Number.isInteger(attempt)||attempt<1)throw new RangeError('Tentativa inválida');
  const stats=pocoNormalize(profile);
  const state={season:POCO_SEASON.id,attempt,status:'active',
    floor:0,turns:0,reachedAt:null,hp:stats.maxHp,potions:2,skillCharges:5,
    ...(balanceVersion===POCO_BETA_BALANCE.id?{balanceVersion:POCO_BETA_BALANCE.id}:{}),
    stats,seed:Number(seed)>>>0,startedAt:now,deadline:null,boss:null,report:null};
  const cleared=advance(state,now);
  return {state,cleared,bossDefeated:null};
}
export function pocoDecision(state,choice,{now=Date.now()}={}){
  if(!state||state.status!=='active'||!state.boss)throw new Error('Nenhuma decisão ativa')
  if(state.deliveryPending)throw new Error('Aguardando confirmação de envio da decisão pelo WhatsApp. Consulte !poco para reenviar.');
  if(now>state.deadline)return pocoEnd(state,'timeout',now);
  const action=Number(choice);
  if(!Number.isInteger(action)||action<1||action>4)throw new RangeError('Escolha 1, 2, 3 ou 4');
  if(action===3&&state.potions<=0)throw new Error('Sem poções disponíveis');
  if(action===4&&state.skillCharges<=0)throw new Error('Habilidade especial esgotada');
  const s=structuredClone(state),skill=pocoBossSkill(s.boss.floor,s.boss.turn);
  const beta=s.balanceVersion===POCO_BETA_BALANCE.id;
  const beforeHp=s.hp;let damage=0,heal=0,enemyDamage=0,critical=false,interrupted=false;
  const variance=.90+nextRandom(s)*.20;
  if(action===1||action===4){
    critical=nextRandom(s)<s.stats.critChance;
    damage=Math.max(1,Math.round(s.stats.atk*variance*(action===4 ? (beta?POCO_BETA_BALANCE.specialAttackMultiplier:.70) : 1)*(critical?1.40:1)*(skill.type==='barrier' ? .65 : 1)));
    s.boss.hp=Math.max(0,s.boss.hp-damage);
  }
  // Defender também contra-ataca no beta: vale a pena bloquear golpes anunciados.
  // Sem esse dano, gastar uma rodada defendendo é quase sempre pior que atacar.
  if(action===2&&beta){
    damage=Math.max(1,Math.round(s.stats.atk*POCO_BETA_BALANCE.defendCounterMultiplier*(skill.type==='barrier'?.65:1)));
    s.boss.hp=Math.max(0,s.boss.hp-damage);
  }
  if(action===3){
    s.potions--;
    heal=Math.min(s.stats.maxHp-s.hp,Math.round(s.stats.maxHp*.38));
    s.hp+=heal;
  }
  if(action===4){s.skillCharges--;interrupted=skill.type!=='barrier';}
  if(s.boss.hp>0){
    // No beta, ignorar a Ruptura Abissal avisada é caro; defender ainda reduz 75% do golpe.
    const factor=beta&&skill.type==='charge'
      ? POCO_BETA_BALANCE.unblockedChargeFactor
      : {charge:1.8,drain:1.18,barrier:.80,bleed:1.28}[skill.type];
    const base=115+s.boss.floor*8;
    enemyDamage=Math.max(1,Math.round(base*factor*s.stats.mitigation*(action===2 ? .25 : 1)*(interrupted?0:1)));
    s.hp=Math.max(0,s.hp-enemyDamage);
  }
  s.turns++;s.boss.turn++;
  const message={action,skill:skill.name,damage,heal,enemyDamage,critical,interrupted,hpBefore:beforeHp};
  if(s.hp===0){
    finish(s,'death','O Guardião do andar '+s.boss.floor+' venceu após '+skill.name+'. Revise o momento de cura, defesa ou interrupção.',now);
    return {state:s,cleared:[],bossDefeated:null,message};
  }
  if(s.boss.hp===0){
    const bossDefeated=s.boss.floor;
    s.floor=bossDefeated;s.reachedAt=now;s.boss=null;
    const cleared=[bossDefeated,...advance(s,now)];
    return {state:s,cleared,bossDefeated,message};
  }
  s.deadline=now+POCO_SEASON.responseMs;
  return {state:s,cleared:[],bossDefeated:null,message};
}
export function pocoEnd(state,reason='abandoned',now=Date.now()){
  if(!state||state.status!=='active')throw new Error('Tentativa não está ativa');
  const s=structuredClone(state);
  if(reason==='timeout'&&now<=s.deadline)throw new Error('Prazo ainda aberto');
  finish(s,reason,reason==='timeout'?'Você não respondeu em 2 minutos. Próxima tentativa começa no zero.':reason==='season_closed'?'O ranking fechou sexta-feira às 21h; nenhuma ação após o prazo é válida.':'Tentativa encerrada pelo jogador.',now);
  return {state:s,cleared:[],bossDefeated:null};
}
export function pocoScore(state,name='',jid=''){
  if(!state||!Number.isInteger(state.floor))throw new Error('Resultado inválido');
  return {jid,name,floor:state.floor,turns:state.turns,
    hp:state.hp,...(state.balanceVersion===POCO_BETA_BALANCE.id?{maxHp:state.stats.maxHp}:{}),
    potions:state.potions,endedAt:state.reachedAt||state.endedAt||state.startedAt,
    attempt:state.attempt,completed:state.status==='completed'};
}
export function pocoBetaRankingCompare(a,b){
 const hpFraction=x=>Math.round(1e6*Math.max(0,Number(x.hp)||0)/Math.max(1,Number(x.maxHp)||4500));
 return b.floor-a.floor || hpFraction(b)-hpFraction(a) || a.turns-b.turns ||
   b.potions-a.potions || String(a.jid||'').localeCompare(String(b.jid||''));
}
export function pocoBetter(a,b){
  if(!b)return true;
  return pocoRankingCompare(a,b)<0;
}
export function pocoRankingCompare(a,b){
  return b.floor-a.floor || a.turns-b.turns ||
    b.hp-a.hp || b.potions-a.potions ||
    String(a.jid||'').localeCompare(String(b.jid||''));
}
export function pocoSeasonActive(now=Date.now()){return now>=POCO_SEASON.startAt&&now<POCO_SEASON.endAt;}
