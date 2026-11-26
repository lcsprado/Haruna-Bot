// Missões diárias V3: cinco atividades escolhidas entre oito tipos reais
// já contabilizados no RPG. Rotação compartilhada por dia em São Paulo,
// estável entre reinícios/servidores. Só vale para dias ainda não gerados.
export const DAILY_V3_START='2026-11-14';
export const DAILY_MAIN_TYPES=Object.freeze([
  'battle','dungeon','work','pet_train','boss_damage','raid_damage','game','shop'
]);
const ROSTER_ORDER=Object.freeze([
  'work','dungeon','game','pet_train','boss_damage','raid_damage','battle','shop'
]);
const QUESTS=Object.freeze({
  battle:{cash:25000,xp:500,petXp:0,variants:[
    ['⚔️ Duelo Vitorioso',1],['⚔️ Glória na Arena',2],['⚔️ Três Vitórias',3],['⚔️ Confronto Decisivo',1]]},
  dungeon:{cash:30000,xp:600,petXp:0,variants:[
    ['🏰 Incursão na Dungeon',1],['🏰 Explorador das Ruínas',2],['🏰 Mestre da Masmorra',3],['🏰 Expedição Subterrânea',2]]},
  work:{cash:20000,xp:400,petXp:0,variants:[
    ['💼 Jornada Produtiva',2],['💼 Plantão Alpha',3],['💼 Expediente Completo',4],['💼 Trabalho de Elite',2]]},
  pet_train:{cash:20000,xp:0,petXp:500,variants:[
    ['🐾 Afinidade com Pets',2],['🐾 Treinador Especialista',3],['🐾 Preparação das Lendas',4],['🐾 Treino dos Companheiros',2]]},
  boss_damage:{cash:40000,xp:800,petXp:0,variants:[
    ['👹 Investida contra Boss',10000],['👹 Colosso Abalado',20000],['👹 Fúria contra Boss',30000],['👹 Golpe no Titã',15000]]},
  raid_damage:{cash:35000,xp:700,petXp:0,variants:[
    ['🐉 Frente de Raid',20000],['🐉 Desafio do Abismo',35000],['🐉 Caçador de Raids',45000],['🐉 Impacto na Raid',25000]]},
  game:{cash:25000,xp:500,petXp:0,variants:[
    ['🎮 Diversão Alpha',2],['🎮 Circuito de Minigames',3],['🎮 Desafio dos Jogos',4],['🎮 Noite de Jogos',2]]},
  shop:{cash:20000,xp:400,petXp:0,variants:[
    ['🛒 Comprador da Vila',1],['🛒 Movimento no Comércio',2],['🛒 Cliente Frequente',2],['🛒 Compra Estratégica',1]]}
});
const SPECIALS=Object.freeze([
  ['🌟 Conquistador do Abismo (Raids)',30000],
  ['🌟 Lenda Contra o Boss (Boss)',20000],
  ['🌟 Caçador de Lendas (Raids)',50000],
  ['🌟 Exterminador Titânico (Boss)',25000],
  ['🌟 Veterano das Raids (Raids)',45000]
]);

function dayNumber(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new Error('Dia de missão inválido');
  const date=Date.parse(day+'T12:00:00Z');
  if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==day)throw new Error('Dia de missão inválido');
  return Math.floor(date/86400000);
}

export function dailyV3MainMissions(day){
  if(day<DAILY_V3_START)throw new Error('Rotação V3 ainda não começou');
  const index=dayNumber(day);
  const start=((index*3)%ROSTER_ORDER.length+ROSTER_ORDER.length)%ROSTER_ORDER.length;
  return Array.from({length:5},(_,i)=>{
    const type=ROSTER_ORDER[(start+i)%ROSTER_ORDER.length];
    const quest=QUESTS[type];
    const [title,target]=quest.variants[(index+i*5)%quest.variants.length];
    return {type,title,target,cash:quest.cash,xp:quest.xp,petXp:quest.petXp};
  });
}
export function dailyV3SpecialMission(day,level){
  if(day<DAILY_V3_START)throw new Error('Rotação V3 ainda não começou');
  if(Number(level)<10){
    return {type:'legend_raid',title:'🌟 Caçador de Lendas (alternativa: Boss)',
      target:2500,cash:25000,xp:1500,petXp:500};
  }
  const [title,target]=SPECIALS[dayNumber(day)%SPECIALS.length];
  return {type:'legend_raid',title,target,cash:25000,xp:1500,petXp:500};
}

export function dailySpecialActivity(title){
  return /\(Boss\)|alternativa: Boss/.test(String(title||''))?'boss_damage':'raid_damage';
}

export const DAILY_V2_REWARD_START='2026-11-27';
export const DAILY_V2_COMPLETION=Object.freeze({cash:2000,xp:2000,fragments:10,item:'fragmento_universal_raid'});
const V2_WEIGHTS=Object.freeze({
 battle:[2000,2000],dungeon:[3000,3000],work:[2000,1500],pet_train:[2000,1500],
 boss_damage:[4000,4000],raid_damage:[4000,4000],game:[2000,1500],shop:[2000,1500]
});
function distribute(weights,total){
 const sum=weights.reduce((a,b)=>a+b,0);
 const rows=weights.map((w,i)=>({i,amount:Math.floor(w*total/sum),remainder:(w*total)%sum}));
 let remaining=total-rows.reduce((n,r)=>n+r.amount,0);
 for(const r of [...rows].sort((a,b)=>b.remainder-a.remainder||a.i-b.i)){
   if(remaining<=0)break;
   r.amount++;remaining--;
 }
 return rows.map(r=>r.amount);
}
export function dailyV2RebalancedRewards(missions){
 const main=missions.filter(m=>m.type!=='legend_raid');
 if(main.length!==5||new Set(main.map(m=>m.type)).size!==5||missions.length!==6||
    main.some(m=>!V2_WEIGHTS[m.type])||missions.filter(m=>m.type==='legend_raid').length!==1)
   throw Error('Invalid daily V2 reward roster');
 const cash=distribute(main.map(m=>V2_WEIGHTS[m.type][0]),13000);
 const xp=distribute(main.map(m=>V2_WEIGHTS[m.type][1]),12000);
 return missions.map(m=>{
   if(m.type==='legend_raid')return {...m,cash:5000,xp:6000};
   const i=main.indexOf(m);
   return {...m,cash:cash[i],xp:xp[i]};
 });
}
