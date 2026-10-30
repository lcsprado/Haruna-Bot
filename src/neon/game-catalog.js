import {PECADOS_HEROES} from './sete-pecados-catalog.js'
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
// Catálogo completo preservado para históricos, Despertares e jogadores legados.
// Ocultação apenas na seleção de novas classes (WhatsApp + Web).
export const SELECTABLE_PLAYER_CLASS_IDS=Object.freeze(['paladin','necromancer','samurai','berserker']);
export const SELECTABLE_PLAYER_CLASSES=Object.freeze(SELECTABLE_PLAYER_CLASS_IDS.map(id=>PLAYER_CLASSES[id]));
export function isSelectablePlayerClass(id){
  return SELECTABLE_PLAYER_CLASS_IDS.includes(String(id||'').toLowerCase());
}
export function getPlayerClass(id){
  const key=String(id||'warrior').toLowerCase();
  return PLAYER_CLASSES[key] || PLAYER_CLASSES.warrior;
}

export const PET_STATUS_SPECIALTIES = {
  ...Object.fromEntries(PECADOS_HEROES.map(p=>[p.species,{label:'🌈 '+p.name+' — 7 Pecados',stats:p.stats,raid:true}])),
  morcego_madrugada:{label:'🦇 Coringa da Madrugada',stats:{crit:6,dodge:5},raid:true},
  corcel_espectral_halloween:{label:'🐎 Corcel Espectral — Halloween',stats:{bossDamage:8,defense:3,dodge:4},raid:true},
  cachorro:{label:'🐶 Guardião',stat:'defense',base:5},
  gato:{label:'🐱 Instinto',stat:'crit',base:4},
  coelho:{label:'🐰 Agilidade',stat:'dodge',base:4},
  papagaio:{label:'🦜 Motivação',stat:'xp',base:5},
  hamster:{label:'🐹 Sorte',stat:'drop',base:2.5},
  tartaruga:{label:'🐢 Casco',stat:'defense',base:7},
  coruja:{label:'🦉 Sabedoria',stat:'xp',base:8},
  raposa:{label:'🦊 Astúcia',stat:'crit',base:6},
  raposa_astral:{label:'🦊 Guardiã Astral — Segunda Chance',stats:{damage:1.6,defense:2.4},raid:true},
  lince_astral:{label:'🃏 Lince Astral — Coringa do Leilão das Sombras',stats:{damage:1.6,defense:2.4},raid:true},
  onca_eclipse_20261026:{label:'🃏 Onça do Eclipse — Coringa do Leilão do Tesouro',stats:{bossDamage:4,crit:3,dodge:2},raid:true},
  guaxinim_errante_20261027:{label:'🦝 Guaxinim Errante — Coringa de Ataque e Crítico',stats:{damage:5,crit:4},raid:true},
  manticora_eclipse_20261030:{label:'🦂 Mantícora do Eclipse — Predador Místico',stats:{damage:10.5,crit:7,speed:5},raid:true},
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
  fera_caos:{label:'🐺 Fome do Caos',stats:{damage:11,crit:7},raid:true},
  guardiao_caos:{label:'🛡️ Bastião Entrópico',stats:{defense:11,damage:5},raid:true},
  serafim_caotico:{label:'🪽 Asas da Ruína',stats:{crit:11,dodge:7},raid:true},
  oraculo_caos:{label:'🔮 Visão Entrópica',stats:{defense:10,crit:9,drop:4},raid:true},
  fenix_caos:{label:'🔥 Renascimento do Caos',stats:{damage:8,defense:7,dodge:5},healPct:6.5,healCooldown:5,raid:true},

  pantera_profundezas:{label:'🐈‍⬛ Predadora das Profundezas',stats:{damage:11.4,crit:7.8},raid:true},
  guardiao_abissal:{label:'🗿 Muralha Abissal',stats:{defense:11,dodge:7},raid:true},
  dragao_trono:{label:'🐉 Soberania Abissal',stats:{bossDamage:11,defense:8,drop:4},raid:true},
  oraculo_coroa:{label:'👑 Presságio da Coroa',stats:{crit:10,drop:9,xp:5},raid:true},
  esfinge_mares:{label:'🌊 Maré Restauradora',stats:{defense:9,crit:8},healPct:7,healCooldown:4,raid:true},

  lobo_eclipse:{label:'🌘 Caçador do Eclipse',stats:{damage:12,crit:9},raid:true},
  sentinela_eclipse:{label:'🛡️ Muralha do Eclipse',stats:{defense:11,dodge:8,damage:4},raid:true},
  dragao_solar_eclipse:{label:'🐉 Fogo Eclipse',stats:{bossDamage:12,crit:11,xp:4},raid:true},
  fenix_eclipse:{label:'🌗 Graça do Eclipse',stats:{defense:10,dodge:8},healPct:9,healCooldown:4,raid:true},
  avatar_primordial:{label:'🌌 Equilíbrio Primordial',stats:{damage:11.5,defense:8,crit:9,drop:5},raid:true},
  camaleao_lendario:{label:'🦎 Camuflagem Adaptativa',stats:{damage:3,defense:3,crit:2},raid:true}
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

// Reembolso de sacrifício: metade do preço pago para pets de loja.
// pricePaid=null representa pet legado (anterior ao rastreio de origem):
// recupera o preço da espécie comprável. pricePaid=0 indica pet obtido
// sem compra (Raid/evento), mantendo o retorno anterior por nível.
export function petSacrificeReward(species,level=1,xp=0,pricePaid=null) {
  const lvl=Math.min(100,Math.max(1,Number(level||1)))
  const exp=Math.min(800,Math.floor(lvl*5+Math.max(0,Number(xp||0))*.03))
  const previousCash=Math.min(3700,200+35*lvl)
  const shopPrice=getAdoptablePetRule(species)?.price||0
  const tracked=pricePaid===null||pricePaid===undefined?shopPrice:Math.max(0,Number(pricePaid)||0)
  const cash=tracked>0?Math.floor(tracked*.5):previousCash
  return {level:lvl,exp,cash,originalPrice:tracked,shopRefund:tracked>0}
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

// Bônus de pet exclusivos de PvP. Não altera as especialidades de Boss/Raid.
// Somente o pet principal, vivo e com energia, participa desta mecânica.
export function petPvpSpecialty(species, level=1) {
  const base=petCombatSpecialty(species)
  const growth=base.raid ? .25 : .50
  const scale=1+Math.min(growth,Math.max(0,Number(level||1)-1)*(growth/99))
  const cap=base.raid ? .15 : .10
  const scaled=k=>Math.min(cap,Math.max(0,Number(base[k]||0)*scale))
  return {
    damage:scaled('damage')*.30,
    defense:scaled('defense')*.30,
    crit:scaled('crit')*.30,
    dodge:Math.min(.05,scaled('dodge')*.30),
    healPct:scaled('healPct')*.50,
    healCooldown:Math.max(0,Number(base.healCooldown||0))
  }
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
  "warrior": [
    "Vanguarda: +2% de dano em Boss/Raid.",
    "Resistência de Guerra: -2% dano recebido abaixo de 50% HP.",
    "Ímpeto de Guerra: a cada 4 ataques +1,5% dano, até +6%.",
    "Aparar de Ferro: a cada 5 golpes recebidos bloqueia 15% e prepara contra-ataque de +8%.",
    "Último Estandarte: contra-ataque sobe a +15%; escudo 10% HP máximo uma vez ao cair abaixo de 30% HP."
  ],
  "assassin": [
    "Instinto Aperfeiçoado: +1 ponto percentual de crítico.",
    "Execução: após 3 críticos, próximo golpe +20% dano.",
    "Ferida Sombria: após Execução, próximos 3 golpes +6% dano.",
    "Passo Fantasma: após Execução, próximo golpe recebido -15%.",
    "Execução Implacável: Execução passa a +45% e preserva 1 carga crítica após uso."
  ],
  "mage": [
    "Arcano Amplificado: 8% chance de +20% dano, intervalo mínimo 4 ataques.",
    "Explosão: +20% de dano a cada 8 ataques.",
    "Reservatório Arcano: gera 1 mana a cada 6 ataques ou proc; com 1 carga, Explosão sobe a +32% e consome 1 mana.",
    "Barreira Arcana: proc gera escudo 6% HP máximo; Explosão carregada gera escudo 4% HP máximo.",
    "Cataclismo: Explosão carregada passa de +32% para +48%."
  ],
  "archer": [
    "Caçador Superior: bônus contra Boss/Raid sobe de 3% para 5%.",
    "Flecha Perfurante: +12% de dano a cada 6 ataques.",
    "Marca de Caça: até 5 marcas (+1% dano por marca); crítico consome-as para +2% por marca.",
    "Disparo no Tendão: consumir 5 marcas reduz 12% do próximo golpe recebido.",
    "Flecha Celestial: no sexto ataque com 5 marcas, consome-as para +22% dano."
  ],
  "paladin": [
    "Bênção Restauradora: cura 3% HP máximo a cada 8 ataques abaixo de 50% HP.",
    "Julgamento Divino: +20% de dano a cada 8 ataques.",
    "Égide Celestial: a cada 8 ataques abaixo de 50% HP, escudo de 8% HP máximo.",
    "Aura Consagrada: -2% dano recebido por si e aliados da Raid; não acumula.",
    "Intervenção Divina: uma vez por Raid/Boss, golpe fatal deixa 15% HP e gera escudo de 8% HP máximo."
  ],
  "berserker": [
    "Fúria Controlada: abaixo de 40% HP, bônus sobe de 5% para 6%.",
    "Instinto de Sobrevivência: +6% dano adicional abaixo de 25% HP.",
    "Fúria Crescente: ataques abaixo de 40% HP acumulam até 4 cargas de +1% dano; zera acima de 50%.",
    "Retaliação Sangrenta: tomar dano abaixo de 40% HP prepara +5% no próximo ataque.",
    "Frenesi Mortal: ataques consecutivos abaixo de 25% HP acumulam até +5% dano; zera se curar acima do limite."
  ],
  "monk": [
    "Reflexos Aperfeiçoados: esquiva sobe de 3% para 5%.",
    "Contra-ataque: após esquivar, próximo ataque +12% dano.",
    "Chi Vital: esquivar ou completar 8 ataques gera Chi; cura 2% HP máximo por carga (máximo 2).",
    "Defesa Fluida: após esquivar, reduz 20% do próximo golpe recebido.",
    "Punho Celestial: contra-ataque sobe para +35% e Chi passa a curar 3% HP máximo por carga."
  ],
  "necromancer": [
    "Drenagem Superior: rouba 3% dano a cada 4 ataques, limitado a 3% HP máximo.",
    "Maldição: +12% de dano a cada 7 ataques.",
    "Essências Roubadas: drenagem sobe a 4%; cada drenagem ganha uma alma (+1% dano por alma, até 4).",
    "Escudo Ósseo: drenagens concedem escudo de 2,5% do HP máximo (limite de uma barreira ativa).",
    "Colheita Final: drenagem sobe a 5%; com 4 almas, o próximo golpe de drenagem +18% e consome almas."
  ],
  "druid": [
    "Natureza Viva II: regeneração de 2% HP a cada 8 ataques.",
    "Casca Espiritual: -4% dano recebido abaixo de 60% HP.",
    "Semente Curativa: regeneração passa a 3% e cria escudo 3% HP máximo.",
    "Raízes Antigas: quando escudo se rompe, reduz em 12% o próximo golpe recebido.",
    "Forma Ancestral: regeneração 4%, ou 6% se abaixo de 35% HP; escudo 5% HP máximo."
  ],
  "samurai": [
    "Lâmina Perfeita II: bônus nos críticos sobe de 8% para 12%.",
    "Precisão Honrada: +2 pontos percentuais de crítico.",
    "Postura Iai: não-críticos geram até 4 focos; próximo crítico +4% dano por foco.",
    "Parada Perfeita: crítico focado reduz 12% do próximo golpe recebido.",
    "Corte da Lua: crítico com 4 focos +30% dano, em vez de +16%; preserva 1 foco."
  ]
})

// Habilidades I–V em Boss/Raid, com atributos dos cinco estágios. Não altera PvP nem passivas dos não despertos.
function awakenedStage(applied,stage,context){
  return applied && (context==='boss'||context==='raid')
    ? Math.max(0,Math.min(5,Math.floor(Number(stage)||0))) : 0
}
export function getAwakeningSkillDescriptions(classId){
  return AWAKENING_CLASS_SKILLS[String(classId||'').toLowerCase()]||[]
}
export function classCritBonus(classId,applied=true,awakeningStage=0,context='pvp'){
  const base=getClassPassive(classId,applied)?.crit||0
  const stage=awakenedStage(applied,awakeningStage,context)
  const id=String(classId||'').toLowerCase()
  if(id==='assassin'&&stage>=1)return base+.01
  if(id==='samurai'&&stage>=2)return base+.02
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
  const id=String(classId||'').toLowerCase(),stage=awakenedStage(applied,awakeningStage,context)
  const ratio=Number(maxHp)>0?Number(hp)/Number(maxHp):1
  const dodge=Math.min(.25,Number(p.dodge||0)+(id==='monk'&&stage>=1?.02:0))
  if(dodge&&roll<dodge){
    if(id==='monk'&&stage>=2)state.counterReady=true
    if(id==='monk'&&stage>=3)state.monkChi=Math.min(2,Number(state.monkChi||0)+1)
    if(id==='monk'&&stage>=4)state.monkGuardReady=true
    return {damage:0,dodged:true,awakeningState:state}
  }
  if(p.mitigation)n=Math.max(1,Math.round(n*(1-p.mitigation)))
  const mitigation=(id==='warrior'&&stage>=2&&ratio<.50?.02:0)+
    (id==='druid'&&stage>=2&&ratio<.60?.04:0)+
    (id==='paladin'&&stage>=4?.02:0)
  if(mitigation)n=Math.max(1,Math.round(n*(1-mitigation)))
  if(stage>=4){
    if(id==='warrior'){
      state.warriorBlocks=Math.max(0,Number(state.warriorBlocks||0))+1
      if(state.warriorBlocks%5===0){n=Math.max(1,Math.round(n*.85));state.warriorRiposte=true}
    }
    if(id==='assassin'&&state.assassinSmokeReady){n=Math.max(1,Math.round(n*.85));state.assassinSmokeReady=false}
    if(id==='archer'&&state.archerBraceReady){n=Math.max(1,Math.round(n*.88));state.archerBraceReady=false}
    if(id==='berserker'&&ratio<.40)state.berserkerRevengeReady=true
    if(id==='monk'&&state.monkGuardReady){n=Math.max(1,Math.round(n*.80));state.monkGuardReady=false}
    if(id==='druid'&&state.druidRootsReady){n=Math.max(1,Math.round(n*.88));state.druidRootsReady=false}
    if(id==='samurai'&&state.samuraiGuardReady){n=Math.max(1,Math.round(n*.88));state.samuraiGuardReady=false}
  }
  // Escudos não afetam PvP (estágio 0 nesse contexto).
  if(stage>=3&&['warrior','paladin','mage','necromancer','druid'].includes(id)){
    const shield=Math.max(0,Math.floor(Number(state.awakeningShield||0)))
    if(shield>0){
      const absorbed=Math.min(shield,n)
      n-=absorbed
      state.awakeningShield=shield-absorbed
      if(id==='druid'&&stage>=4&&absorbed>0&&state.awakeningShield===0)state.druidRootsReady=true
    }
  }
  // Uma chance de sobrevivência por Raid/Boss, sem ressuscitar mortos.
  let healAfter=0
  if(id==='paladin'&&stage>=5&&!state.paladinMiracleUsed&&hp>0&&n>=hp){
    state.paladinMiracleUsed=true
    const savedHp=Math.max(1,Math.ceil(Number(maxHp)*.15))
    n=Math.max(0,Math.floor(Number(hp)-savedHp))
    healAfter=Math.max(0,savedHp-Number(hp))
    state.awakeningShield=Math.max(0,Math.ceil(Number(maxHp)*.08))
  }
  return {damage:Math.max(0,n),dodged:false,healAfter,awakeningState:state}
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
    if(id==='warrior'){
      n=Math.round(n*1.02) // Despertar I preservado.
      if(stage>=3){
        if(index%4===0)state.warriorMomentum=Math.min(4,Number(state.warriorMomentum||0)+1)
        n=Math.round(n*(1+.015*Number(state.warriorMomentum||0)))
      }
      if(stage>=4&&state.warriorRiposte){
        n=Math.round(n*(stage>=5?1.15:1.08));state.warriorRiposte=false
      }
      if(stage>=5&&hpRatio<.30&&!state.warriorBannerUsed){
        state.warriorBannerUsed=true
        state.awakeningShield=Math.max(Number(state.awakeningShield||0),Math.ceil(maxHp*.10))
      }
    }
    if(id==='assassin'&&stage>=2){
      if(stage>=3&&Number(state.assassinBleed||0)>0){
        n=Math.round(n*1.06)
        state.assassinBleed=Number(state.assassinBleed)-1
      }
      if(state.finisherReady){
        n=Math.round(n*(stage>=5?1.45:1.20))
        state.finisherReady=false
        state.critsAccumulated=stage>=5?1:0
        if(stage>=3)state.assassinBleed=3
        if(stage>=4)state.assassinSmokeReady=true
      }else if(critical){
        state.critsAccumulated=Math.min(3,Number(state.critsAccumulated||0)+1)
        if(state.critsAccumulated>=3)state.finisherReady=true
      }
    }
    if(id==='mage'){
      // Cargas geradas apenas em Boss/Raid; 1 a cada 6 ataques ou ao ativar proc.
      // Não cria duas cargas quando os eventos coincidem.
      if(stage>=3&&(proc||index%6===0))
        state.arcaneCharges=Math.min(3,Number(state.arcaneCharges||0)+1)
      let chargedExplosion=false
      if(stage>=2&&index%8===0){
        let boost=.20
        if(stage>=3&&Number(state.arcaneCharges||0)>=1){
          boost=stage>=5?.48:.32
          state.arcaneCharges-=1
          chargedExplosion=true
        }
        n=Math.round(n*(1+boost))
      }
      if(stage>=4&&maxHp>0&&(proc||chargedExplosion)){
        const shieldPct=proc?.06:.04
        state.awakeningShield=Math.max(Number(state.awakeningShield||0),Math.ceil(maxHp*shieldPct))
      }
    }
    if(id==='archer'){
      if(stage>=2&&index%6===0)n=Math.round(n*1.12)
      if(stage>=3){
        state.archerMarks=Math.min(5,Number(state.archerMarks||0)+1)
        const marks=Number(state.archerMarks)
        n=Math.round(n*(1+.01*marks))
        if(stage>=5&&index%6===0&&marks>=5){
          n=Math.round(n*1.22);state.archerMarks=0
          if(stage>=4)state.archerBraceReady=true
        }else if(critical){
          n=Math.round(n*(1+.02*marks));state.archerMarks=0
          if(stage>=4&&marks>=5)state.archerBraceReady=true
        }
      }
    }
    if(id==='paladin'){
      if(stage>=2&&index%8===0)n=Math.round(n*1.20)
      if(stage>=3&&index%8===0&&hpRatio<.50&&maxHp>0)
        state.awakeningShield=Math.max(Number(state.awakeningShield||0),Math.ceil(maxHp*.08))
    }
    if(id==='berserker'){
      if(stage>=2&&hpRatio<.25)n=Math.round(n*1.06)
      if(stage>=3){
        if(hpRatio>.50)state.berserkerFury=0
        else if(hpRatio<.40)state.berserkerFury=Math.min(4,Number(state.berserkerFury||0)+1)
        n=Math.round(n*(1+.01*Number(state.berserkerFury||0)))
      }
      if(stage>=4&&state.berserkerRevengeReady&&hpRatio<.40){
        n=Math.round(n*1.05);state.berserkerRevengeReady=false
      }
      if(stage>=5){
        if(hpRatio<.25)state.berserkerFrenzy=Math.min(5,Number(state.berserkerFrenzy||0)+1)
        else state.berserkerFrenzy=0
        n=Math.round(n*(1+.01*Number(state.berserkerFrenzy||0)))
      }
    }
    if(id==='monk'&&stage>=3&&index%8===0)
      state.monkChi=Math.min(2,Number(state.monkChi||0)+1)
    if(id==='monk'&&stage>=2&&state.counterReady){
      n=Math.round(n*(stage>=5?1.35:1.12));state.counterReady=false
    }
    if(id==='necromancer'){
      if(stage>=2&&index%7===0)n=Math.round(n*1.12)
      if(stage>=3)n=Math.round(n*(1+.01*Number(state.necroSouls||0)))
      if(stage>=5&&index%4===0&&Number(state.necroSouls||0)>=4){
        n=Math.round(n*1.18);state.necroSouls=0
      }
    }
    if(id==='samurai'&&stage>=3){
      if(critical){
        const focus=Math.max(0,Math.min(4,Number(state.samuraiFocus||0)))
        if(focus){
          n=Math.round(n*(1+(stage>=5&&focus===4?.30:.04*focus)))
          if(stage>=4)state.samuraiGuardReady=true
        }
        state.samuraiFocus=stage>=5&&focus===4?1:0
      }else state.samuraiFocus=Math.min(4,Number(state.samuraiFocus||0)+1)
    }
  }
  let heal=0
  if(p.lifesteal&&index%p.lifestealInterval===0&&hp>0&&maxHp>0){
    const pct=id==='necromancer'&&stage>=5?.05:id==='necromancer'&&stage>=3?.04:id==='necromancer'&&stage>=1?.03:p.lifesteal
    const cap=id==='necromancer'&&stage>=5?.05:id==='necromancer'&&stage>=3?.04:id==='necromancer'&&stage>=1?.03:p.lifestealCap
    heal=Math.min(Math.ceil(maxHp*cap),Math.floor(n*pct),Math.max(0,maxHp-hp))
    if(id==='necromancer'&&stage>=3){
      state.necroSouls=Math.min(4,Number(state.necroSouls||0)+1)
      if(stage>=4)state.awakeningShield=Math.max(Number(state.awakeningShield||0),Math.ceil(maxHp*.025))
    }
  }
  if(p.regen&&index%(id==='druid'&&stage>=1?8:p.regenInterval)===0&&hp>0&&maxHp>0){
    const pct=id==='druid'&&stage>=5?(hpRatio<.35?.06:.04):id==='druid'&&stage>=3?.03:p.regen
    heal=Math.min(Math.floor(maxHp*pct),Math.max(0,maxHp-hp))
    if(id==='druid'&&stage>=3)
      state.awakeningShield=Math.max(Number(state.awakeningShield||0),Math.ceil(maxHp*(stage>=5?.05:.03)))
  }
  if(id==='paladin'&&stage>=1&&hp>0&&maxHp>0&&hpRatio<.50&&index%8===0){
    heal=Math.min(Math.floor(maxHp*.03),Math.max(0,maxHp-hp))
  }
  if(id==='monk'&&stage>=3&&Number(state.monkChi||0)>0&&hp>0&&maxHp>0&&hp<maxHp){
    heal=Math.min(Math.floor(maxHp*(stage>=5?.03:.02)*Number(state.monkChi)),Math.max(0,maxHp-hp))
    state.monkChi=0
  }
  return {damage:Math.max(1,n),heal:Math.max(0,heal),proc,lastProcAttack,awakeningState:state}
}
