export const PLAYER_CLASSES = Object.freeze({
  warrior:Object.freeze({id:'warrior',name:'Guerreiro',role:'Equilibrado',hp:30,atk:6,def:4,spd:0,description:'Linha de frente equilibrada: mais vida, ataque e defesa sem penalidades.'}),
  assassin:Object.freeze({id:'assassin',name:'Assassino',role:'DPS veloz',hp:-10,atk:8,def:-2,spd:8,description:'Muito rápido e agressivo, mas sacrifica vida e defesa.'}),
  mage:Object.freeze({id:'mage',name:'Mago',role:'DPS arcano',hp:0,atk:10,def:-2,spd:3,description:'Maior ataque base, com defesa mais baixa.'}),
  archer:Object.freeze({id:'archer',name:'Arqueiro',role:'Precisão',hp:0,atk:6,def:0,spd:7,description:'Ataque consistente e alta velocidade.'}),
  paladin:Object.freeze({id:'paladin',name:'Paladino',role:'Tank',hp:80,atk:-4,def:12,spd:-3,description:'Tank clássico: muita vida e defesa, com menos ataque e velocidade.'}),
  berserker:Object.freeze({id:'berserker',name:'Berserker',role:'DPS bruto',hp:25,atk:12,def:-5,spd:2,description:'Dano muito alto em troca de defesa.'}),
  monk:Object.freeze({id:'monk',name:'Monge',role:'Bruiser',hp:20,atk:5,def:5,spd:6,description:'Resistente, rápido e equilibrado no corpo a corpo.'}),
  necromancer:Object.freeze({id:'necromancer',name:'Necromante',role:'DPS sombrio',hp:-5,atk:9,def:-1,spd:2,description:'Ataque elevado e pouca resistência física.'}),
  druid:Object.freeze({id:'druid',name:'Druida',role:'Sustentação',hp:45,atk:3,def:8,spd:1,description:'Muita vida e defesa, com dano moderado.'}),
  samurai:Object.freeze({id:'samurai',name:'Samurai',role:'Duelista',hp:10,atk:8,def:3,spd:5,description:'Ataque e velocidade altos sem ficar frágil demais.'})
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
  oraculo_alpha:{label:'🔮 Oráculo Alpha',stats:{crit:10,defense:8,drop:7,xp:8},raid:true}
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
