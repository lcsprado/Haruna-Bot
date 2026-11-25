// Despertar IV/V: exigencias V1 adaptadas para a economia e os combates V2.
// Contadores sao calculados apenas de provas de combate auditaveis; nunca de totais historicos.
const mission=(id,label,a,b)=>({id,label,iv:a,v:b});
export const AWAKENING_CLASS_TRIALS=Object.freeze({
 paladin:[
  mission('pvp','Vencer duelos de honra válidos',30,45),
  mission('protection','Proteger aliados em Raids manuais vitoriosas',40,70),
  mission('saves','Impedir golpes potencialmente letais em aliados',5,12),
  mission('coop','Vencer Raids cooperativas',5,15)
 ],
 samurai:[
  mission('pvp','Vencer duelos de honra válidos',60,100),
  mission('raid','Vencer Raids manuais de alto nível',30,50),
  mission('combo','Executar combinações críticas em Raids vitoriosas',15,30),
  mission('elite','Vencer duelos contra adversários de elite',5,12)
 ],
 berserker:[
  mission('pvp','Vencer duelos de honra válidos',70,110),
  mission('raid','Vencer Raids manuais de alto nível',25,40),
  mission('frenzy','Vencer Raids ativando Fúria sob 40% de HP',15,30),
  mission('boss','Contribuir com dano significativo para vencer Bosses',8,15)
 ],
 necromancer:[
  mission('pvp','Vencer duelos de honra válidos',25,45),
  mission('drain','Vencer Raids recuperando HP por drenagem',40,65),
  mission('curseBoss','Vencer Bosses ativando Maldição',12,25),
  mission('souls','Usar Drenagem de Almas em Raids vitoriosas',20,35)
 ],
 warrior:[
  mission('pvp','Vencer duelos de honra válidos',30,50),
  mission('raid','Vencer Raids manuais de alto nível',30,50),
  mission('warriorSkill','Ativar Ímpeto de Guerra em Raids vitoriosas',15,30),
  mission('boss','Contribuir com dano significativo para vencer Bosses',5,10)
 ],
 assassin:[
  mission('pvp','Vencer duelos de honra válidos',55,90),
  mission('raid','Vencer Raids manuais de alto nível',25,45),
  mission('assassinSkill','Executar finalizações em Raids vitoriosas',15,30),
  mission('elite','Vencer duelos contra adversários de elite',5,10)
 ],
 mage:[
  mission('pvp','Vencer duelos de honra válidos',25,45),
  mission('raid','Vencer Raids manuais de alto nível',35,60),
  mission('mageSkill','Ativar Explosão Arcana em Raids vitoriosas',15,30),
  mission('boss','Contribuir com dano significativo para vencer Bosses',5,10)
 ],
 archer:[
  mission('pvp','Vencer duelos de honra válidos',40,70),
  mission('raid','Vencer Raids manuais de alto nível',30,50),
  mission('archerSkill','Ativar Flecha Perfurante em Raids vitoriosas',15,30),
  mission('boss','Contribuir com dano significativo para vencer Bosses',5,10)
 ],
 monk:[
  mission('pvp','Vencer duelos de honra válidos',40,70),
  mission('raid','Vencer Raids manuais de alto nível',30,50),
  mission('monkSkill','Usar Chi Vital em Raids vitoriosas',15,30),
  mission('coop','Vencer Raids cooperativas',5,10)
 ],
 druid:[
  mission('pvp','Vencer duelos de honra válidos',25,45),
  mission('raid','Vencer Raids manuais de alto nível',30,50),
  mission('support','Curar aliados efetivamente em Raids vitoriosas',15,30),
  mission('coop','Vencer Raids cooperativas',5,15)
 ]
});
const skillNames=Object.freeze({
 warriorSkill:'Ímpeto de Guerra',assassinSkill:'Execução',mageSkill:'Explosão Arcana',
 archerSkill:'Flecha Perfurante',monkSkill:'Chi Vital'
});
const count=x=>Math.max(0,Math.floor(Number(x)||0));
const brazilDay=seconds=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(Number(seconds)*1000));
export const raidMinimum=stage=>stage===4?50:60;
export const pvpEliteMinimum=stage=>stage===4?50:75;

// Aceita no maximo duas vitorias contra o mesmo adversario por dia civil de Brasilia.
// O requisito de dois adversarios diferentes impede liberar etapa por uma unica conta rival.
export function eligibleAwakeningPvp(events=[]){
 const daily=new Map(),valid=[];
 for(const e of [...events].filter(e=>e.source==='pvp'&&e.opponent_jid).sort((a,b)=>Number(a.happened_at)-Number(b.happened_at)||Number(a.id)-Number(b.id))){
  const key=e.opponent_jid+':'+brazilDay(e.happened_at),used=daily.get(key)||0;
  if(used>=2)continue;
  daily.set(key,used+1);valid.push(e);
 }
 return valid;
}
export function challengeQuests({classId,stage,events=[]}={}){
 if(![4,5].includes(Number(stage)))return [];
 const definition=AWAKENING_CLASS_TRIALS[classId]||AWAKENING_CLASS_TRIALS.warrior;
 const minimum=raidMinimum(stage);
 const raids=events.filter(e=>e.source==='raid'&&e.manual&&Number(e.raid_level)>=minimum&&Number(e.metrics?.damage||0)>0);
 const bosses=events.filter(e=>e.source==='boss'&&Number(e.metrics?.share||0)>=.05&&Number(e.metrics?.damage||0)>0&&Number(e.metrics?.attacks||0)>=3);
 const pvp=eligibleAwakeningPvp(events);
 const rivals=new Set(pvp.map(e=>e.opponent_jid)).size;
 const qualified=(e,key)=>count(e.metrics?.skills?.[key]);
 const value={
  pvp:pvp.length,
  rivals,
  raid:raids.length,
  protection:raids.filter(e=>Number(e.metrics?.partySize)>=2&&
   Number(e.metrics?.guardEligibleDamage)>0&&
   Number(e.metrics?.alliedProtection)/Number(e.metrics?.guardEligibleDamage)>=.15).length,
  saves:raids.filter(e=>Number(e.metrics?.alliesSaved)>0).length,
  coop:raids.filter(e=>Boolean(e.metrics?.coopEligible)).length,
  combo:raids.filter(e=>qualified(e,'Postura Iai')>=2).length,
  elite:pvp.filter(e=>Number(e.opponent_level)>=pvpEliteMinimum(stage)).length,
  frenzy:raids.filter(e=>qualified(e,'Fúria de Sangue')>=3).length,
  boss:bosses.filter(e=>Number(e.metrics?.share)>=.10).length,
  drain:raids.filter(e=>Number(e.metrics?.classHealing)>0).length,
  curseBoss:bosses.filter(e=>count(e.metrics?.curseHits)>0).length,
  souls:raids.filter(e=>qualified(e,'Drenagem de Almas')>=3&&Number(e.metrics?.classHealing)>0).length,
  support:raids.filter(e=>Number(e.metrics?.alliedHealing)>0).length
 };
 for(const [id,name] of Object.entries(skillNames))
  value[id]=raids.filter(e=>qualified(e,name)>=2).length;
 // Prova especial: um unico combate de alta exigencia, vinculado a habilidade da classe.
 // Precisa ser real, manual e posterior ao Despertar anterior.
 const challengeRaid=raids.filter(e=>Number(e.raid_level)>=(stage===4?60:65));
 const finalLabels={
  paladin:'Concluir prova de proteção heroica',
  samurai:'Concluir duelo de elite com críticos precisos',
  berserker:'Vencer incursão extrema em Fúria',
  necromancer:'Amaldiçoar e vencer Boss de elite',
  warrior:'Concluir prova de contra-ataque',
  assassin:'Concluir prova de execução',
  mage:'Concluir prova de explosão arcana',
  archer:'Concluir prova de precisão extrema',
  monk:'Concluir prova de domínio do Chi',
  druid:'Concluir prova de sustentação cooperativa'
 };
 const finalDone=(()=>{
  if(classId==='paladin')return challengeRaid.some(e=>
   Number(e.raid_level)>=(stage===4?60:70)&&e.metrics?.coopEligible&&
   Number(e.metrics?.alliesSaved)>=1&&Number(e.metrics?.guardEligibleDamage)>0&&
   Number(e.metrics?.alliedProtection)/Number(e.metrics?.guardEligibleDamage)>=.15);
  if(classId==='samurai')return pvp.some(e=>Number(e.opponent_level)>=pvpEliteMinimum(stage)&&
    count(e.metrics?.criticalHits)>=(stage===4?2:3));
  if(classId==='berserker')return challengeRaid.some(e=>
    qualified(e,'Fúria de Sangue')>=(stage===4?5:8));
  if(classId==='necromancer')return bosses.some(e=>
    Number(e.metrics?.share)>=(stage===4?.10:.15)&&
    count(e.metrics?.curseHits)>=(stage===4?2:4));
  if(classId==='druid')return challengeRaid.some(e=>e.metrics?.coopEligible&&
    Number(e.metrics?.alliedHealing)>=(stage===4?100:250));
  const special=skillNames[{
   warrior:'warriorSkill',assassin:'assassinSkill',mage:'mageSkill',
   archer:'archerSkill',monk:'monkSkill'
  }[classId]];
  return Boolean(special&&challengeRaid.some(e=>qualified(e,special)>=(stage===4?4:6)));
 })();
 const quests=definition.map(m=>({
  label:m.label+(m.id==='raid'||['protection','saves','combo','frenzy','drain','souls','support','coop','warriorSkill','assassinSkill','mageSkill','archerSkill','monkSkill'].includes(m.id)?' (Lv.'+minimum+'+)':''),
  target:stage===4?m.iv:m.v,
  done:Math.min(stage===4?m.iv:m.v,value[m.id]||0)
 }));
 quests.push({label:'Vencer adversários PvP diferentes',target:2,done:Math.min(2,rivals)});
 quests.push({label:finalLabels[classId]||'Concluir prova especial da classe',target:1,done:Number(finalDone)});
 return quests;
}
