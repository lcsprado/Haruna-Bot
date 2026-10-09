export const PLAYER_CLASSES = Object.freeze({
  warrior:Object.freeze({id:'warrior',name:'Guerreiro',role:'Equilibrado',hp:70,atk:12,def:11,spd:6,description:'Equilibrado para qualquer conteúdo: boa vida, ataque, defesa e mobilidade.'}),
  assassin:Object.freeze({id:'assassin',name:'Assassino',role:'Dano veloz',hp:35,atk:18,def:6,spd:16,description:'Especialista em velocidade e dano rápido, com resistência menor que as classes defensivas.'}),
  mage:Object.freeze({id:'mage',name:'Mago',role:'Dano arcano',hp:45,atk:20,def:7,spd:9,description:'Maior poder ofensivo arcano, com vida e defesa moderadas.'}),
  archer:Object.freeze({id:'archer',name:'Arqueiro',role:'Precisão',hp:50,atk:15,def:8,spd:14,description:'Ataque consistente e muita iniciativa, sem abrir mão de sobrevivência.'}),
  paladin:Object.freeze({id:'paladin',name:'Paladino',role:'Defensor',hp:130,atk:7,def:22,spd:5,description:'Defensor clássico: muita vida e defesa, com ataque menor que as classes ofensivas.'}),
  berserker:Object.freeze({id:'berserker',name:'Berserker',role:'Dano bruto',hp:65,atk:22,def:6,spd:9,description:'Maior dano físico bruto, mantendo vida suficiente para combate prolongado.'}),
  monk:Object.freeze({id:'monk',name:'Monge',role:'Combatente',hp:75,atk:13,def:13,spd:13,description:'Muito equilibrado no corpo a corpo, com boa resistência e velocidade.'}),
  necromancer:Object.freeze({id:'necromancer',name:'Necromante',role:'Dano sombrio',hp:50,atk:19,def:8,spd:10,description:'Ataque sombrio elevado com atributos secundários equilibrados.'}),
  druid:Object.freeze({id:'druid',name:'Druida',role:'Sustentação',hp:110,atk:9,def:18,spd:8,description:'Alta sobrevivência e defesa, ideal para lutas longas e suporte.'}),
  samurai:Object.freeze({id:'samurai',name:'Samurai',role:'Duelista',hp:60,atk:18,def:10,spd:14,description:'Duelista ofensivo: ataque e velocidade altos com defesa sólida.'})
});
export function getPlayerClass(id){
  const key=String(id||'warrior').toLowerCase();
  return PLAYER_CLASSES[key] || PLAYER_CLASSES.warrior;
}

export const PET_STATUS_SPECIALTIES = {
  cachorro:{label:'🐶 Guardião',stat:'defense',base:5},
  gato:{label:'🐱 Instinto',stat:'crit',base:4},
  coelho:{label:'🐰 Agilidade',stat:'dodge',base:4},
  papagaio:{label:'🦜 Motivação',stat:'xp',base:5},
  hamster:{label:'🐹 Sorte',stat:'drop',base:2.5},
  tartaruga:{label:'🐢 Casco',stat:'defense',base:7},
  coruja:{label:'🦉 Sabedoria',stat:'xp',base:8},
  raposa:{label:'🦊 Astúcia',stat:'crit',base:6},
  lobo:{label:'🐺 Caçador',stat:'damage',base:6},
  aguia:{label:'🦅 Precisão',stat:'crit',base:9},
  gaviao:{label:'🦅 Rasante',stats:{speed:4,crit:4}},
  panda:{label:'🐼 Resistência',stat:'defense',base:8},
  tigre:{label:'🐯 Fúria',stat:'damage',base:8},
  leao:{label:'🦁 Rei da Caçada',stat:'damage',base:9},
  cervo_mistico:{label:'🦌 Luz Restauradora',stats:{defense:3},healPct:4,healCooldown:5},
  unicornio:{label:'🦄 Bênção Vital',stats:{drop:4,defense:4},healPct:6,healCooldown:4},
  dragao:{label:'🐉 Caçador de Boss',stats:{bossDamage:10,defense:4}},

  golfinho_celestial:{label:'🐬 Corrente Celestial',stats:{dodge:5,xp:4}},
  moreia_sombria:{label:'🐍 Emboscada Sombria',stats:{damage:5,dodge:4}},
  tubarao_abissal:{label:'🦈 Frenesi Abissal',stats:{damage:7,crit:3}},
  guepardo:{label:'🐆 Arrancada',stats:{speed:5,damage:4}},
  polvo_arcano:{label:'🐙 Tentáculos Arcanos',stats:{crit:4,drop:3}},
  gazela_mistica:{label:'🦌 Passo Astral',stats:{speed:4,dodge:4}},
  orca_guerra:{label:'🐋 Investida Oceânica',stats:{damage:5,defense:5}},
  cavalo_guerra:{label:'🐎 Marcha de Guerra',stats:{speed:3,defense:5}},
  baleia_colossal:{label:'🐋 Canto Colossal',stats:{defense:10,xp:4}},

  golem_ancestral:{label:'🪨 Muralha Ancestral',stats:{defense:9,drop:2},raid:true},
  urso_runico:{label:'🐻 Fúria Rúnica',stats:{damage:7,defense:6},raid:true},
  colosso_cristal:{label:'💎 Prisma Colossal',stats:{defense:10,drop:4,crit:3},raid:true},

  salamandra_infernal:{label:'🔥 Chama Infernal',stats:{damage:8,crit:4},raid:true},
  dragao_vulcanico:{label:'🐲 Núcleo Vulcânico',stats:{damage:9,defense:5},raid:true},
  fenix_fogo:{label:'🔥 Renascimento Ígneo',stats:{damage:8,dodge:5,xp:5},raid:true},

  corvo_abissal:{label:'👁️ Olho do Abismo',stats:{crit:8,drop:3},raid:true},
  lobo_abismo:{label:'🌑 Predador Abissal',stats:{damage:9,crit:5},raid:true},
  fenix_gelo:{label:'❄️ Alma Glacial',stats:{defense:8,dodge:5,xp:6},raid:true},

  rinoceronte_titanico:{label:'🦏 Investida Titânica',stats:{defense:10,damage:5},raid:true},
  guardiao_obsidiana:{label:'🗿 Guarda Obsidiana',stats:{defense:10,drop:3.5},raid:true},
  leviata_gelo:{label:'🌊 Leviatã Congelado',stats:{defense:10,dodge:6,damage:5},raid:true},

  cerbero_carmesim:{label:'🩸 Três Presas',stats:{damage:10,crit:6},raid:true},
  tigre_lunar:{label:'🌙 Caçador Lunar',stats:{damage:9,dodge:6,drop:3},raid:true},
  imperador_abissal:{label:'👑 Soberano do Abismo',stats:{bossDamage:10,defense:7,drop:4},raid:true},

  leao_solar:{label:'☀️ Rei Solar',stats:{damage:10,crit:7,xp:5},raid:true},
  grifo_celestial:{label:'✨ Asas da Fortuna',stats:{crit:10,dodge:7,drop:4},raid:true},
  fenix_celestial:{label:'🌟 Graça Celestial',stats:{defense:10,dodge:8,xp:8},healPct:8,healCooldown:4,raid:true},

  serpente_cosmica:{label:'🌌 Oráculo Cósmico',stats:{crit:9,drop:6,xp:8},raid:true},
  dragao_corrompido:{label:'☠️ Ruína Corrompida',stats:{bossDamage:10,damage:8,defense:8},raid:true},
  fenix_alpha:{label:'👑 Fênix Alpha',stats:{damage:10,defense:10,crit:8,dodge:6,drop:7,xp:8},raid:true},

  // Lendários extras para equilibrar a quantidade entre as quatro sinergias.
  oraculo_pedra:{label:'🔮 Oráculo de Pedra',stats:{defense:5,crit:4,drop:2},raid:true},
  pantera_vulcanica:{label:'🐈‍⬛ Pantera Vulcânica',stats:{damage:8,crit:5},raid:true},
  espectro_abissal:{label:'👻 Espectro Abissal',stats:{crit:7,dodge:4,drop:3},raid:true},
  kraken_aco:{label:'🦑 Kraken de Aço',stats:{defense:10,damage:4,drop:2},raid:true},
  esfinge_titanica:{label:'🗿 Esfinge Titânica',stats:{defense:7,crit:6,xp:4},raid:true},
  quimera_abissal:{label:'🐲 Quimera Abissal',stats:{damage:9,crit:6,dodge:3},raid:true},
  paladino_astral:{label:'🛡️ Paladino Astral',stats:{defense:10,damage:5,xp:4},raid:true},
  lince_celestial:{label:'🐆 Lince Celestial',stats:{damage:10,crit:8,xp:4},raid:true},
  arcanjo_eclipse:{label:'🪽 Arcanjo do Eclipse',stats:{crit:9,defense:6,xp:7},healPct:5,healCooldown:5,raid:true},
  colosso_alpha:{label:'🗿 Colosso Alpha',stats:{defense:10,damage:7,dodge:4,drop:4},raid:true},
  oraculo_alpha:{label:'🔮 Oráculo Alpha',stats:{crit:10,defense:8,drop:7,xp:8},raid:true},

  // Raids 60/65/70: bônus por especialidade, não multiplicadores de dano
  // globais. Todos seguem os mesmos tetos de 15% e escala por nível.
  fera_caos:{label:'🐺 Fome do Caos',stats:{damage:10,crit:5},raid:true},
  guardiao_caos:{label:'🛡️ Bastião Entrópico',stats:{defense:10,damage:5},raid:true},
  serafim_caotico:{label:'🪽 Asas da Ruína',stats:{crit:9,dodge:7},raid:true},
  oraculo_caos:{label:'🔮 Visão Entrópica',stats:{defense:7,crit:8,drop:4},raid:true},
  fenix_caos:{label:'🔥 Renascimento do Caos',stats:{damage:8,defense:7,dodge:5},healPct:5,healCooldown:5,raid:true},

  pantera_profundezas:{label:'🐈‍⬛ Predadora das Profundezas',stats:{damage:10,crit:7},raid:true},
  guardiao_abissal:{label:'🗿 Muralha Abissal',stats:{defense:10,dodge:6},raid:true},
  dragao_trono:{label:'🐉 Soberania Abissal',stats:{bossDamage:10,defense:7},raid:true},
  oraculo_coroa:{label:'👑 Presságio da Coroa',stats:{crit:10,drop:7,xp:5},raid:true},
  esfinge_mares:{label:'🌊 Maré Restauradora',stats:{defense:9,crit:8},healPct:5,healCooldown:5,raid:true},

  lobo_eclipse:{label:'🌘 Caçador do Eclipse',stats:{damage:10,crit:8},raid:true},
  sentinela_eclipse:{label:'🛡️ Muralha do Eclipse',stats:{defense:10,dodge:7,damage:4},raid:true},
  dragao_solar_eclipse:{label:'🐉 Fogo Eclipse',stats:{bossDamage:10,crit:9,xp:4},raid:true},
  fenix_eclipse:{label:'🌗 Graça do Eclipse',stats:{defense:10,dodge:8},healPct:6,healCooldown:5,raid:true},
  avatar_primordial:{label:'🌌 Equilíbrio Primordial',stats:{damage:10,defense:8,crit:8,drop:5},raid:true}
};

export const ADOPTABLE_PETS = [
  {species:'cachorro',label:'🐶 Cachorro',level:1,price:5000},
  {species:'gato',label:'🐱 Gato',level:2,price:8000},
  {species:'coelho',label:'🐰 Coelho',level:3,price:12000},
  {species:'papagaio',label:'🦜 Papagaio',level:4,price:18000},
  {species:'hamster',label:'🐹 Hamster',level:5,price:25000},
  {species:'tartaruga',label:'🐢 Tartaruga',level:6,price:35000},
  {species:'coruja',label:'🦉 Coruja',level:7,price:50000},
  {species:'raposa',label:'🦊 Raposa',level:8,price:70000},
  {species:'golfinho_celestial',label:'🐬 Golfinho Celestial',level:9,price:85000},
  {species:'lobo',label:'🐺 Lobo',level:10,price:100000},
  {species:'moreia_sombria',label:'🐍 Moreia Sombria',level:11,price:125000},
  {species:'aguia',label:'🦅 Águia',level:12,price:150000},
  {species:'gaviao',label:'🦅 Gavião',level:13,price:190000},
  {species:'panda',label:'🐼 Panda',level:14,price:225000},
  {species:'tubarao_abissal',label:'🦈 Tubarão Abissal',level:15,price:275000},
  {species:'guepardo',label:'🐆 Guepardo',level:16,price:320000},
  {species:'tigre',label:'🐯 Tigre',level:17,price:350000},
  {species:'polvo_arcano',label:'🐙 Polvo Arcano',level:18,price:400000},
  {species:'gazela_mistica',label:'🦌 Gazela Mística',level:19,price:450000},
  {species:'leao',label:'🦁 Leão',level:20,price:500000},
  {species:'cervo_mistico',label:'🦌 Cervo Místico',level:20,price:500000},
  {species:'orca_guerra',label:'🐋 Orca de Guerra',level:22,price:600000},
  {species:'cavalo_guerra',label:'🐎 Cavalo de Guerra',level:23,price:650000},
  {species:'unicornio',label:'🦄 Unicórnio',level:25,price:750000},
  {species:'baleia_colossal',label:'🐋 Baleia Colossal',level:28,price:900000},
  {species:'dragao',label:'🐉 Dragão',level:30,price:1000000}
];

export const ADOPTABLE_PETS_BY_SPECIES = Object.freeze(
  Object.fromEntries(ADOPTABLE_PETS.map(p => [p.species, Object.freeze({...p})]))
);

export function getAdoptablePetRule(species) {
  return ADOPTABLE_PETS_BY_SPECIES[String(species || '').toLowerCase()] || null;
}

export function petSpecialtyStats(species) {
  const spec = PET_STATUS_SPECIALTIES[String(species || '').toLowerCase()];
  if (!spec) return {};
  return spec.stats || (spec.stat ? {[spec.stat]: Number(spec.base || 0)} : {});
}

export function petCombatSpecialty(species) {
  const spec = PET_STATUS_SPECIALTIES[String(species || '').toLowerCase()] || {};
  const stats = petSpecialtyStats(species);
  const pct = key => Number(stats[key] || 0) / 100;
  return {
    label: spec.label || String(species || ''),
    damage: pct('damage'),
    bossDamage: pct('bossDamage'),
    defense: pct('defense'),
    crit: pct('crit'),
    dodge: pct('dodge'),
    xp: pct('xp'),
    drop: pct('drop'),
    speed: Number(stats.speed || 0),
    healPct: Number(spec.healPct || 0) / 100,
    healCooldown: Math.max(0, Number(spec.healCooldown || 0)),
    raid: Boolean(spec.raid)
  };
}

// Passivas de classe: implementação em avaliação.

export const CLASS_PASSIVES=Object.freeze({
  warrior:{name:'Postura de Guerra',description:'+2% dano; -1% dano recebido.',damage:.02,mitigation:.01},
  assassin:{name:'Instinto Mortal',description:'+2 pontos percentuais de crítico.',crit:.02},
  mage:{name:'Explosão Arcana',description:'6% chance de +15% dano a cada 4 ataques.',procChance:.06,procBonus:.15,procInterval:4},
  archer:{name:'Caçador de Titãs',description:'+3% dano contra Bosses e Raids.',bossDamage:.03},
  paladin:{name:'Proteção Divina',description:'Reduz 3% do dano recebido.',mitigation:.03},
  berserker:{name:'Fúria de Sangue',description:'+5% dano abaixo de 40% HP.',lowHpDamage:.05},
  monk:{name:'Reflexos Supremos',description:'3% chance de esquivar.',dodge:.03},
  necromancer:{name:'Drenagem de Almas',description:'A cada 4 ataques recupera 2% do dano, até 2% HP máximo.',lifesteal:.02,lifestealInterval:4,lifestealCap:.02},
  druid:{name:'Natureza Viva',description:'A cada 12 ataques recupera 2% HP máximo.',regen:.02,regenInterval:12},
  samurai:{name:'Lâmina Perfeita',description:'+8% dano nos críticos.',critDamage:.08}
})

export function getClassPassive(classId,applied=true){
  return applied?(CLASS_PASSIVES[String(classId||'').toLowerCase()]||null):null
}
export const AWAKENING_CLASS_SKILLS=Object.freeze({
  warrior:[
    'Vanguarda: +2% de dano em Boss/Raid.',
    'Resistência de Guerra: -2% dano recebido abaixo de 50% HP.',
    'Golpe de Guerra: +12% de dano a cada 8 ataques.'
  ],
  assassin:[
    'Instinto Aperfeiçoado: +1 ponto percentual de crítico.',
    'Execução: após acumular 3 críticos, próximo golpe recebe +20% de dano.',
    'Sombra Evasiva: +2 pontos percentuais de esquiva.'
  ],
  mage:[
    'Arcano Amplificado: 8% de chance de +20% dano, com intervalo mínimo de 4 ataques.',
    'Explosão: +20% de dano a cada 8 ataques.',
    'Maestria Arcana: +3% de dano em Boss/Raid.'
  ],
  archer:[
    'Caçador Superior: bônus fixo de Boss/Raid sobe de 3% para 5%.',
    'Flecha Perfurante: +12% de dano a cada 6 ataques.',
    'Visão de Águia: +2 pontos percentuais de crítico.'
  ],
  paladin:[
    'Bênção Restauradora: cura 3% HP máximo a cada 8 ataques, se abaixo de 50% HP.',
    'Julgamento Divino: +20% de dano a cada 8 ataques.',
    'Proteção Celestial: -3% dano recebido adicional abaixo de 50% HP.'
  ],
  berserker:[
    'Fúria Controlada: bônus abaixo de 40% HP sobe de 5% para 6%.',
    'Instinto de Sobrevivência: +6% dano adicional abaixo de 25% HP.',
    'Fúria Suprema: +10% de dano a cada 8 golpes abaixo de 40% HP.'
  ],
  monk:[
    'Reflexos Aperfeiçoados: esquiva sobe de 3% para 5%.',
    'Contra-ataque: depois de esquivar, próximo ataque recebe +12% de dano.',
    'Paz Interior: -2% do dano recebido.'
  ],
  necromancer:[
    'Drenagem Superior: rouba 3% do dano a cada 4 golpes, limitado a 3% HP.',
    'Maldição: +12% de dano a cada 7 ataques.',
    'Senhor das Almas: drenagem sobe para 4% do dano e limite de 4% HP.'
  ],
  druid:[
    'Natureza Viva II: regeneração de 2% HP a cada 8 ataques.',
    'Casca Espiritual: -4% dano recebido abaixo de 60% HP.',
    'Coração da Floresta: regeneração sobe para 3% HP a cada 8 ataques.'
  ],
  samurai:[
    'Lâmina Perfeita II: bônus nos críticos sobe de 8% para 12%.',
    'Precisão Honrada: +2 pontos percentuais de crítico.',
    'Corte Divino: +15% de dano a cada 6 ataques.'
  ]
})

// Fase balanceada: habilidades de Despertar I/II/III somente em Boss/Raid.
// I–V ainda concede atributos. Não altera PvP nem passivas dos não despertos.
function awakenedStage(applied,stage,context){
  return applied && (context==='boss'||context==='raid')
    ? Math.max(0,Math.min(3,Math.floor(Number(stage)||0))) : 0
}
export function getAwakeningSkillDescriptions(classId){
  return AWAKENING_CLASS_SKILLS[String(classId||'').toLowerCase()]||[]
}
export function classCritBonus(classId,applied=true,awakeningStage=0,context='pvp'){
  const base=getClassPassive(classId,applied)?.crit||0
  const stage=awakenedStage(applied,awakeningStage,context)
  const id=String(classId||'').toLowerCase()
  if(id==='assassin'&&stage>=1) return base+.01
  if(id==='archer'&&stage>=3) return base+.02
  if(id==='samurai'&&stage>=2) return base+.02
  return base
}
export function classDefense({
  classId,applied=true,damage=0,roll=Math.random(),hp=1,maxHp=1,
  context='pvp',awakeningStage=0,awakeningState=null
}={}){
  const p=getClassPassive(classId,applied)
  let n=Math.max(0,Math.round(Number(damage)||0))
  const state={...(awakeningState||{})}
  if(!p||!n)return {damage:n,dodged:false,awakeningState:state}
  const id=String(classId||'').toLowerCase()
  const stage=awakenedStage(applied,awakeningStage,context)
  const dodge=Math.min(.25,Number(p.dodge||0)+(
    (id==='monk'&&stage>=1)?.02:(id==='assassin'&&stage>=3)?.02:0
  ))
  if(dodge&&roll<dodge){
    if(id==='monk'&&stage>=2)state.counterReady=true
    return {damage:0,dodged:true,awakeningState:state}
  }
  if(p.mitigation)n=Math.max(1,Math.round(n*(1-p.mitigation)))
  const ratio=Number(maxHp)>0?Number(hp)/Number(maxHp):1
  const mitigation=
    (id==='paladin'&&stage>=3&&ratio<.5?.03:0)+
    (id==='druid'&&stage>=2&&ratio<.6?.04:0)+
    (id==='warrior'&&stage>=2&&ratio<.5?.02:0)+
    (id==='monk'&&stage>=3?.02:0)
  if(mitigation)n=Math.max(1,Math.round(n*(1-mitigation)))
  return {damage:n,dodged:false,awakeningState:state}
}
export function classAttack({
  classId,applied=true,damage=0,critical=false,hp=1,maxHp=1,
  attackIndex=1,context='pvp',lastProcAttack=0,roll=Math.random(),
  awakeningStage=0,awakeningState=null
}={}){
  const p=getClassPassive(classId,applied)
  const base=Math.max(0,Math.round(Number(damage)||0))
  const state={...(awakeningState||{})}
  if(!p||!base)return {damage:base,heal:0,proc:false,lastProcAttack,awakeningState:state}
  const id=String(classId||'').toLowerCase()
  const stage=awakenedStage(applied,awakeningStage,context)
  const hpRatio=Number(maxHp)>0?Number(hp)/Number(maxHp):1
  const index=Math.max(1,Math.floor(Number(attackIndex)||1))
  let n=base,proc=false
  if(p.damage)n=Math.round(n*(1+p.damage))
  if(p.bossDamage){
    const bossBonus=(id==='archer'&&stage>=1)?.05:p.bossDamage
    if(context==='boss'||context==='raid')n=Math.round(n*(1+bossBonus))
  }
  if(p.lowHpDamage&&hpRatio<.40)n=Math.round(n*(1+((id==='berserker'&&stage>=1)?.06:p.lowHpDamage)))
  if(p.critDamage&&critical)n=Math.round(n*(1+((id==='samurai'&&stage>=1)?.12:p.critDamage)))
  const procChance=(id==='mage'&&stage>=1)?.08:p.procChance
  const procBonus=(id==='mage'&&stage>=1)?.20:p.procBonus
  if(procChance&&index-Math.max(0,Number(lastProcAttack)||0)>=p.procInterval&&roll<procChance){
    n=Math.round(n*(1+procBonus))
    proc=true
    lastProcAttack=index
  }
  if(stage){
    if(id==='warrior')n=Math.round(n*1.02)
    if(id==='mage'&&stage>=2&&index%8===0)n=Math.round(n*1.20)
    if(id==='mage'&&stage>=3)n=Math.round(n*1.03)
    if(id==='archer'&&stage>=2&&index%6===0)n=Math.round(n*1.12)
    if(id==='paladin'&&stage>=2&&index%8===0)n=Math.round(n*1.20)
    if(id==='berserker'&&stage>=2&&hpRatio<.25)n=Math.round(n*1.06)
    if(id==='berserker'&&stage>=3&&hpRatio<.40&&index%8===0)n=Math.round(n*1.10)
    if(id==='necromancer'&&stage>=2&&index%7===0)n=Math.round(n*1.12)
    if(id==='samurai'&&stage>=3&&index%6===0)n=Math.round(n*1.15)
    if(id==='warrior'&&stage>=3&&index%8===0)n=Math.round(n*1.12)
    if(id==='assassin'&&stage>=2){
      if(state.finisherReady){
        n=Math.round(n*1.20)
        state.finisherReady=false
        state.critsAccumulated=0
      }else if(critical){
        state.critsAccumulated=Math.min(3,Math.max(0,Number(state.critsAccumulated||0))+1)
        if(state.critsAccumulated>=3)state.finisherReady=true
      }
    }
    if(id==='monk'&&stage>=2&&state.counterReady){
      n=Math.round(n*1.12)
      state.counterReady=false
    }
  }
  let heal=0
  if(p.lifesteal&&index%p.lifestealInterval===0&&hp>0&&maxHp>0){
    const pct=id==='necromancer'&&stage>=3?.04:id==='necromancer'&&stage>=1?.03:p.lifesteal
    const cap=id==='necromancer'&&stage>=3?.04:id==='necromancer'&&stage>=1?.03:p.lifestealCap
    heal=Math.min(Math.ceil(maxHp*cap),Math.floor(n*pct),Math.max(0,maxHp-hp))
  }
  if(p.regen&&index%(id==='druid'&&stage>=1?8:p.regenInterval)===0&&hp>0&&maxHp>0){
    const pct=id==='druid'&&stage>=3?.03:p.regen
    heal=Math.min(Math.floor(maxHp*pct),Math.max(0,maxHp-hp))
  }
  if(id==='paladin'&&stage>=1&&hp>0&&maxHp>0&&hpRatio<.50&&index%8===0){
    heal=Math.min(Math.floor(maxHp*.03),Math.max(0,maxHp-hp))
  }
  return {damage:Math.max(1,n),heal:Math.max(0,heal),proc,lastProcAttack,awakeningState:state}
}
