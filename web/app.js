const API_BASE = window.location.origin;
const TOKEN_KEY = 'alphaWebTokenV1';
const CHARACTER_KEY = 'alphaWebCharacterV1';

const ui = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  catalog: null,
  data: null,
  extras: null,
  extrasFetchedAt: 0,
  lastResult: null,
  lootReveal: null,
  page: 'home',
  petTab: 'owned',
  petAdoptSpecies: '',
  duelTarget: '',
  characterId: localStorage.getItem(CHARACTER_KEY) || 'rei-alpha',
  raidTimer: null,
  raidLevel: null,
  bossTimer: null,
  syncing: false,
  avatarUrl: '',
  avatarFetchedAt: 0
};

const navItems = [
  ['home','⌂','Início'],
  ['character','🧙','Personagem'],
  ['pets','🐾','Pets'],
  ['inventory','🎒','Inventário'],
  ['shop','🏪','Loja'],
  ['raids','⚔️','Raids'],
  ['boss','👹','Boss'],
  ['duels','⚔️','Duelos'],
  ['social','🥊','Social'],
  ['market','📣','Mercado'],
  ['clan','🛡️','Clã'],
  ['games','🎮','Minigames'],
  ['activities','⏳','Atividades'],
  ['progression','📈','Progressão'],
  ['rankings','🏆','Rankings'],
  ['economy','💰','Economia'],
  ['loans','💳','Empréstimos']
];

const speciesEmoji = {
  cachorro:'🐶',gato:'🐱',coelho:'🐰',papagaio:'🦜',hamster:'🐹',tartaruga:'🐢',coruja:'🦉',
  raposa:'🦊',golfinho_celestial:'🐬',lobo:'🐺',moreia_sombria:'🐍',aguia:'🦅',gaviao:'🦅',
  panda:'🐼',tubarao_abissal:'🦈',guepardo:'🐆',tigre:'🐯',polvo_arcano:'🐙',
  gazela_mistica:'🦌',leao:'🦁',cervo_mistico:'🦌',orca_guerra:'🐋',cavalo_guerra:'🐎',
  unicornio:'🦄',baleia_colossal:'🐋',dragao:'🐉',golem_ancestral:'🪨',urso_runico:'🐻',
  colosso_cristal:'💎',salamandra_infernal:'🔥',dragao_vulcanico:'🐲',fenix_fogo:'🔥',
  corvo_abissal:'👁️',lobo_abismo:'🌑',fenix_gelo:'❄️',rinoceronte_titanico:'🦏',
  guardiao_obsidiana:'🗿',leviata_gelo:'🌊',cerbero_carmesim:'🩸',tigre_lunar:'🌙',
  imperador_abissal:'👑',leao_solar:'☀️',grifo_celestial:'✨',fenix_celestial:'🌟',
  serpente_cosmica:'🌌',dragao_corrompido:'☠️',fenix_alpha:'👑'
};



const OFFICIAL_ART_SHEET='/assets/official-art-sheet.jpg?v=alpha-final-20261006';
const OFFICIAL_ART_W=1536;
const OFFICIAL_ART_H=1024;

// Folha corrigida gerada especificamente para os assets que estavam errados no jogo.
const FIXED_ART_SHEET='/assets/alpha-fixed-art.webp?v=alpha-fixed-20261006-1';
const FIXED_ART_W=960;
const FIXED_ART_H=384;

// Artes exclusivas dos pets especiais/endgame. Uma única spritesheet evita
// dezenas de downloads sem reaproveitar a identidade visual entre espécies.
const PREMIUM_PET_ART_SHEET='/assets/alpha-special-pets.webp?v=alpha-special-pets-20261006-2';
const PREMIUM_PET_ART_W=384;
const PREMIUM_PET_ART_H=288;
const PREMIUM_PET_SPRITES={
  'pet-special-oraculo_pedra':[0,0,96,96],
  'pet-special-pantera_vulcanica':[96,0,96,96],
  'pet-special-espectro_abissal':[192,0,96,96],
  'pet-special-kraken_aco':[288,0,96,96],
  'pet-special-esfinge_titanica':[0,96,96,96],
  'pet-special-quimera_abissal':[96,96,96,96],
  'pet-special-paladino_astral':[192,96,96,96],
  'pet-special-lince_celestial':[288,96,96,96],
  'pet-special-arcanjo_eclipse':[0,192,96,96],
  'pet-special-colosso_alpha':[96,192,96,96],
  'pet-special-oraculo_alpha':[192,192,96,96]
};

const SPECIAL_PET_ART_SHEETS=[
  '/assets/alpha-raid-pets-1.webp?v=alpha-raid-pets-20261006-1',
  '/assets/alpha-raid-pets-2.webp?v=alpha-raid-pets-20261006-1'
];
const SPECIAL_PET_ART_W=288;
const SPECIAL_PET_ART_H=288;
const SPECIAL_PET_SPRITES={
  'pet-special-golem_ancestral':[0,0,0,72,72],
  'pet-special-urso_runico':[0,72,0,72,72],
  'pet-special-colosso_cristal':[0,144,0,72,72],
  'pet-special-oraculo_pedra':[0,216,0,72,72],
  'pet-special-salamandra_infernal':[0,0,72,72,72],
  'pet-special-dragao_vulcanico':[0,72,72,72,72],
  'pet-special-fenix_fogo':[0,144,72,72,72],
  'pet-special-pantera_vulcanica':[0,216,72,72,72],
  'pet-special-corvo_abissal':[0,0,144,72,72],
  'pet-special-lobo_abismo':[0,72,144,72,72],
  'pet-special-fenix_gelo':[0,144,144,72,72],
  'pet-special-espectro_abissal':[0,216,144,72,72],
  'pet-special-rinoceronte_titanico':[0,0,216,72,72],
  'pet-special-guardiao_obsidiana':[0,72,216,72,72],
  'pet-special-leviata_gelo':[0,144,216,72,72],
  'pet-special-kraken_aco':[0,216,216,72,72],
  'pet-special-esfinge_titanica':[1,0,0,72,72],
  'pet-special-cerbero_carmesim':[1,72,0,72,72],
  'pet-special-tigre_lunar':[1,144,0,72,72],
  'pet-special-imperador_abissal':[1,216,0,72,72],
  'pet-special-quimera_abissal':[1,0,72,72,72],
  'pet-special-paladino_astral':[1,72,72,72,72],
  'pet-special-leao_solar':[1,144,72,72,72],
  'pet-special-grifo_celestial':[1,216,72,72,72],
  'pet-special-fenix_celestial':[1,0,144,72,72],
  'pet-special-lince_celestial':[1,72,144,72,72],
  'pet-special-arcanjo_eclipse':[1,144,144,72,72],
  'pet-special-serpente_cosmica':[1,216,144,72,72],
  'pet-special-dragao_corrompido':[1,0,216,72,72],
  'pet-special-fenix_alpha':[1,72,216,72,72],
  'pet-special-colosso_alpha':[1,144,216,72,72],
  'pet-special-oraculo_alpha':[1,216,216,72,72]
};

const FIXED_SPRITES={
  'fixed-wolvenaro':[0,0,192,192],
  'fixed-urso-runico':[192,0,192,192],
  'fixed-bota-leve':[384,0,192,192],
  'fixed-bota-vento':[576,0,192,192],
  'fixed-armadura-couro':[768,0,192,192],
  'fixed-armadura-ferro':[0,192,192,192],
  'fixed-olho-abissal':[192,192,192,192],
  'fixed-nucleo-pedra':[384,192,192,192],
  'fixed-essencia-abissal':[576,192,192,192],
  'fixed-nucleo-tita':[768,192,192,192]
};

// Recortes da arte final aprovada. Cada viewBox mostra a peça inteira dentro
// do card, sem esticar e sem usar object-fit: cover.
const OFFICIAL_SPRITES={
  // 10 classes finais
  'char-warrior':[10,28,140,158],
  'char-assassin':[153,28,126,158],
  'char-mage':[282,28,129,158],
  'char-archer':[414,28,134,158],
  'char-paladin':[551,28,139,158],
  'char-berserker':[693,28,137,158],
  'char-monk':[833,28,145,158],
  'char-necromancer':[981,28,149,158],
  'char-druid':[1133,28,133,158],
  'char-samurai':[1393,28,135,158],

  // 15 pets finais
  'pet-dog':[10,250,90,121],
  'pet-panda':[103,250,94,121],
  'pet-turtle':[200,250,91,121],
  'pet-eagle':[294,250,93,121],
  'pet-phoenix':[390,250,92,121],
  'pet-crow':[485,250,91,121],
  'pet-dragon':[579,250,101,121],
  'pet-fox':[683,250,96,121],
  'pet-tiger':[782,250,95,121],
  'pet-panther':[880,250,98,121],
  'pet-orca':[981,250,105,121],
  'pet-leviathan':[1089,250,98,121],
  'pet-shark':[1190,250,108,121],
  'pet-golem':[1301,250,105,121],
  'pet-infernal-wolf':[1409,250,119,121],

  // 7 Raids + Boss comum + Superboss
  'raid-10':[10,425,174,135],
  'raid-15':[187,425,152,135],
  'raid-20':[342,425,163,135],
  'raid-25':[508,425,152,135],
  'raid-30':[663,425,152,135],
  'raid-40':[818,425,169,135],
  'raid-50':[990,425,169,135],
  'boss-common':[1167,434,136,126],
  'boss-super':[1311,434,215,126],

  // Poções do jogador
  'potion-small':[10,617,74,67],
  'potion-medium':[87,617,67,67],
  'potion-large':[155,617,68,67],
  'potion-elixir':[226,617,67,67],

  // Poções de pet
  'pet-potion-small':[306,617,68,67],
  'pet-potion-medium':[377,617,68,67],
  'pet-potion-large':[447,617,68,67],
  'pet-potion-elixir':[518,617,69,67],

  // Caixas
  'box-luck':[594,617,85,67],
  'box-rare':[681,617,87,67],
  'box-epic':[770,617,88,67],
  'box-legendary':[860,617,87,67],

  // Chaves de Raid
  'key-10':[947,617,47,67],
  'key-15':[995,617,47,67],
  'key-20':[1043,617,47,67],
  'key-25':[1091,617,47,67],
  'key-30':[1139,617,47,67],
  'key-40':[1187,617,47,67],
  'key-50':[1235,617,47,67],

  // Materiais
  'material-alpha':[1296,617,57,67],
  'material-abyss':[1355,617,57,67],
  'material-ancestral':[1413,617,57,67],
  'material-celestial':[1472,617,61,67],

  // Armas
  'weapon-eclipse':[11,744,75,90],
  'weapon-abyss':[89,744,75,90],
  'weapon-trident':[167,744,75,90],
  'weapon-scythe':[245,744,75,90],
  'weapon-hammer':[323,744,75,90],
  'weapon-bow':[401,744,75,90],

  // Armaduras
  'armor-abyss':[490,744,76,90],
  'armor-titan':[568,744,76,90],
  'armor-celestial':[646,744,76,90],
  'armor-leviathan':[724,744,76,90],
  'armor-obsidian':[802,744,76,90],
  'armor-chaos':[880,744,80,90],

  // Itens especiais
  'special-summon':[983,744,86,90],
  'special-soul':[1072,744,86,90],
  'special-up':[1161,744,86,90],
  'special-scroll':[1250,744,86,90],
  'special-ticket':[1339,744,86,90],
  'special-essence':[1428,744,97,90],

  // Cenários - somente a cena, sem cortar personagens/objetos
  'bg-shop':[10,902,129,86],
  'bg-inventory':[142,902,127,86],
  'bg-arena':[272,902,130,86],
  'bg-raid':[405,902,130,86],
  'bg-boss':[538,902,132,86],
  'bg-result':[673,902,132,86],
  'bg-abilities':[807,902,163,86],

  // Efeitos - ícone isolado; fundo preto desaparece por screen blend
  'fx-normal':[985,902,68,82],
  'fx-critical':[1058,902,69,82],
  'fx-heal':[1133,902,71,82],
  'fx-boss':[1210,902,71,82],
  'fx-skill':[1287,902,73,82],
  'fx-buff':[1365,902,72,82],
  'fx-debuff':[1443,902,83,82]
};

function artSprite(key,className,alt){
  const special=SPECIAL_PET_SPRITES[key];
  const fixed=FIXED_SPRITES[key];
  const b=special?special.slice(1):(fixed||OFFICIAL_SPRITES[key]);
  if(!b) return '';
  const sheet=special?SPECIAL_PET_ART_SHEETS[special[0]]:(fixed?FIXED_ART_SHEET:OFFICIAL_ART_SHEET);
  const width=special?SPECIAL_PET_ART_W:(fixed?FIXED_ART_W:OFFICIAL_ART_W);
  const height=special?SPECIAL_PET_ART_H:(fixed?FIXED_ART_H:OFFICIAL_ART_H);
  return '<svg class="official-art '+esc(className||'')+'" viewBox="'+b.join(' ')+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+esc(alt||key)+'">'+
    '<image href="'+sheet+'" x="0" y="0" width="'+width+'" height="'+height+'" preserveAspectRatio="none"></image>'+
  '</svg>';
}

const CHARACTER_ART=[
  {id:'warrior',name:'Guerreiro',role:'Guerreiro',sprite:'char-warrior',desc:'Linha de frente equilibrada e agressiva.'},
  {id:'assassin',name:'Assassino',role:'Assassino',sprite:'char-assassin',desc:'Visual sombrio, veloz e preciso.'},
  {id:'mage',name:'Mago',role:'Mago',sprite:'char-mage',desc:'Energia arcana e presença de alto impacto.'},
  {id:'archer',name:'Arqueiro',role:'Arqueiro',sprite:'char-archer',desc:'Agilidade e combate à distância.'},
  {id:'paladin',name:'Paladino',role:'Paladino',sprite:'char-paladin',desc:'Armadura nobre e estilo defensivo.'},
  {id:'berserker',name:'Berserker',role:'Berserker',sprite:'char-berserker',desc:'Força bruta e visual de ataque pesado.'},
  {id:'monk',name:'Monge',role:'Monge',sprite:'char-monk',desc:'Combate disciplinado e corpo a corpo.'},
  {id:'necromancer',name:'Necromante',role:'Necromante',sprite:'char-necromancer',desc:'Magia sombria e aura abissal.'},
  {id:'druid',name:'Druida',role:'Druida',sprite:'char-druid',desc:'Natureza ancestral e magia verde.'},
  {id:'samurai',name:'Samurai',role:'Samurai',sprite:'char-samurai',desc:'Precisão, disciplina e lâmina oriental.'}
];

const PET_NATIVE_SPRITES={
  cachorro:'pet-dog',
  tartaruga:'pet-turtle',
  aguia:'pet-eagle',
  panda:'pet-panda',
  tubarao_abissal:'pet-shark',
  tigre:'pet-tiger',
  orca_guerra:'pet-orca',
  dragao:'pet-dragon',
  golem_ancestral:'pet-golem'
};

const PET_SPECIES_EMOJI={
  cachorro:'🐕',gato:'🐈',coelho:'🐇',papagaio:'🦜',hamster:'🐹',tartaruga:'🐢',coruja:'🦉',
  raposa:'🦊',golfinho_celestial:'🐬',lobo:'🐺',moreia_sombria:'🐍',aguia:'🦅',gaviao:'🦅',
  panda:'🐼',tubarao_abissal:'🦈',guepardo:'🐆',tigre:'🐯',polvo_arcano:'🐙',
  gazela_mistica:'🦌',leao:'🦁',cervo_mistico:'🦌',orca_guerra:'🐋',cavalo_guerra:'🐎',
  unicornio:'🦄',baleia_colossal:'🐋',dragao:'🐉',
  golem_ancestral:'🗿',urso_runico:'🐻',colosso_cristal:'💎',oraculo_pedra:'🗿',
  salamandra_infernal:'🔥',dragao_vulcanico:'🐉',fenix_fogo:'🔥',pantera_vulcanica:'🐆',
  corvo_abissal:'🐦‍⬛',lobo_abismo:'🐺',fenix_gelo:'❄️',espectro_abissal:'👻',
  rinoceronte_titanico:'🦏',guardiao_obsidiana:'🗿',leviata_gelo:'🐉',kraken_aco:'🐙',
  esfinge_titanica:'🦁',cerbero_carmesim:'🐺',tigre_lunar:'🐯',imperador_abissal:'🦈',
  quimera_abissal:'🐉',paladino_astral:'🛡️',leao_solar:'🦁',grifo_celestial:'🦅',
  fenix_celestial:'🔥',lince_celestial:'🐈',arcanjo_eclipse:'🪽',serpente_cosmica:'🐍',
  dragao_corrompido:'🐉',fenix_alpha:'🔥',colosso_alpha:'🗿',oraculo_alpha:'🔮',kitsune:'🦊'
};

function selectedCharacter(){
  const legacy={ 'rei-alpha':'warrior','guardiao-onix':'paladin','sentinela-azul':'mage' };
  const server=(ui.data&&ui.data.combatProfile&&ui.data.combatProfile.class_applied)?ui.data.combatProfile.class_id:'';
  const id=server || legacy[ui.characterId] || ui.characterId;
  return CHARACTER_ART.find(x=>x.id===id)||CHARACTER_ART[0];
}
function classRule(id){
  return ((ui.catalog&&ui.catalog.classes)||[]).find(x=>x.id===id)||null;
}
function signedStat(value,label){
  const n=Number(value||0);
  return (n>=0?'+':'')+num(n)+' '+label;
}
const PET_IMAGE_ASSETS={
  gato:'/assets/pets/gato.webp',
  raposa:'/assets/pets/raposa.webp',
  kitsune:'/assets/pets/kitsune.webp',
  lobo:'/assets/pets/lobo.webp',
  aguia:'/assets/pets/aguia.webp',
  tigre:'/assets/pets/tigre.webp',
  leao:'/assets/pets/leao.webp',
  dragao:'/assets/pets/dragao.webp',
  tubarao_abissal:'/assets/pets/tubarao-abissal.webp',
  polvo_arcano:'/assets/pets/polvo-arcano.webp',
  baleia_colossal:'/assets/pets/baleia-colossal.webp',
  corvo_abissal:'/assets/pets/corvo-abissal.webp',
  grifo_celestial:'/assets/pets/grifo-celestial.webp',
  fenix_gelo:'/assets/pets/fenix-de-gelo.webp',
  fenix_celestial:'/assets/pets/fenix-celestial.webp',
  serpente_cosmica:'/assets/pets/serpente-cosmica.webp'
};

function petExactImage(species){
  const s=String(species||'').toLowerCase();
  if(PET_IMAGE_ASSETS[s]) return PET_IMAGE_ASSETS[s];
  if(s==='leao_solar') return PET_IMAGE_ASSETS.leao;
  if(s==='tigre_lunar') return PET_IMAGE_ASSETS.tigre;
  if(s==='lobo_abismo') return PET_IMAGE_ASSETS.lobo;
  if(s==='dragao_vulcanico'||s==='dragao_corrompido') return PET_IMAGE_ASSETS.dragao;
  if(s==='kraken_aco') return PET_IMAGE_ASSETS.polvo_arcano;
  return '';
}
function petSpriteKey(species){
  const s=String(species||'').toLowerCase();
  return PET_NATIVE_SPRITES[s]||'';
}
function petSpeciesFallback(species,className,label){
  const s=String(species||'').toLowerCase();
  const emoji=PET_SPECIES_EMOJI[s]||'🐾';
  return '<div class="pet-species-fallback '+esc(className||'')+'" role="img" aria-label="'+esc(label||petSpeciesName(s))+'">'+
    '<span aria-hidden="true">'+emoji+'</span><small>'+esc(label||petSpeciesName(s))+'</small></div>';
}
function petCroppedSprite(key,className,label){
  const premium=PREMIUM_PET_SPRITES[key];
  const special=SPECIAL_PET_SPRITES[key];
  const fixed=FIXED_SPRITES[key];
  const b=premium?premium:(special?special.slice(1):(fixed||OFFICIAL_SPRITES[key]));
  if(!b) return '';
  const sheet=premium?PREMIUM_PET_ART_SHEET:(special?SPECIAL_PET_ART_SHEETS[special[0]]:(fixed?FIXED_ART_SHEET:OFFICIAL_ART_SHEET));
  const sw=premium?PREMIUM_PET_ART_W:(special?SPECIAL_PET_ART_W:(fixed?FIXED_ART_W:OFFICIAL_ART_W));
  const sh=premium?PREMIUM_PET_ART_H:(special?SPECIAL_PET_ART_H:(fixed?FIXED_ART_H:OFFICIAL_ART_H));
  const x=Number(b[0]),y=Number(b[1]),w=Number(b[2]),h=Number(b[3]);
  const sizeX=(sw/w)*100;
  const sizeY=(sh/h)*100;
  const posX=sw===w?0:(x/(sw-w))*100;
  const posY=sh===h?0:(y/(sh-h))*100;
  return '<div class="pet-cropped-art '+esc(className||'')+'" role="img" aria-label="'+esc(label||key)+'" '+
    'style="aspect-ratio:'+w+'/'+h+';background-image:url(\''+esc(sheet)+'\');background-size:'+sizeX+'% '+sizeY+'%;background-position:'+posX+'% '+posY+'%"></div>';
}
function petSpeciesName(species){
  const s=String(species||'').toLowerCase();
  const row=catalogPets().find(x=>String(x.species||'').toLowerCase()===s);
  const raw=String(row?.label||row?.name||titleCase(s));
  return raw.replace(/^[^\p{L}\p{N}]+/u,'').trim()||titleCase(s);
}
function petVisualMarkup(species,className='pet-official-art'){
  const s=String(species||'').toLowerCase();
  const label=petSpeciesName(s);
  const exclusive='pet-special-'+s;

  // Pets de Raid/endgame: uma única arte por card. Nunca empilha sprite de outra espécie.
  if(PREMIUM_PET_SPRITES[exclusive]||SPECIAL_PET_SPRITES[exclusive]){
    return petCroppedSprite(exclusive,className+' pet-primary-art',label);
  }

  const img=petExactImage(s);
  if(img){
    return '<div class="pet-art-stack">'+
      petSpeciesFallback(s,className+' pet-image-fallback',label)+
      '<img class="pet-exact-art '+esc(className)+' pet-primary-art" src="'+esc(img)+'?v=alpha-pets-20261006-5" alt="'+esc(label)+'" loading="lazy" '+
      'onload="this.parentElement.classList.add(\'pet-art-loaded\')" onerror="this.remove()"></div>';
  }

  // Só usa sprite oficial quando ele representa a MESMA espécie.
  const nativeKey=petSpriteKey(s);
  if(nativeKey) return petCroppedSprite(nativeKey,className+' pet-primary-art',label);

  // Espécies que ainda não têm arquivo individual nunca recebem imagem de outro animal.
  return petSpeciesFallback(s,className,label);
}

function raidSpriteKey(level,name){
  const lv=Number(level||0);
  if([10,15,20,25,30,40,50].includes(lv)) return 'raid-'+lv;
  const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(n.includes('pedra')) return 'raid-10';
  if(n.includes('vulcan')||n.includes('dragao')) return 'raid-15';
  if(n.includes('abiss')) return 'raid-20';
  if(n.includes('tita')||n.includes('ferro')) return 'raid-25';
  if(n.includes('cristal')) return 'raid-30';
  if(n.includes('seraf')) return 'raid-40';
  if(n.includes('corromp')) return 'raid-50';
  return 'raid-10';
}
function bossSpriteKey(name,mode){
  const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const m=String(mode||'').toLowerCase();
  if(n.includes('ladrao')||n.includes('novembro')||m==='weekly'||n.includes('superboss')) return 'boss-super';
  if(n.includes('seraf')) return 'raid-40';
  if(n.includes('corromp')) return 'raid-50';
  if(n.includes('vulcan')||n.includes('dragao')) return 'raid-15';
  if(n.includes('abiss')) return 'raid-20';
  if(n.includes('cristal')) return 'raid-30';
  return 'boss-common';
}
function combatArenaMarkup(enemyName,kind,level,mode){
  const ch=selectedCharacter();
  const enemyKey=kind==='raid'?raidSpriteKey(level,enemyName):bossSpriteKey(enemyName,mode);
  const key=kind==='raid'?'raid-'+Number(level):'boss';
  return '<div class="combat-arena" data-combat-arena="'+key+'">'+
    '<div class="combat-fighter player" data-combat-player>'+artSprite(ch.sprite,'combat-character-art',ch.name)+'<span>'+esc(ch.name)+'</span></div>'+
    '<div class="combat-vs">VS</div>'+
    '<div class="combat-fighter enemy" data-combat-enemy>'+artSprite(enemyKey,'combat-enemy-art',enemyName||'Inimigo')+'<span>'+esc(enemyName||'Inimigo')+'</span></div>'+
    '<div class="combat-fx" data-combat-fx></div>'+
  '</div>';
}
function raidArenaMarkup(raid,state){
  if(state&&state.status==='active') return combatArenaMarkup(raid.name,'raid',raid.level);
  return '<div class="raid-art-showcase">'+artSprite(raidSpriteKey(raid.level,raid.name),'raid-showcase-art',raid.name)+'</div>';
}
function combatDamage(result){
  if(!result||typeof result!=='object') return 0;
  const keys=['damage','totalDamage','dealtDamage','playerDamage','roundDamage','damageDealt'];
  for(const k of keys){
    const v=Number(result[k]);
    if(Number.isFinite(v)&&v>0) return v;
  }
  for(const arrKey of ['attacks','log','hits']){
    const arr=result[arrKey];
    if(Array.isArray(arr)){
      const v=arr.reduce((s,x)=>s+Number((x&&((x.damage??x.dmg)??0))||0),0);
      if(v>0) return v;
    }
  }
  if(result.result&&typeof result.result==='object') return combatDamage(result.result);
  return 0;
}
function combatIncomingDamage(result){
  if(!result||typeof result!=='object') return 0;
  const direct=Number(result.bossDamage||0);
  if(direct>0) return direct;
  if(Array.isArray(result.events)){
    return result.events.filter(x=>x&&x.type==='boss').reduce((sum,x)=>sum+Number(x.damage||0),0);
  }
  return 0;
}
function combatWasCritical(result){
  if(!result||typeof result!=='object') return false;
  if(result.pet&&result.pet.crit) return true;
  if(result.crit===true) return true;
  return Array.isArray(result.events)&&result.events.some(x=>x&&x.type==='hit'&&x.crit);
}

function animateCombatImpact(kind,result,level){
  const key=kind==='raid'?'raid-'+Number(level):'boss';
  const arena=document.querySelector('[data-combat-arena="'+key+'"]');
  if(!arena) return;
  const player=arena.querySelector('[data-combat-player]');
  const enemy=arena.querySelector('[data-combat-enemy]');
  const fx=arena.querySelector('[data-combat-fx]');
  if(!player||!enemy) return;
  const dealt=combatDamage(result);
  const incoming=combatIncomingDamage(result);
  const critical=combatWasCritical(result);
  const healed=Number(result&&result.petSkillHeal&&result.petSkillHeal.heal||result&&result.autoHeal&&result.autoHeal.heal||0);

  for(const el of [player,enemy,arena]) el.classList.remove('attack','hit','counter','impact','critical-impact');
  if(fx) fx.innerHTML='';
  void arena.offsetWidth;
  arena.classList.add('impact');
  if(critical) arena.classList.add('critical-impact');
  player.classList.add('attack');

  window.setTimeout(()=>{
    enemy.classList.add('hit');
    if(fx){
      fx.innerHTML=
        '<div class="combat-effect outgoing">'+artSprite(critical?'fx-critical':'fx-normal','fx-art',critical?'Dano crítico':'Dano normal')+
        '<span class="damage-float '+(critical?'critical':'')+'">'+(critical?'CRÍTICO ':'')+(dealt>0?'-'+num(dealt):'💥')+'</span></div>';
    }
  },150);

  if(incoming>0){
    window.setTimeout(()=>{
      enemy.classList.add('counter');
      player.classList.add('hit');
      if(fx){
        fx.innerHTML+=
          '<div class="combat-effect incoming-fx">'+artSprite('fx-boss','fx-art','Ataque do Boss')+
          '<span class="damage-float incoming">-'+num(incoming)+'</span></div>';
      }
    },560);
  }

  if(healed>0){
    window.setTimeout(()=>{
      if(fx){
        fx.innerHTML+=
          '<div class="combat-effect heal-fx">'+artSprite('fx-heal','fx-art','Cura')+
          '<span class="heal-float">+'+num(healed)+'</span></div>';
      }
    },830);
  }

  window.setTimeout(()=>{
    for(const el of [player,enemy,arena]) el.classList.remove('attack','hit','counter','impact','critical-impact');
    if(fx) fx.innerHTML='';
  },1450);
}

const $ = s => document.querySelector(s);
const esc = value => String(value == null ? '' : value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value||0));
const num = value => Number(value||0).toLocaleString('pt-BR');
const pct = value => Math.max(0,Math.min(100,Number(value||0)));
const rarityClass = r => 'rarity-' + String(r||'common').toLowerCase();
const titleCase = s => String(s||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
function raidStatusLabel(value){
  const key=String(value||'').toLowerCase();
  return ({lobby:'Sala aberta',active:'Em andamento',completed:'Concluída',failed:'Fracassada',cancelled:'Cancelada',inactive:'Inativa'}[key]||titleCase(key));
}
function bossModeLabel(value){
  const key=String(value||'').toLowerCase();
  return ({common:'Comum',weekly:'Semanal',event:'Evento',event_completed:'Evento concluído',completed:'Concluído'}[key]||titleCase(key));
}
function loanStatusLabel(value){
  const key=String(value||'').toLowerCase();
  return ({pending:'Pendente',active:'Ativo',paid:'Pago',rejected:'Recusado',cancelled:'Cancelado',expired:'Expirado',overdue:'Atrasado'}[key]||titleCase(key));
}

function toast(message){
  const el=$('#toast');
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(window.__alphaToast);
  window.__alphaToast=setTimeout(()=>el.classList.remove('show'),2600);
}

async function api(path, options){
  options=options||{};
  const headers=Object.assign({'content-type':'application/json'},options.headers||{});
  if(ui.token) headers.authorization='Bearer '+ui.token;
  const res=await fetch(API_BASE+path,Object.assign({},options,{headers}));
  let body={};
  try{ body=await res.json(); }catch{}
  if(!res.ok || body.ok===false) throw new Error(body.error||('HTTP '+res.status));
  return body;
}

async function syncAvatar(force=false){
  if(!ui.token) return;
  if(!force && ui.avatarFetchedAt && Date.now()-ui.avatarFetchedAt<60000) return;
  ui.avatarFetchedAt=Date.now();
  try{
    const res=await fetch(API_BASE+'/api/v1/me/avatar',{headers:{authorization:'Bearer '+ui.token},cache:'no-store'});
    if(res.status===404){
      if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
      ui.avatarUrl='';
      return;
    }
    if(!res.ok) return;
    const blob=await res.blob();
    const next=URL.createObjectURL(blob);
    if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
    ui.avatarUrl=next;
  }catch{}
}

async function exchange(code){
  const clean=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!clean) throw new Error('Informe o código gerado pelo !web.');
  const body=await api('/api/v1/auth/exchange',{method:'POST',body:JSON.stringify({code:clean})});
  ui.token=body.token;
  localStorage.setItem(TOKEN_KEY,ui.token);
  return body;
}

async function sync(silent){
  if(!ui.token || ui.syncing) return;
  ui.syncing=true;
  setSync(false);
  try{
    const jobs=[];
    if(!ui.catalog) jobs.push(api('/api/v1/catalog'));
    else jobs.push(Promise.resolve(null));
    jobs.push(api('/api/v1/me/bootstrap'));
    const values=await Promise.all(jobs);
    if(values[0]) ui.catalog=values[0].data;
    ui.data=values[1].data;
    await syncAvatar(false);
    showApp();
    render();
    setSync(true);
    if(!silent) toast('Dados sincronizados com o Alpha Bot.');
  }catch(err){
    if(/sessão web inválida|expirada/i.test(err.message)){
      logout(false);
      showLogin(err.message);
    }else{
      setSync(false);
      if(!silent) toast(err.message);
    }
  }finally{ ui.syncing=false; }
}

async function syncExtras(force){
  if(!ui.token) return null;
  if(!force && ui.extras && Date.now()-ui.extrasFetchedAt<30000) return ui.extras;
  try{
    const response=await api('/api/v1/me/extras');
    ui.extras=response.data;
    ui.extrasFetchedAt=Date.now();
    return ui.extras;
  }catch(err){
    toast(err.message);
    throw err;
  }
}

function actionFeedback(name,result){
  if(result&&result.ok===false&&Number(result.remaining)>0) return '⏳ Recarga: '+formatRemaining(result.remaining);
  if(result&&result.cooldown&&Number(result.remainingMs)>0) return '⏳ Aguarde '+formatRemaining(Number(result.remainingMs)/1000);
  if(name==='daily'&&result&&result.ok) return '🎁 Bônus diário recebido • '+money(result.totalCash||result.amount||0)+' • sequência '+num(result.streak||1);
  if(name==='work'&&result&&result.ok) return '💼 Trabalho concluído • +'+money(result.amount||0)+' • recarga de 30 min';
  if(name==='all'&&result) return '⚡ Rotina completa processada. Veja o resultado abaixo.';
  return 'Ação concluída no Alpha Bot.';
}
async function doAction(name,body,options){
  options=options||{};
  try{
    if(!options.quiet) toast('Processando...');
    const response=await api('/api/v1/action/'+encodeURIComponent(name),{method:'POST',body:JSON.stringify(body||{})});
    ui.lastResult=response.result;
    if(options.afterSync!==false) await sync(true);
    if(['social','market','clan','games','activities','progression','rankings','loans'].includes(ui.page)){
      await syncExtras(true).catch(()=>null);
      render();
    }
    if(!options.quiet) toast(options.success||actionFeedback(name,response.result));
    return response.result;
  }catch(err){
    if(!options.quiet) toast(err.message);
    throw err;
  }
}

function setSync(ok){
  const el=$('#syncBadge');
  if(!el) return;
  el.textContent=ok?'● WPP / NEON SINCRONIZADO':'● SINCRONIZANDO';
  el.classList.toggle('ok',!!ok);
}

function showApp(){
  $('#loginOverlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
}
function showLogin(error){
  $('#app').classList.add('hidden');
  $('#loginOverlay').classList.remove('hidden');
  $('#linkError').textContent=error||'';
}
async function logout(remote){
  stopRaidAuto();
  stopBossAuto();
  if(remote!==false && ui.token){
    try{ await api('/api/v1/auth/logout',{method:'POST',body:'{}'}); }catch{}
  }
  if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
  ui.avatarUrl=''; ui.avatarFetchedAt=0;
  ui.token=''; ui.data=null; ui.catalog=null; ui.extras=null; ui.extrasFetchedAt=0;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

function setMenu(open){
  const side=$('#sidebar');
  const back=$('#menuBackdrop');
  const isOpen=Boolean(open);
  if(side) side.classList.toggle('open',isOpen);
  if(back){
    back.classList.toggle('open',isOpen);
    back.setAttribute('aria-hidden',isOpen?'false':'true');
  }
  document.body.classList.toggle('menu-open',isOpen);
}

function renderNav(){
  $('#nav').innerHTML=navItems.map(item=>{
    return '<button class="nav-btn '+(ui.page===item[0]?'active':'')+'" data-page="'+item[0]+'"><span>'+item[1]+'</span>'+item[2]+'</button>';
  }).join('');
  document.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=async()=>{
    ui.page=btn.dataset.page;
    setMenu(false);
    if(['social','market','clan','games','activities','rankings','loans'].includes(ui.page)){
      await syncExtras(false).catch(()=>null);
    }
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
  });
}

function profile(){
  return (ui.data&&ui.data.combatProfile) || (ui.data&&ui.data.profile) || {};
}
function currentGroup(){
  return ui.data&&ui.data.group;
}
function collection(){
  return (ui.data&&ui.data.pets)||[];
}
function catalogPets(){
  return (ui.catalog&&ui.catalog.pets)||[];
}
function itemCount(id){
  const row=((ui.data&&ui.data.inventory)||[]).find(x=>x.item_id===id);
  return Number(row&&row.quantity||0);
}

function renderHeader(){
  const p=profile();
  const raw=(ui.data&&ui.data.profile)||p;
  $('#miniProfile').innerHTML='<div class="mini-profile-row">'+(ui.avatarUrl?'<img class="mini-avatar" src="'+esc(ui.avatarUrl)+'" alt="">':'<div class="mini-avatar fallback">A</div>')+'<div><strong>'+esc(raw.push_name||'Jogador')+'</strong><small>Nível '+num(raw.level)+' • '+(ui.data&&ui.data.identity&&ui.data.identity.groupLinked?'grupo vinculado':'sem grupo vinculado')+'</small></div></div>';
  $('#topStats').innerHTML=[
    '<span class="top-pill">❤️ '+num(p.effective_hp||p.hp)+'/'+num(p.effective_max_hp||p.max_hp)+'</span>',
    '<span class="top-pill">💵 '+money(raw.cash)+'</span>',
    '<span class="top-pill">🏦 '+money(raw.bank)+'</span>'
  ].join('');
  const title=(navItems.find(x=>x[0]===ui.page)||['','','Alpha RPG'])[2];
  $('#pageTitle').textContent=title;
}

function cooldownKey(key){
  return String(key||'').split(':')[0].trim().toLowerCase();
}
function cooldownLabel(key){
  const action=cooldownKey(key);
  const map={battle:'Duelo',rob:'Roubar',work:'Trabalhar',uber:'Uber',ifood:'iFood',daily:'Bônus diário',petduel:'Duelo Pet',dungeon:'Masmorra'};
  return map[action]||titleCase(action||'Recarga');
}
function formatRemaining(seconds){
  const total=Math.max(0,Math.ceil(Number(seconds||0)));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  if(h>0) return h+'h '+m+'m';
  if(m>0) return m+'m '+s+'s';
  return s+'s';
}
function cooldownExpiry(action){
  const row=((ui.data&&ui.data.cooldowns)||[]).find(x=>cooldownKey(x.key)===String(action||'').toLowerCase());
  return row?Number(row.expires_at||0):0;
}
function cooldownRemaining(action){
  const nowSec=Math.floor(Date.now()/1000);
  const expires=cooldownExpiry(action);
  return expires?Math.max(0,expires-nowSec):0;
}
function refreshLiveCountdowns(){
  const nowSec=Math.floor(Date.now()/1000);
  document.querySelectorAll('[data-cooldown-expires]').forEach(el=>{
    const expires=Number(el.dataset.cooldownExpires||0);
    const remain=Math.max(0,expires-nowSec);
    el.textContent=formatRemaining(remain);
    if(remain<=0){
      const row=el.closest('.list-row');
      if(row) row.remove();
    }
  });
  document.querySelectorAll('[data-work-cooldown]').forEach(btn=>{
    const expires=Number(btn.dataset.workCooldown||0);
    const remain=Math.max(0,expires-nowSec);
    if(remain>0){
      btn.disabled=true;
      btn.textContent='⏳ Trabalhar • '+formatRemaining(remain);
    }else{
      btn.disabled=false;
      btn.textContent='💼 Trabalhar';
      delete btn.dataset.workCooldown;
    }
  });
}
function transactionLabel(type){
  const map={
    work:'Trabalho',income_tax:'TAXADE',uber:'Uber',ifood:'iFood',transfer:'PIX',
    shop:'Loja',market:'Mercado',market_sale:'Venda no mercado',raid_reward:'Raid',
    boss_reward:'Boss',business_collect:'Negócios',daily:'Bônus diário',loan:'Empréstimo',
    equipment_upgrade:'Melhoria de equipamento',pet_rename:'Renomear pet',raid_key_auto:'Chave Raid'
  };
  return map[String(type||'')]||titleCase(String(type||'movimentação').replace(/_/g,' '));
}
function renderTransactions(limit){
  const rows=((ui.data&&ui.data.recentTransactions)||[]).slice(0,Number(limit||20));
  if(!rows.length) return '<div class="empty">Nenhuma movimentação recente.</div>';
  return '<div class="list transactions">'+rows.map(t=>{
    const outgoing=t.direction==='out',incoming=t.direction==='in';
    const sign=outgoing?'-':incoming?'+':'';
    const when=Number(t.created_at||0)>0?new Date(Number(t.created_at)*1000).toLocaleString('pt-BR'):'';
    const who=t.counterparty?' • '+esc(t.counterparty):'';
    return '<div class="list-row"><div><strong>'+esc(transactionLabel(t.type))+'</strong><small>'+esc(t.note||'')+who+(when?' • '+esc(when):'')+'</small></div><strong class="'+(incoming?'money-in':outgoing?'money-out':'')+'">'+sign+money(t.amount)+'</strong></div>';
  }).join('')+'</div>';
}

function renderCooldowns(){
  const rows=(ui.data&&ui.data.cooldowns)||[];
  const nowSec=Math.floor(Date.now()/1000);
  const known=new Set(['battle','rob','work','uber','ifood','daily','petduel','dungeon']);
  const active=rows.filter(row=>Number(row.expires_at||0)>nowSec && known.has(cooldownKey(row.key)));
  if(!active.length) return '<div class="empty">Nenhuma recarga ativa.</div>';
  return '<div class="list">'+active.map(row=>{
    const expires=Number(row.expires_at||0);
    const remain=Math.max(0,expires-nowSec);
    return '<div class="list-row"><span>'+esc(cooldownLabel(row.key))+'</span><strong data-cooldown-expires="'+expires+'">'+esc(formatRemaining(remain))+'</strong></div>';
  }).join('')+'</div>';
}

function statCard(label,value,sub){
  return '<div class="card stat-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub||'')+'</span></div>';
}

function renderLiveGroupState(group){
  if(!group) return '<div class="empty">Vincule pelo !web dentro do grupo para acompanhar Boss, Raids e eventos daqui.</div>';
  const boss=group.bossEvent||group.boss||null;
  const raids=(group.raids||[]).filter(r=>r&&['lobby','active'].includes(r.status));
  const games=group.games||{};
  const activeGames=Object.keys(games).filter(k=>games[k] && !['boss','boss_event'].includes(k));
  let html='<div class="list">';
  if(boss){
    const hp=Number(boss.hp||0),max=Math.max(1,Number(boss.maxHp||1));
    html+='<div class="list-row"><div><strong>👹 '+esc(boss.name||'Boss')+'</strong><small>'+num(hp)+'/'+num(max)+' HP</small></div><button class="btn" data-go-page="boss">Abrir</button></div>';
  }else html+='<div class="list-row"><span>👹 Boss</span><small>Nenhum ativo</small></div>';
  if(raids.length){
    for(const raid of raids.slice(0,4)){
      html+='<div class="list-row"><div><strong>⚔️ Raid Lv.'+num(raid.level)+'</strong><small>'+esc(raidStatusLabel(raid.status))+' • '+num(Object.keys(raid.players||{}).length)+'/5</small></div><button class="btn" data-go-page="raids">Abrir</button></div>';
    }
  }else html+='<div class="list-row"><span>⚔️ Raids</span><small>Nenhuma aberta</small></div>';
  html+='<div class="list-row"><span>🎮 Sessões de minigame</span><strong>'+num(activeGames.length)+'</strong></div>';
  return html+'</div>';
}

function renderDoubleRewardEvent(){
  const event=(ui.data&&ui.data.events&&ui.data.events.doubleReward)||null;
  if(!event || (!event.active&&!event.scheduled)) return '';
  const now=Date.now();
  const ms=event.active?Math.max(0,Number(event.endsAt||0)-now):Math.max(0,Number(event.startsAt||0)-now);
  const mins=Math.max(1,Math.ceil(ms/60000));
  return '<div class="section card double-event '+(event.active?'active':'scheduled')+'">'+
    '<div class="section-title"><div><h3>🔥 Evento de recompensa '+(event.active?'ATIVO':'AGENDADO')+'</h3><small>Dinheiro ×'+num(event.moneyMultiplier||1)+' • XP ×'+num(event.xpMultiplier||1)+'</small></div><span class="tag '+(event.active?'good':'')+'">⏳ '+mins+' min</span></div>'+
    '<p>'+(event.active?'Trabalho, Uber, iFood, Masmorra e outras recompensas elegíveis já usam esses multiplicadores no servidor.':'O multiplicador ainda não começou.')+'</p>'+
  '</div>';
}

function renderLuckyBoxEvent(){
  const event=(ui.data&&ui.data.events&&ui.data.events.luckyBox)||null;
  if(!event || (!event.active&&!event.scheduled)) return '';
  const qty=itemCount('caixa_sorte');
  const now=Date.now();
  const ms=event.active?Math.max(0,Number(event.endsAt||0)-now):Math.max(0,Number(event.startsAt||0)-now);
  const mins=Math.max(1,Math.ceil(ms/60000));
  return '<div class="section card lucky-event '+(event.active?'active':'scheduled')+'">'+
    '<div class="section-title"><div><h3>🎁 Evento Caixa da Sorte '+(event.active?'ATIVO':'AGENDADO')+'</h3><small>Multiplicador de sorte ×'+num(event.multiplier||2)+'</small></div><span class="tag '+(event.active?'good':'')+'">⏳ '+mins+' min</span></div>'+
    '<p>'+(event.active?'As Caixas da Sorte abertas agora usam o multiplicador do evento compartilhado do WhatsApp.':'O bônus ainda não começou.')+'</p>'+
    (event.active&&qty>0?'<div class="hero-actions"><button class="btn primary" data-lucky-open="1">Abrir 1</button><button class="btn good" data-lucky-open="'+Math.min(50,qty)+'">Abrir '+Math.min(50,qty)+'</button><span class="tag">'+qty+' caixa(s)</span></div>':'')+
  '</div>';
}

function renderHome(){
  const p=profile(), raw=ui.data.profile||p;
  const hpMax=Number(p.effective_max_hp||p.max_hp||1), hp=Number(p.effective_hp||p.hp||0);
  const group=currentGroup();
  const activities=(ui.data&&ui.data.activities)||{};
  const missions=(ui.data&&ui.data.dailyMissions)||[];
  const dailyDone=Boolean(ui.data&&ui.data.streak&&ui.data.streak.claimedToday);
  const dailyStreak=Number(ui.data&&ui.data.streak&&ui.data.streak.streak||0);
  const workExpires=cooldownExpiry('work');
  const workRemain=cooldownRemaining('work');
  const dailyText=dailyDone?'✅ Bônus diário feito':'🎁 Bônus diário';
  const workText=workRemain>0?'⏳ Trabalhar • '+formatRemaining(workRemain):'💼 Trabalhar';
  return renderDoubleRewardEvent()+renderLuckyBoxEvent()+'<div class="hero card">'+
    '<div><p class="eyebrow">CONTA REAL DO WHATSAPP</p><h2>'+esc(raw.push_name||'Jogador')+'</h2>'+
    '<p class="muted">Dados carregados diretamente do mesmo Neon usado pelo Alpha Bot.</p>'+
    '<div class="home-hp"><div><span>❤️ HP</span><strong>'+num(hp)+'/'+num(hpMax)+'</strong></div><div class="progress"><span style="width:'+pct(hp/hpMax*100)+'%"></span></div></div>'+
    '<div class="home-exp"><div><span>⭐ EXP</span><strong>'+num(raw.exp||0)+'/'+num(Math.max(1,Number(raw.level||1)*100))+'</strong></div><div class="progress exp-progress"><span style="width:'+pct(Number(raw.exp||0)/Math.max(1,Number(raw.level||1)*100)*100)+'%"></span></div></div>'+
    '<div class="hero-actions"><button class="btn heal" data-player-heal '+(hp>=hpMax?'disabled':'')+'>'+(hp>=hpMax?'❤️ HP cheio':'❤️ Curar')+'</button><button class="btn primary" data-action="daily" '+(dailyDone?'disabled':'')+'>'+dailyText+'</button><button class="btn good" data-action="all">⚡ Rotina completa</button><button class="btn" data-action="work" '+(workRemain>0?'disabled':'')+' '+(workExpires?'data-work-cooldown="'+workExpires+'"':'')+'>'+workText+'</button><button class="btn" data-resync>↻ Sincronizar</button></div>'+
    '<div class="home-action-status"><span>🎁 Bônus diário: <strong>'+(dailyDone?'feito hoje':'disponível')+'</strong> • sequência '+num(dailyStreak)+'</span><span>💼 Trabalho: <strong>'+(workRemain>0?'recarga '+esc(formatRemaining(workRemain)):'disponível')+'</strong></span></div></div>'+
    '<div class="hero-side"><div><small>CARTEIRA</small><strong>'+money(raw.cash)+'</strong></div><div><small>BANCO</small><strong>'+money(raw.bank)+'</strong></div><div><small>ARMA</small><strong>'+esc(p.weapon_name||'Nenhuma')+' Lv.'+num(p.weapon_level||1)+'</strong></div><div><small>ARMADURA</small><strong>'+esc(p.armor_name||'Nenhuma')+' Lv.'+num(p.armor_level||1)+'</strong></div></div>'+
  '</div>'+
  resultPanel()+
  '<div class="grid stats">'+
    statCard('NÍVEL',num(raw.level),'EXP '+num(raw.exp))+
    statCard('ATK',num(p.effective_atk||p.atk),'Base '+num(p.base_atk||p.atk))+
    statCard('DEF',num(p.effective_def||p.def),'Base '+num(p.base_def||p.def))+
    statCard('CRÍTICO',Math.round(Number(p.effective_crit||0)*100)+'%','VEL '+num(p.effective_spd||p.spd))+
  '</div>'+
  '<div class="section grid two">'+
    '<div class="card"><div class="section-title"><h3>Missões diárias</h3><small>'+missions.length+' missões</small></div>'+renderMissionList(missions)+'</div>'+
    '<div class="card"><div class="section-title"><h3>Estado compartilhado</h3><small>Neon</small></div>'+
      '<div class="list">'+
        '<div class="list-row"><span>Grupo</span><small>'+(group?'Vinculado':'Use !web no grupo')+'</small></div>'+
        '<div class="list-row"><span>Pets na coleção</span><strong>'+collection().length+'</strong></div>'+
        '<div class="list-row"><span>Itens diferentes</span><strong>'+((ui.data.inventory||[]).length)+'</strong></div>'+
        '<div class="list-row"><span>Dormindo</span><strong>'+(activities.sleep?'SIM':'NÃO')+'</strong></div>'+
        '<div class="list-row"><span>Carpinando</span><strong>'+(activities.carpinar?'SIM':'NÃO')+'</strong></div>'+
      '</div>'+
    '</div>'+
  '</div>'+
  '<div class="section grid two">'+
    '<div class="card"><div class="section-title"><h3>Ao vivo no grupo</h3><small>Mesmo estado do WhatsApp</small></div>'+renderLiveGroupState(group)+'</div>'+
    '<div class="card"><div class="section-title"><h3>Cooldowns ativos</h3><small>Servidor</small></div>'+renderCooldowns()+'</div>'+
  '</div>'+
  '<div class="section card"><div class="section-title"><h3>Últimas movimentações</h3><small>WhatsApp + Web</small></div>'+renderTransactions(8)+'</div>';
}

function renderMissionList(missions){
  if(!missions.length) return '<div class="empty">Nenhuma missão diária carregada.</div>';
  return '<div class="list">'+missions.map(m=>{
    const done=Number(m.progress||0)>=Number(m.target||1);
    return '<div class="list-row"><div><strong>'+esc(m.title)+'</strong><small>'+num(m.progress)+'/'+num(m.target)+'</small></div><span class="tag '+(done?'good':'')+'">'+(m.claimed?'RESGATADA':done?'PRONTA':'ATIVA')+'</span></div>';
  }).join('')+'</div>';
}

function specialtyText(p){
  const s=p&&p.specialty;
  if(!s) return '';
  const stats=s.stats || (s.stat?{[s.stat]:s.base}:{});
  const labels={damage:'dano',bossDamage:'Boss',defense:'defesa',crit:'crítico',dodge:'esquiva',speed:'VEL',xp:'XP',drop:'itens raros'};
  const parts=Object.entries(stats).filter(x=>Number(x[1])>0).map(x=>{
    return '+'+x[1]+(x[0]==='speed'?' ':'% ')+(labels[x[0]]||x[0]);
  });
  if(Number(s.healPct||0)>0) parts.push('cura '+s.healPct+'% / '+s.healCooldown+' rodadas');
  return parts.join(' • ');
}

function petPortrait(species){
  return '<div class="pet-portrait">'+petVisualMarkup(species,'pet-official-art')+'</div>';
}
function ownedPetCard(p){
  const cat=catalogPets().find(x=>x.species===p.species);
  const active=Boolean(p.active);
  const hp=Number(p.hp||0), maxHp=Math.max(1,Number(p.max_hp||1));
  const healButton=hp<maxHp
    ? '<button class="btn heal" data-pet-card-heal="'+p.id+'">❤️ Curar</button>'
    : '<button class="btn" disabled>❤️ HP cheio</button>';
  return '<div class="card pet-card owned">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag '+(active?'good':'')+'">'+(active?'ATIVO':'COLEÇÃO')+'</span><span class="tag">'+esc(cat&&cat.style||'Pet')+'</span></div>'+
    '<h3>'+esc(p.name||cat&&cat.label||titleCase(p.species))+'</h3>'+
    '<p>'+esc(petSpeciesName(p.species))+' • Lv.'+num(p.level)+' • XP '+num(p.xp)+' • Poder '+num(p.power)+'</p>'+
    '<div class="pet-vitals"><div><span>❤️ HP</span><strong>'+num(hp)+'/'+num(maxHp)+'</strong><div class="progress"><span style="width:'+pct(hp/maxHp*100)+'%"></span></div></div>'+
    '<div><span>⚡ Energia</span><strong>'+num(p.energy)+'/'+num(p.max_energy||100)+'</strong><div class="progress"><span style="width:'+pct(Number(p.energy||0)/Math.max(1,Number(p.max_energy||100))*100)+'%"></span></div></div></div>'+
    '<div class="pet-needs"><span>🍗 '+num(p.hunger)+'/100</span><span>🧼 '+num(p.hygiene)+'/100</span></div>'+
    '<p>'+esc(specialtyText(cat))+'</p>'+
    '<div class="pet-actions">'+
      healButton+
      (!active?'<button class="btn good" data-pet-select="'+p.id+'">Usar pet</button>':'')+
      '<div class="pet-rename-inline"><input data-pet-name="'+p.id+'" maxlength="24" value="'+esc(p.name||'')+'" placeholder="Nome do pet"><button class="btn" type="button" data-pet-rename="'+p.id+'">✏️ Renomear • R$ 1.000</button></div>'+
      (active?'<button class="btn good" data-pet-action="descansar">Descansar</button><button class="btn" data-pet-action="alimentar">Alimentar</button><button class="btn" data-pet-action="banho">Banho</button><button class="btn" data-pet-action="passear">Passear</button><button class="btn" data-pet-action="treinar">Treinar</button>':'')+
      '<button class="btn" data-pet-id="'+p.id+'">ID '+p.id+'</button>'+
    '</div>'+
  '</div>';
}
function catalogPetCard(p){
  const owned=collection().some(x=>x.species===p.species);
  const level=Number(profile().level||ui.data.profile&&ui.data.profile.level||1);
  const special=p.source==='raid';
  const cost=special?Number(p.summonCost||100):Number(p.price||0);
  const materialQty=special?itemCount(p.materialId):0;
  const can=special ? materialQty>=cost : level>=Number(p.level||1);
  return '<div class="card catalog-card">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag '+(special?'legendary':'')+'">'+(special?'RAID / INVOCAÇÃO':'ADOTÁVEL')+'</span><span class="tag">'+esc(p.style||'')+'</span>'+(owned?'<span class="tag good">NA COLEÇÃO</span>':'')+'</div>'+
    '<h3>'+esc(p.label||p.name||titleCase(p.species))+'</h3>'+
    '<p>'+esc(specialtyText(p))+'</p>'+
    (special?'<p>Raid Lv.'+num(p.raidLevel)+' • Chance '+num(p.chance)+'% • '+esc(p.materialName)+' '+materialQty+'/'+cost+'</p>':'<p>Nível mínimo '+num(p.level)+' • '+money(p.price)+'</p>')+
    '<div class="pet-actions">'+(special
      ? '<button class="btn '+(can?'primary':'')+'" '+(can?'':'disabled')+' data-pet-summon="'+esc(p.materialId)+'">Invocar</button>'
      : (can
        ? '<div class="pet-adopt-inline"><input data-pet-adopt-name="'+esc(p.species)+'" maxlength="24" value="'+esc(String(p.label||titleCase(p.species)).replace(/^[^\p{L}\p{N}]+/u,'').trim()||'Alpha')+'" placeholder="Nome do pet"><button class="btn primary" type="button" data-pet-adopt-direct="'+esc(p.species)+'">🐾 Adotar • '+money(p.price)+'</button></div>'
        : '<button class="btn" disabled>Nível '+num(p.level)+' necessário</button>'))+
    '</div>'+
  '</div>';
}

function petAdoptModal(){
  const species=String(ui.petAdoptSpecies||'');
  if(!species) return '';
  const p=catalogPets().find(x=>x.species===species&&x.source==='adoption');
  if(!p) return '';
  const suggested=String(p.label||titleCase(p.species)).replace(/^[^\p{L}\p{N}]+/u,'').trim();
  return '<div class="pet-adopt-overlay" data-pet-adopt-close>'+
    '<div class="pet-adopt-modal" role="dialog" aria-modal="true" aria-label="Adotar pet" onclick="event.stopPropagation()">'+
      '<button class="pet-adopt-x" data-pet-adopt-close type="button">×</button>'+
      '<div class="pet-adopt-preview">'+petPortrait(p.species)+'</div>'+
      '<div class="tag-row"><span class="tag good">ADOÇÃO</span><span class="tag">'+esc(p.style||'Pet')+'</span></div>'+
      '<h2>'+esc(p.label||titleCase(p.species))+'</h2>'+
      '<p>'+esc(specialtyText(p))+'</p>'+
      '<div class="pet-adopt-cost"><span>Nível mínimo <strong>'+num(p.level)+'</strong></span><span>Custo <strong>'+money(p.price)+'</strong></span></div>'+
      '<label>Nome do pet</label>'+
      '<input data-pet-adopt-modal-name maxlength="24" value="'+esc(suggested||'Alpha')+'" placeholder="Digite o nome do pet">'+
      '<div class="pet-adopt-actions"><button class="btn" data-pet-adopt-close type="button">Cancelar</button><button class="btn primary" data-pet-adopt-confirm="'+esc(p.species)+'" type="button">🐾 Confirmar adoção</button></div>'+
    '</div>'+
  '</div>';
}

function renderCharacter(){
  const selected=selectedCharacter();
  const cp=profile();
  const applied=Boolean(cp.class_applied);
  const currentRule=classRule(selected.id);
  const scrolls=Number(cp.class_scrolls||0);
  const remaining=Number(cp.class_change_remaining||0);
  const reclassNotice=!applied
    ? '<div class="notice good"><strong>Primeira classe grátis.</strong><br>Depois de confirmar, trocar de classe exige 1 Pergaminho de Reclassificação e respeita recarga de 7 dias.</div>'
    : remaining>0
      ? '<div class="notice"><strong>Classe bloqueada temporariamente.</strong><br>Próxima troca em '+esc(formatRemaining(remaining))+' • Pergaminhos: '+num(scrolls)+'</div>'
      : '<div class="notice"><strong>Troca de classe controlada.</strong><br>Custa 1 Pergaminho de Reclassificação • recarga de 7 dias após a troca • Pergaminhos: '+num(scrolls)+'</div>';

  return '<div class="page-head"><div><h2>Seu personagem</h2><p>Cada classe tem uma distribuição própria de HP, ATK, DEF e SPD. Não existem mais bônus negativos nem atributo zerado.</p></div><span class="tag '+(applied?'good':'')+'">'+esc(applied?selected.name+' ativo':'Escolha sua classe')+'</span></div>'+
    reclassNotice+
    '<div class="card class-current"><div class="section-title"><div><h3>Status atual</h3><small>'+(currentRule?esc(currentRule.role):'Sem classe aplicada')+'</small></div><button class="btn heal" data-player-heal '+(Number(cp.effective_hp||cp.hp)>=Number(cp.effective_max_hp||cp.max_hp)?'disabled':'')+'>'+(Number(cp.effective_hp||cp.hp)>=Number(cp.effective_max_hp||cp.max_hp)?'❤️ HP cheio':'❤️ Curar personagem')+'</button></div>'+
      '<div class="stat-strip"><span>❤️ '+num(cp.effective_hp||cp.hp)+'/'+num(cp.effective_max_hp||cp.max_hp)+'</span><span>⚔️ '+num(cp.effective_atk||cp.atk)+'</span><span>🛡️ '+num(cp.effective_def||cp.def)+'</span><span>💨 '+num(cp.effective_spd||cp.spd)+'</span></div>'+
    '</div>'+
    '<div class="character-grid">'+CHARACTER_ART.map(ch=>{
      const rule=classRule(ch.id)||{};
      const active=applied&&ch.id===selected.id;
      const locked=applied&&!active&&(remaining>0||scrolls<1);
      const stats=[
        '❤️ +'+num(rule.hp||0)+' HP',
        '⚔️ +'+num(rule.atk||0)+' ATK',
        '🛡️ +'+num(rule.def||0)+' DEF',
        '💨 +'+num(rule.spd||0)+' SPD'
      ];
      let label='Escolher classe';
      if(active) label='Selecionado';
      else if(applied&&remaining>0) label='Recarga ativa';
      else if(applied&&scrolls<1) label='Precisa de Pergaminho';
      else if(applied) label='Trocar classe';
      return '<div class="card character-card '+(active?'selected':'')+'">'+
        '<div class="character-art">'+artSprite(ch.sprite,'character-official-art',ch.name)+'</div>'+
        '<div class="tag-row"><span class="tag">'+esc(rule.role||ch.role)+'</span>'+(active?'<span class="tag good">ATIVO</span>':'')+'</div>'+
        '<h3>'+esc(ch.name)+'</h3><p>'+esc(rule.description||ch.desc)+'</p>'+
        '<div class="class-bonuses">'+stats.map(x=>'<span>'+x+'</span>').join('')+'</div>'+
        '<button class="btn '+(active?'good':'primary')+'" data-character-select="'+esc(ch.id)+'" '+(active||locked?'disabled':'')+'>'+esc(label)+'</button>'+
      '</div>';
    }).join('')+'</div>';
}
function renderPets(){
  const adoptCount=catalogPets().filter(x=>x.source==='adoption').length;
  const raidCount=catalogPets().filter(x=>x.source==='raid').length;
  const tabs=[['owned','Minha coleção ('+collection().length+')'],['adopt','🐾 Adotar pet ('+adoptCount+')'],['raid','✨ Raid / especiais ('+raidCount+')']];
  let rows=[];
  if(ui.petTab==='owned') rows=collection().map(ownedPetCard);
  else if(ui.petTab==='adopt') rows=catalogPets().filter(x=>x.source==='adoption').map(catalogPetCard);
  else rows=catalogPets().filter(x=>x.source==='raid').map(catalogPetCard);

  const team=ui.data.petTeam||[], synergy=ui.data.petTeamSynergy||null, pets=collection();
  const labels=['','Principal','Suporte','Reserva'];
  const teamPet=slot=>team.find(x=>Number(x.slot)===slot)||null;
  const selectedId=slot=>Number((teamPet(slot)||{}).id||0);
  const optionsFor=slot=>{
    const current=selectedId(slot);
    return '<option value="">'+(slot===1?'Escolha o principal':'Vazio')+'</option>'+
      pets.map(p=>'<option value="'+p.id+'" '+(Number(p.id)===current?'selected':'')+'>'+esc(p.name)+' • '+esc(petSpeciesName(p.species))+' • Lv.'+num(p.level)+'</option>').join('');
  };
  const teamSlot=slot=>{
    const p=teamPet(slot);
    const hp=p?Number(p.hp||0):0;
    const maxHp=p?Math.max(1,Number(p.max_hp||1)):1;
    const status=p
      ? '<div class="team-pet-status"><div class="team-pet-head"><strong>'+esc(p.name||titleCase(p.species))+'</strong><small>Lv.'+num(p.level)+' • '+esc(petSpeciesName(p.species))+'</small></div>'+
        '<div class="team-pet-hp"><span>❤️ '+num(hp)+'/'+num(maxHp)+'</span><div class="progress"><span style="width:'+pct(hp/maxHp*100)+'%"></span></div></div>'+
        (hp<maxHp?'<button class="btn heal" data-team-pet-heal="'+p.id+'">❤️ Curar agora</button>':'<button class="btn" disabled>❤️ HP cheio</button>')+
        '</div>'
      : '<small class="team-empty">Nenhum pet neste slot.</small>';
    return '<div class="team-slot"><span>'+labels[slot]+'</span><select data-team-slot="'+slot+'">'+optionsFor(slot)+'</select>'+status+'</div>';
  };
  const synergyBox=synergy
    ? '<div class="notice good"><strong>'+esc(synergy.label)+'</strong><br>'+esc(synergy.text)+'</div>'
    : '<div class="notice">Monte 3 espécies diferentes do mesmo estilo para ativar uma sinergia de Time Pet.</div>';

  return '<div class="page-head"><div><h2>Pets sincronizados</h2><p>O catálogo, coleção e Time Pet vêm do mesmo servidor do WhatsApp.</p></div><div class="hero-actions"><button class="btn primary" data-pet-tab="adopt">🐾 Adotar novo pet</button><span class="tag good">'+catalogPets().length+' espécies/recompensas</span></div></div>'+
    '<div class="card"><div class="section-title"><div><h3>Time Pet</h3><small>1 Principal • 2 Suporte • 3 Reserva</small></div><button class="btn primary" data-pet-team-save>Salvar time</button></div>'+
      '<div class="grid three">'+[1,2,3].map(teamSlot).join('')+'</div>'+
      '<div class="section">'+synergyBox+'</div>'+
    '</div>'+
    '<div class="tabs section">'+tabs.map(t=>'<button class="tab '+(ui.petTab===t[0]?'active':'')+'" data-pet-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>'+
    '<div class="grid cards">'+(rows.length?rows.join(''):'<div class="empty">Nenhum pet nesta seção.</div>')+'</div>'+
    petAdoptModal();
}

function itemIcon(item){
  const map={weapon:'🗡️',armor:'🛡️',boots:'👢',consumable:'🧪',special:'💠'};
  if(String(item.item_id||item.id||'').includes('chave_raid')) return '🗝️';
  if(String(item.item_id||item.id||'').includes('caixa')) return '🎁';
  return map[item.category]||'📦';
}

function itemSpriteKey(item){
  const id=String(item&&((item.item_id||item.itemId||item.id)||'')||'');
  const name=String(item&&item.name||'');
  const category=String(item&&item.category||'');
  const raw=(id+' '+name+' '+category).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ');

  const exact={
    bota_leve:'fixed-bota-leve',bota_vento:'fixed-bota-vento',
    armadura_couro:'fixed-armadura-couro',armadura_ferro:'fixed-armadura-ferro',
    olho_abissal:'fixed-olho-abissal',nucleo_pedra:'fixed-nucleo-pedra',
    essencia_rei_abissal:'fixed-essencia-abissal',nucleo_titan:'fixed-nucleo-tita',
    pocao_p:'potion-small',pocao_m:'potion-medium',pocao_g:'potion-large',elixir_supremo:'potion-elixir',
    pocao_pet_comum:'pet-potion-small',pocao_pet_rara:'pet-potion-medium',pocao_pet_epica:'pet-potion-large',pocao_pet_suprema:'pet-potion-elixir',
    caixa_sorte:'box-luck',caixa_rara:'box-rare',caixa_epica:'box-epic',
    espada_eclipse:'weapon-eclipse',lamina_abissal:'weapon-abyss',tridente_tempestade:'weapon-trident',
    foice_carmesim:'weapon-scythe',martelo_golem:'weapon-hammer',
    espada_flamas:'weapon-eclipse',katana_sombria:'weapon-abyss',katana_divina:'weapon-abyss',
    sabre_runico:'weapon-trident',machado_guerra:'weapon-hammer',garras_vazio:'weapon-abyss',
    lamina_cacador:'weapon-abyss',espada_guardiao:'weapon-eclipse',
    armadura_dragao:'armor-chaos',armadura_abissal:'armor-abyss',armadura_celestial:'armor-celestial',
    manto_fenix:'armor-chaos',couraca_vulcanica:'armor-chaos',armadura_vazio:'armor-abyss',
    armadura_eclipse:'armor-obsidian',armadura_golem:'armor-titan',armadura_titan:'armor-titan',
    armadura_divina:'armor-celestial',armadura_bastiao:'armor-titan',manto_runico:'armor-leviathan',
    couraca_guardiao:'armor-titan',colete_vital:'armor-leviathan',couraca_predador:'armor-obsidian',
    armadura_colosso:'armor-titan',
    pergaminho_reclassificacao:'special-scroll',
    nucleo_alpha_corrompido:'special-essence',
    fragmento_alpha:'material-alpha',essencia_abissal:'material-abyss',
    cristal_ancestral:'material-ancestral',nucleo_celestial:'material-celestial',
    fragmento_celestial:'material-celestial',

    // Cobertura visual completa para itens que antes dependiam de fallback.
    energetico_pet:'pet-potion-medium',
    espada_madeira:'weapon-eclipse',espada_ferro:'weapon-eclipse',espada_aco:'weapon-eclipse',
    lanca_solar:'weapon-trident',excalibur:'weapon-eclipse',
    armadura_aco:'armor-titan',
    bota_cacador:'fixed-bota-vento',bota_relampago:'fixed-bota-vento',bota_celestial:'fixed-bota-vento',
    escama_vulcanica:'special-essence',
    insignia_eclipse:'special-soul',marca_insone:'special-scroll',
    coroa_madrugada:'armor-celestial'
  };
  if(exact[id]) return exact[id];

  if(raw.includes('chave')&&raw.includes('raid')){
    const lv=Number((raw.match(/\b(10|15|20|25|30|40|50)\b/)||[])[1]||10);
    return 'key-'+lv;
  }
  if(raw.includes('fragmento alpha')) return 'material-alpha';
  if(raw.includes('essencia abiss')) return 'material-abyss';
  if(raw.includes('cristal ancestral')) return 'material-ancestral';
  if(raw.includes('nucleo celestial')) return 'material-celestial';
  if(raw.includes('nucleo alpha')||raw.includes('corrompido')) return 'special-essence';
  if(raw.includes('fragmento celestial')) return 'material-celestial';
  if(raw.includes('nucleo titan')||raw.includes('nucleo do tita')) return 'fixed-nucleo-tita';
  if(raw.includes('nucleo pedra')||raw.includes('nucleo de pedra')) return 'fixed-nucleo-pedra';
  if(raw.includes('escama vulcanica')) return 'special-essence';
  if(raw.includes('olho abissal')) return 'fixed-olho-abissal';
  if(raw.includes('essencia rei abissal')) return 'fixed-essencia-abissal';

  if(category==='weapon'){
    if(raw.includes('espada')&&raw.includes('eclipse')) return 'weapon-eclipse';
    if(raw.includes('lamina')&&raw.includes('abiss')) return 'weapon-abyss';
    if(raw.includes('tridente')) return 'weapon-trident';
    if(raw.includes('foice')) return 'weapon-scythe';
    if(raw.includes('martelo')||raw.includes('machado')) return 'weapon-hammer';
    if(raw.includes('arco')) return 'weapon-bow';
  }

  if(category==='armor'){
    if(raw.includes('samurai')) return 'char-samurai';
    if(raw.includes('cavaleiro')) return 'char-paladin';
    if(raw.includes('dragao')||raw.includes('fenix')||raw.includes('vulcan')) return 'armor-chaos';
    if(raw.includes('abiss')||raw.includes('vazio')) return 'armor-abyss';
    if(raw.includes('celestial')||raw.includes('divina')) return 'armor-celestial';
    if(raw.includes('leviata')||raw.includes('runico')) return 'armor-leviathan';
    if(raw.includes('obsidiana')||raw.includes('eclipse')||raw.includes('predador')) return 'armor-obsidian';
    if(raw.includes('tita')||raw.includes('golem')||raw.includes('colosso')||raw.includes('guardiao')||raw.includes('bastiao')) return 'armor-titan';
  }

  if(raw.includes('invocar pet')||raw.includes('invocacao')||raw.includes('summon')) return 'special-summon';
  if(raw.includes('alma ancestral')) return 'special-soul';
  if(raw.includes('pedra')&&raw.includes('up')) return 'special-up';
  if(raw.includes('pergaminho')) return 'special-scroll';
  if(raw.includes('ticket')&&raw.includes('raid')) return 'special-ticket';
  if(raw.includes('essencia epic')) return 'special-essence';

  // Fallback visual real: nenhum item conhecido deve cair em emoji/texto puro.
  // Quando não houver arte exclusiva, usamos o sprite oficial mais próximo da categoria.
  if(category==='weapon') return raw.includes('arco')?'weapon-bow':raw.includes('martelo')||raw.includes('machado')?'weapon-hammer':'weapon-eclipse';
  if(category==='armor') return 'armor-titan';
  if(category==='boots') return raw.includes('vento')||raw.includes('relamp')||raw.includes('celestial')?'fixed-bota-vento':'fixed-bota-leve';
  if(category==='box') return 'box-luck';
  if(category==='consumable'||category==='potion') return 'potion-small';
  if(category==='pet_potion') return 'pet-potion-small';
  if(category==='material') return raw.includes('abiss')?'material-abyss':raw.includes('celest')?'material-celestial':raw.includes('ancestr')?'material-ancestral':'material-alpha';
  if(category==='special'||category==='raid') return 'special-essence';
  return 'special-essence';
}
function itemFallbackVisual(item){
  const id=String(item&&((item.item_id||item.itemId||item.id)||'')||'').toLowerCase();
  const raw=(id+' '+String(item&&item.name||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const category=String(item&&item.category||'').toLowerCase();
  const exact={
    espada_madeira:['🪵🗡️','Espada de Madeira'],
    espada_ferro:['⚙️🗡️','Espada de Ferro'],
    espada_aco:['⚔️','Espada de Aço'],
    sword_wood:['🪵🗡️','Espada de Madeira'],
    sword_iron:['⚙️🗡️','Espada de Ferro'],
    sword_steel:['⚔️','Espada de Aço'],
    sword_mythril:['✨⚔️','Espada de Mithril'],
    armadura_couro:['🟤🛡️','Armadura de Couro'],
    armadura_ferro:['⚙️🛡️','Armadura de Ferro'],
    armadura_aco:['🔷🛡️','Armadura de Aço'],
    bota_leve:['🥾','Bota Leve'],
    bota_vento:['💨🥾','Bota do Vento'],
    bota_cacador:['🏹🥾','Bota do Caçador'],
    bota_relampago:['⚡🥾','Bota do Relâmpago'],
    bota_celestial:['✨🥾','Bota Celestial'],
    nucleo_pedra:['🪨💎','Núcleo de Pedra'],
    escama_vulcanica:['🔥🧩','Escama Vulcânica'],
    olho_abissal:['👁️🟣','Olho Abissal'],
    nucleo_titan:['🟠💎','Núcleo do Titã'],
    essencia_rei_abissal:['🟣🔥','Essência Abissal'],
    fragmento_celestial:['🔷💎','Fragmento Celestial']
  };
  if(exact[id]) return exact[id];
  if(raw.includes('fragmento')) return ['💎','Fragmento'];
  if(raw.includes('nucleo')) return ['🔶','Núcleo'];
  if(raw.includes('essencia')) return ['🔮','Essência'];
  if(raw.includes('escama')) return ['🔥','Escama'];
  if(category==='weapon') return ['🗡️','Arma'];
  if(category==='armor') return ['🛡️','Armadura'];
  if(category==='boots') return ['🥾','Botas'];
  if(category==='material'||category==='special') return ['💎','Material'];
  if(category==='consumable'||category==='potion') return ['🧪','Consumível'];
  return ['💠','Item'];
}
function itemCroppedSprite(key,className,label){
  const fixed=FIXED_SPRITES[key];
  const b=fixed||OFFICIAL_SPRITES[key];
  if(!b) return '';
  const sheet=fixed?FIXED_ART_SHEET:OFFICIAL_ART_SHEET;
  const sw=fixed?FIXED_ART_W:OFFICIAL_ART_W;
  const sh=fixed?FIXED_ART_H:OFFICIAL_ART_H;
  const x=Number(b[0]),y=Number(b[1]),w=Number(b[2]),h=Number(b[3]);
  const sizeX=(sw/w)*100;
  const sizeY=(sh/h)*100;
  const posX=sw===w?0:(x/(sw-w))*100;
  const posY=sh===h?0:(y/(sh-h))*100;
  return '<div class="item-cropped-art '+esc(className||'')+'" role="img" aria-label="'+esc(label||key)+'" '+
    'style="aspect-ratio:'+w+'/'+h+';background-image:url(\''+esc(sheet)+'\');background-size:'+sizeX+'% '+sizeY+'%;background-position:'+posX+'% '+posY+'%"></div>';
}
function itemArtMarkup(item){
  const key=itemSpriteKey(item);
  if(key) return '<div class="item-art">'+itemCroppedSprite(key,'item-official-art',item&&item.name||'Item')+'</div>';
  const visual=itemFallbackVisual(item);
  return '<div class="item-art item-art-fallback"><span>'+visual[0]+'</span><small>'+esc(visual[1])+'</small></div>';
}

function rarityLabel(value){
  const key=String(value||'common').toLowerCase();
  return ({common:'Comum',uncommon:'Incomum',rare:'Raro',epic:'Épico',legendary:'Lendário',event:'Evento'}[key]||titleCase(key));
}
function categoryLabel(value){
  const key=String(value||'item').toLowerCase();
  return ({weapon:'Arma',armor:'Armadura',boots:'Botas',consumable:'Consumível',special:'Especial',material:'Material',potion:'Poção',pet_potion:'Cura Pet',pet_energy:'Energia Pet',box:'Caixa',raid:'Raid'}[key]||titleCase(key));
}
function itemDisplayName(item){
  const name=String(item&&item.name||'Item');
  const key=name.trim().toLowerCase();
  const map={
    'wooden sword':'Espada de Madeira',
    'iron sword':'Espada de Ferro',
    'steel sword':'Espada de Aço',
    'mythril sword':'Espada de Mithril',
    'steel armor':'Armadura de Aço',
    'bank upgrade':'Melhoria Bancária',
    'premium 7 hari':'Premium 7 dias'
  };
  return map[key]||name;
}
function itemDisplayDescription(item){
  const name=String(item&&item.name||'').trim().toLowerCase();
  const map={
    'wooden sword':'Arma básica. +5 ATK.',
    'iron sword':'Arma reforçada. +15 ATK.',
    'steel sword':'Arma rara. +30 ATK.',
    'mythril sword':'Arma épica de Mithril. +70 ATK.',
    'steel armor':'Armadura de aço.',
    'bank upgrade':'Aumenta o limite do banco em R$ 50.000.',
    'premium 7 hari':'Acesso Premium por 7 dias.'
  };
  return map[name]||String(item&&item.description||'');
}
function inventoryCard(i){
  const id=i.item_id;
  const eq=['weapon','armor','boots'].includes(i.category);
  const petPotion=id.startsWith('pocao_pet_');
  const energy=id==='energetico_pet';
  const box=String(id).includes('caixa_') || id==='lootbox_std';
  const usable=i.category==='consumable' && !box;
  let actions='';
  if(eq) actions='<button class="btn primary" data-item-equip="'+esc(id)+'">Equipar</button><button class="btn" data-item-upgrade="'+esc(id)+'">Upar</button>';
  else if(petPotion) actions='<button class="btn good" data-pet-heal="'+esc(id)+'">Curar pet</button>';
  else if(energy) actions='<button class="btn good" data-pet-energy>Energia pet</button>';
  else if(box) actions='<button class="btn good" data-box-open="'+esc(id)+'">Abrir 1</button><button class="btn" data-box-open-all="'+esc(id)+'" data-box-qty="'+Number(i.quantity||1)+'">Abrir todas</button>';
  else if(usable) actions='<button class="btn good" data-item-use="'+esc(id)+'">Usar</button>';
  if(i.sellable!==false && String(i.rarity)!=='legendary'){
    const qty=Math.max(1,Number(i.quantity||1));
    actions+='<button class="btn" data-item-sell="'+esc(id)+'">Vender 1</button>';
    if(qty>1) actions+='<button class="btn" data-item-sell-all="'+esc(id)+'" data-item-sell-qty="'+qty+'">Vender '+qty+'</button>';
  }
  return '<div class="card item-card '+rarityClass(i.rarity)+'">'+itemArtMarkup(i)+
    '<div class="tag-row"><span class="tag '+esc(i.rarity)+'">'+esc(rarityLabel(i.rarity))+'</span><span class="tag">'+esc(categoryLabel(i.category))+'</span></div>'+
    '<h3>'+esc(itemDisplayName(i))+'</h3><p>x'+num(i.quantity)+(eq?' • Lv.'+num(i.equipment_level||1):'')+'</p><p>'+esc(itemDisplayDescription(i))+'</p>'+
    (i.sellable!==false?'<div class="inventory-value"><span>Venda unitária</span><strong>'+money(i.sell_unit||0)+'</strong></div>':'')+
    (eq&&Number(i.upgrade_refund)>0?'<small class="refund-note">Melhoria devolve '+money(i.upgrade_refund)+' na venda.</small>':'')+
    '<div class="item-actions">'+actions+'</div></div>';
}
function renderInventory(){
  const inv=ui.data.inventory||[];
  return '<div class="page-head"><div><h2>Inventário real</h2><p>Quantidade, raridade e melhorias são lidas do servidor.</p></div><div class="hero-actions"><button class="btn" data-sell-duplicates>💰 Vender repetidos</button><span class="tag">'+inv.length+' tipos</span></div></div>'+
    renderLuckyBoxEvent()+
    '<div class="grid cards">'+(inv.length?inv.map(inventoryCard).join(''):'<div class="empty">Inventário vazio.</div>')+'</div>'+resultPanel();
}

function shopCategoryLabel(cat){
  return ({weapon:'🗡️ Armas',armor:'🛡️ Armaduras',boots:'🥾 Botas',potion:'🧪 Poções',pet_potion:'🐾 Cura Pet',pet_energy:'⚡ Energia Pet',box:'📦 Caixas',raid:'🔑 Raid',material:'🧩 Materiais'}[cat]||('📦 '+titleCase(cat||'outros')));
}
function shopCard(i){
  const eq=i.equipment||{};
  const bonus=[];
  if(Number(eq.attack||eq.atk)>0) bonus.push('+'+num(eq.attack||eq.atk)+' ATK');
  if(Number(eq.defense||eq.def)>0) bonus.push('+'+num(eq.defense||eq.def)+' DEF');
  if(Number(eq.speed||eq.spd)>0) bonus.push('+'+num(eq.speed||eq.spd)+' SPD');
  if(Number(eq.crit)>0) bonus.push('+'+num(Number(eq.crit)<=1?Number(eq.crit)*100:eq.crit)+'% CRIT');
  return '<div class="card item-card '+rarityClass(i.rarity)+'">'+itemArtMarkup(i)+'<div class="tag-row"><span class="tag">'+esc(rarityLabel(i.rarity))+'</span><span class="tag">'+esc(categoryLabel(i.category))+'</span></div><h3>'+esc(itemDisplayName(i))+'</h3><p>'+esc(itemDisplayDescription(i))+'</p>'+
    (bonus.length?'<p class="item-bonus">'+bonus.join(' • ')+'</p>':'')+
    '<strong>'+money(i.price)+'</strong><div class="item-actions"><button class="btn primary" data-shop-buy="'+esc(i.id)+'" data-shop-price="'+Number(i.price||0)+'">Comprar 1</button><button class="btn" data-shop-buy-qty="'+esc(i.id)+'" data-shop-price="'+Number(i.price||0)+'">Comprar quantidade</button></div></div>';
}

function renderShop(){
  const items=(ui.catalog&&ui.catalog.shop)||[];
  const groups=[];
  for(const i of items){
    const key=String(i.category||'outros');
    let g=groups.find(x=>x.key===key);
    if(!g){g={key,items:[]};groups.push(g)}
    g.items.push(i);
  }
  return '<div class="page-head"><div><h2>Loja Alpha</h2><p>Itens, preços e atributos vêm do mesmo catálogo usado pelo bot.</p></div><span class="tag good">'+money(ui.data.profile&&ui.data.profile.cash)+'</span></div>'+
    (groups.length?groups.map(g=>'<div class="section shop-section"><div class="section-title"><h3>'+esc(shopCategoryLabel(g.key))+'</h3><small>'+g.items.length+' item(ns)</small></div><div class="grid cards">'+g.items.map(shopCard).join('')+'</div></div>').join(''):'<div class="empty">Loja sem itens disponíveis.</div>');
}

function raidState(level){
  const group=currentGroup();
  return group&&Array.isArray(group.raids)?group.raids.find(x=>Number(x.level)===Number(level)):null;
}
function renderRaids(){
  const group=currentGroup();
  if(!group) return '<div class="notice warn">Esta sessão foi vinculada no privado. Para compartilhar Raid com o WhatsApp, mande <b>!web</b> no grupo e conecte novamente.</div>';
  const raids=(ui.catalog&&ui.catalog.raids)||[];
  return '<div class="page-head"><div><h2>Raids do grupo</h2><p>As salas abaixo são as mesmas gravadas em trevo_games pelo WhatsApp.</p></div><span class="tag good">GRUPO VINCULADO</span></div>'+
    '<div class="grid cards">'+raids.map(r=>{
      const s=raidState(r.level);
      const hp=s?Number(s.hp||0):Number(r.hp||0), max=s?Number(s.maxHp||s.max_hp||r.hp):Number(r.hp||1);
      let buttons='';
      const players=Object.values((s&&s.players)||{});
      const meJoined=players.some(p=>p&&p.jid===ui.data.identity.jid);
      const isHost=Boolean(s&&s.host===ui.data.identity.jid);
      if(!s) buttons='<button class="btn primary" data-raid-create="'+r.level+'">Abrir Raid</button>';
      else if(s.status==='lobby'){
        buttons=(meJoined?'':'<button class="btn primary" data-raid-join="'+r.level+'">Entrar</button>')+
          (isHost?'<button class="btn good" data-raid-start="'+r.level+'">Iniciar</button><button class="btn danger" data-raid-cancel="'+r.level+'">Cancelar</button>':'');
      }else if(s.status==='active'){
        buttons=(meJoined?'':'<button class="btn primary" data-raid-join="'+r.level+'">Entrar agora</button>')+
          '<button class="btn good" data-raid-auto="'+r.level+'">⚡ AUTO SERVIDOR</button><button class="btn" data-raid-round="'+r.level+'">Rodada manual</button>';
      }
      const ranked=players.slice().sort((a,z)=>Number(z.damage||0)-Number(a.damage||0));
      const totalDamage=ranked.reduce((sum,p)=>sum+Number(p.damage||0),0);
      const party=ranked.length?'<div class="raid-party"><div class="section-title"><h4>Equipe / dano</h4><small>'+num(totalDamage)+' total</small></div><div class="list compact">'+ranked.map((p,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(p.name||'Jogador')+'</strong><small>'+(p.alive===false?'💀 CAÍDO':'❤️ '+num(p.hp||0)+' HP')+(p.pet&&p.pet.name?' • 🐾 '+esc(p.pet.name):'')+'</small></div><strong>'+num(p.damage||0)+'</strong></div>').join('')+'</div></div>':'<div class="empty">Sem participantes.</div>';
      const timeLeft=s&&Number(s.expiresAt||0)>Date.now()?Math.ceil((Number(s.expiresAt)-Date.now())/60000):null;
      return '<div class="card raid-card"><div class="tag-row"><span class="tag">LV.'+r.level+'</span><span class="tag '+(s?'good':'')+'">'+(s?esc(raidStatusLabel(s.status)).toUpperCase():'DISPONÍVEL')+'</span><span class="tag">'+players.length+'/5</span>'+(timeLeft!=null?'<span class="tag">⏳ '+timeLeft+' min</span>':'')+'</div><h3>'+esc(r.name)+'</h3>'+raidArenaMarkup(r,s)+'<p>❤️ '+num(hp)+'/'+num(max)+' • ATK '+num(r.atk)+' • '+num(r.durationMinutes)+' min</p><div class="progress raid-progress"><span style="width:'+pct(hp/max*100)+'%"></span></div><p>🔑 '+money(r.keyPrice)+'</p>'+party+'<div class="raid-actions">'+buttons+'</div></div>';
    }).join('')+'</div>';
}

function activeBoss(){
  const g=currentGroup();
  if(!g) return null;
  if(g.bossEvent && Number(g.bossEvent.hp)>0 && g.bossEvent.active!==false) return Object.assign({event:true},g.bossEvent);
  if(g.boss && Number(g.boss.hp)>0) return g.boss;
  return null;
}
function renderBoss(){
  const g=currentGroup();
  if(!g) return '<div class="notice warn">Vincule pelo <b>!web</b> dentro do grupo para usar o Boss compartilhado.</div>';
  const b=activeBoss();
  if(!b) return '<div class="page-head"><div><h2>Boss do grupo</h2><p>Nenhum Boss ativo neste momento.</p></div></div><div class="card boss-idle-card"><div class="boss-idle-art">'+artSprite('boss-common','boss-showcase-art','Boss comum')+'</div><button class="btn primary" data-boss-start>Iniciar Boss</button></div>';
  const hp=Number(b.hp||0), max=Number(b.maxHp||1);
  const participants=Object.values(b.participants||{}).sort((a,z)=>Number(z.damage||0)-Number(a.damage||0));
  const totalDamage=participants.reduce((s,p)=>s+Number(p.damage||0),0);
  const ranking=participants.length?'<div class="boss-ranking"><div class="section-title"><h3>Ranking de dano</h3><small>'+participants.length+' participante(s)</small></div><div class="list">'+participants.slice(0,10).map((p,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(p.name||'Jogador')+'</strong><small>'+num(p.attacks||0)+' ataques'+(p.petHealing?' • 🧪 '+num(p.petHealing)+' cura pet':'')+'</small></div><strong>'+num(p.damage||0)+' dano</strong></div>').join('')+'</div></div>':'<div class="empty section">Ainda não houve ataques neste Boss.</div>';
  return '<div class="page-head"><div><h2>'+esc(b.name||'Boss')+'</h2><p>'+esc(bossModeLabel(b.mode||'common'))+' • mesma sessão do WhatsApp</p></div><span class="tag good">ATIVO</span></div>'+
    '<div class="card">'+combatArenaMarkup(b.name||'Boss','boss',null,b.mode)+
    '<div class="boss-hp-line"><span>HP do Boss</span><strong>'+num(hp)+'/'+num(max)+'</strong></div><div class="progress boss-progress"><span style="width:'+pct(hp/max*100)+'%"></span></div>'+
    '<div class="grid stats section">'+statCard('DANO TOTAL',num(totalDamage),'grupo')+statCard('PARTICIPANTES',num(participants.length),'jogadores')+'</div>'+
    '<div class="hero-actions"><button class="btn primary" data-boss-attack>⚔️ Atacar</button><button class="btn good" data-boss-auto>'+(ui.bossTimer?'⏸ AUTO ON':'▶ AUTO OFF')+'</button></div>'+ranking+'</div>';
}


function roster(){
  return (currentGroup()&&currentGroup().roster)||[];
}
function resultMetric(label,value,kind='text'){
  const shown=kind==='money'?money(value):kind==='num'?num(value):esc(value);
  return '<div class="result-metric"><small>'+esc(label)+'</small><strong>'+shown+'</strong></div>';
}
function prettyResult(value){
  if(value==null) return '<div class="empty">Sem detalhes adicionais.</div>';
  if(typeof value!=='object') return '<div class="result-message">'+esc(value)+'</div>';
  if(value.ok===false&&Number(value.remaining)>0){
    return '<div class="result-message cooldown-result">⏳ Ação em recarga. Tente novamente em <strong>'+esc(formatRemaining(value.remaining))+'</strong>.</div>';
  }
  if(value.cooldown&&Number(value.remainingMs)>0){
    return '<div class="result-message cooldown-result">⏳ Combate em recarga. Aguarde <strong>'+esc(formatRemaining(Number(value.remainingMs)/1000))+'</strong>.</div>';
  }
  if(value.petName&&value.healed!=null&&value.hp!=null&&value.maxHp!=null){
    return '<div class="result-message heal-result">❤️ <strong>'+esc(value.petName)+'</strong> recuperou <strong>'+num(value.healed)+' HP</strong>.</div>'+
      '<div class="result-metrics section">'+
        resultMetric('HP atual',num(value.hp)+'/'+num(value.maxHp))+
        resultMetric('Poção',value.name||'Poção de pet')+
        resultMetric('Restantes',num(value.remaining||0),'num')+
      '</div>';
  }
  if(value.healed!=null&&value.hp!=null&&value.maxHp!=null&&value.name&&!value.petName){
    return '<div class="result-message heal-result">❤️ Você recuperou <strong>'+num(value.healed)+' HP</strong>.</div>'+
      '<div class="result-metrics section">'+
        resultMetric('HP atual',num(value.hp)+'/'+num(value.maxHp))+
        resultMetric('Poção',value.name||'Poção')+
        resultMetric('Restantes',num(value.remaining||0),'num')+
      '</div>';
  }
  const metrics=[];
  const moneyKeys=[['totalCash','Recebido'],['bonusCash','Bônus'],['amount','Valor'],['cash','Dinheiro'],['reward','Recompensa'],['payout','Pagamento'],['profit','Lucro'],['fee','Taxa'],['tax','TAXADE'],['gross','Bruto'],['netTotal','Líquido'],['grossTotal','Bruto total'],['taxTotal','TAXADE total'],['pot','Prêmio']];
  for(const [key,label] of moneyKeys) if(value[key]!=null && Number.isFinite(Number(value[key]))) metrics.push(resultMetric(label,value[key],'money'));
  const numKeys=[['streak','Sequência'],['exp','EXP'],['xp','XP'],['xpGain','XP carreira'],['damage','Dano'],['bossDamage','Dano recebido'],['attempts','Tentativas'],['level','Nível'],['totalShifts','Turnos']];
  for(const [key,label] of numKeys) if(value[key]!=null && (typeof value[key]==='number'||typeof value[key]==='string')) metrics.push(resultMetric(label,value[key],'num'));
  if(value.won===true) metrics.push(resultMetric('Resultado','🏆 Vitória'));
  else if(value.won===false && value.lost===true) metrics.push(resultMetric('Resultado','💀 Derrota'));
  else if(value.correct===true) metrics.push(resultMetric('Resultado','✅ Correto'));
  else if(value.correct===false) metrics.push(resultMetric('Resultado','❌ Incorreto'));
  if(value.result && typeof value.result!=='object') metrics.push(resultMetric('Resultado',titleCase(value.result)));
  if(value.monster) metrics.push(resultMetric('Inimigo',value.monster));
  if(value.rank) metrics.push(resultMetric('Cargo',typeof value.rank==='object'?(value.rank.name||'Novo cargo'):value.rank));
  let details='';
  if(Array.isArray(value.rewards)&&value.rewards.length){
    details+='<div class="result-rewards"><h4>🎁 Recompensas</h4>'+value.rewards.map(r=>'<div class="reward-chip">'+esc(r.name||r.itemId||r.id||'Item')+(r.qty?' ×'+num(r.qty):'')+'</div>').join('')+'</div>';
  }
  if(Array.isArray(value.results)&&value.results.length){
    details+='<div class="result-rewards"><h4>📋 Detalhes</h4>'+value.results.map(r=>'<div class="reward-chip">'+esc(r.label||r.name||r.result||'Ação')+(r.amount!=null?' • '+money(r.amount):'')+(r.cooldown&&Number(r.remaining)>0?' • ⏳ '+esc(formatRemaining(r.remaining)):'')+(r.error?' • '+esc(r.error):'')+'</div>').join('')+'</div>';
  }
  const combat=renderCombatResult(value);
  if(combat) return combat+(metrics.length?'<div class="result-metrics section">'+metrics.join('')+'</div>':'')+details;
  if(metrics.length||details) return (metrics.length?'<div class="result-metrics">'+metrics.join('')+'</div>':'')+details;
  let raw; try{raw=JSON.stringify(value,null,2)}catch{raw=String(value)}
  return '<pre class="result-box">'+esc(raw)+'</pre>';
}
function renderCombatResult(value){
  if(!value||typeof value!=='object') return '';
  if(Array.isArray(value.log)&&value.winner&&value.loser){
    const crits=value.log.filter(x=>x&&x.crit).length;
    const total=value.log.reduce((s,x)=>s+Number(x&&x.dmg||0),0);
    const recent=value.log.slice(-8);
    return '<div class="combat-result">'+
      '<div class="combat-result-head"><div><small>VENCEDOR</small><strong>🏆 '+esc(value.winner.name||'Jogador')+'</strong></div><div><small>RECOMPENSA</small><strong>'+money(value.reward||0)+'</strong></div></div>'+
      '<div class="result-metrics">'+resultMetric('Golpes',value.log.length,'num')+resultMetric('Críticos',crits,'num')+resultMetric('Dano total',total,'num')+'</div>'+
      '<div class="combat-log">'+recent.map(x=>'<div class="combat-hit '+(x.crit?'critical':'')+'"><span>'+esc(x.from||'Jogador')+' → '+esc(x.to||'Alvo')+'</span><strong>'+(x.crit?'💥 CRÍTICO ':'')+num(x.dmg)+' dano</strong></div>').join('')+'</div>'+
    '</div>';
  }
  if(value.winner&&value.loser&&value.rounds!=null&&value.winner.species){
    return '<div class="combat-result"><div class="combat-result-head"><div><small>VENCEDOR PET</small><strong>🐾 '+esc(value.winner.name||value.winner.species)+'</strong></div><div><small>RODADAS</small><strong>'+num(value.rounds)+'</strong></div></div>'+
      '<div class="result-metrics">'+resultMetric('Vencedor','Lv.'+num(value.winner.level))+resultMetric('HP restante',num(value.winner.hp)+'/'+num(value.winner.max_hp))+'</div></div>';
  }
  return '';
}

function resultPanel(){
  if(ui.lastResult==null) return '';
  return '<div class="section card result-card"><div class="result-scene">'+artSprite('bg-result','result-scene-art','Tela de resultado')+'</div><div class="section-title"><h3>Resultado</h3><button class="text-btn" data-clear-result>Limpar</button></div>'+prettyResult(ui.lastResult)+'</div>';
}

function characterForClass(id){
  return CHARACTER_ART.find(x=>x.id===String(id||''))||CHARACTER_ART[0];
}

function renderDuelArena(members){
  if(!members.length) return '<div class="card duel-arena-card"><div class="empty">Nenhum adversário recente disponível para duelo.</div></div>';
  const target=members.find(x=>x.jid===ui.duelTarget)||members[0];
  ui.duelTarget=target.jid;
  const me=(ui.data&&ui.data.profile)||{};
  const myCombat=profile();
  const mine=selectedCharacter();
  const enemy=characterForClass(target.class_id);
  const myHp=Number(myCombat.effective_hp||myCombat.hp||0),myMax=Math.max(1,Number(myCombat.effective_max_hp||myCombat.max_hp||1));
  const enemyHp=Number(target.effective_hp??target.hp??0),enemyMax=Math.max(1,Number(target.effective_max_hp??target.max_hp??1));
  const last=ui.lastResult&&ui.lastResult.targetJid===target.jid?ui.lastResult:null;
  const duelSummary=last&&last.winner&&last.loser
    ? '<div class="duel-last-result '+(String(last.winner.jid)===String((ui.data.identity||{}).jid)?'win':'loss')+'"><strong>'+(String(last.winner.jid)===String((ui.data.identity||{}).jid)?'🏆 VITÓRIA':'💀 DERROTA')+'</strong><span>Vencedor: '+esc(last.winner.name||'Jogador')+(Number(last.reward||0)>0?' • '+money(last.reward):'')+'</span></div>'
    : '<div class="duel-last-result"><span>Escolha o adversário e inicie o confronto.</span></div>';

  return '<div class="card duel-arena-card">'+
    '<div class="section-title"><div><h3>⚔️ Arena de Duelo</h3><small>Confronto real usando ATK, DEF, SPD, crítico, equipamentos e bônus atuais.</small></div><span class="tag good">PVP</span></div>'+
    '<div class="duel-picker"><label>Adversário</label><select data-duel-target>'+members.map(m=>'<option value="'+esc(m.jid)+'" '+(m.jid===target.jid?'selected':'')+'>'+esc(m.push_name||'Jogador')+' • Lv.'+num(m.level||1)+'</option>').join('')+'</select></div>'+
    '<div class="duel-stage-live">'+
      '<div class="duel-fighter me">'+
        '<div class="duel-character-art">'+artSprite(mine.sprite,'duel-character-svg',mine.name)+'</div>'+
        '<strong>'+esc(me.push_name||'Você')+'</strong><small>'+esc(mine.name)+' • Lv.'+num(me.level||1)+'</small>'+
        '<div class="duel-hp"><span>❤️ '+num(myHp)+'/'+num(myMax)+'</span><div class="progress"><span style="width:'+pct(myHp/myMax*100)+'%"></span></div></div>'+
        '<div class="duel-stats"><span>⚔️ '+num(myCombat.effective_atk||myCombat.atk)+'</span><span>🛡️ '+num(myCombat.effective_def||myCombat.def)+'</span><span>💨 '+num(myCombat.effective_spd||myCombat.spd)+'</span></div>'+
      '</div>'+
      '<div class="duel-versus">VS</div>'+
      '<div class="duel-fighter enemy">'+
        '<div class="duel-character-art">'+artSprite(enemy.sprite,'duel-character-svg',enemy.name)+'</div>'+
        '<strong>'+esc(target.push_name||'Jogador')+'</strong><small>'+esc(enemy.name)+' • Lv.'+num(target.level||1)+'</small>'+
        '<div class="duel-hp"><span>❤️ '+num(enemyHp)+'/'+num(enemyMax)+'</span><div class="progress"><span style="width:'+pct(enemyHp/enemyMax*100)+'%"></span></div></div>'+
        '<div class="duel-stats"><span>⚔️ '+num(target.effective_atk??target.atk??0)+'</span><span>🛡️ '+num(target.effective_def??target.def??0)+'</span><span>💨 '+num(target.effective_spd??target.spd??0)+'</span></div>'+
      '</div>'+
    '</div>'+
    duelSummary+
    '<div class="hero-actions duel-actions"><button class="btn primary" data-duel-launch="'+esc(target.jid)+'">⚔️ DUELAR AGORA</button><button class="btn" data-duel-pet-launch="'+esc(target.jid)+'">🐾 DUELO DE PETS</button></div>'+
  '</div>';
}

function renderDuels(){
  if(!currentGroup()) return '<div class="notice warn">Conecte usando <b>!web</b> dentro do grupo para liberar os duelos reais.</div>';
  const members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  return '<div class="page-head"><div><h2>Arena de Duelos</h2><p>Escolha um jogador do grupo e veja os dois personagens antes do confronto. O resultado usa os atributos reais do Alpha Bot.</p></div><span class="tag good">PVP REAL</span></div>'+
    renderDuelArena(members)+
    (ui.lastResult?resultPanel():'')+
    '<div class="section"><div class="section-title"><h3>Adversários disponíveis</h3><small>'+members.length+' jogador(es)</small></div><div class="grid three">'+
      (members.length?members.map(m=>'<div class="card social-card"><div class="tag-row"><span class="tag">'+esc(characterForClass(m.class_id).name)+'</span><span class="tag">Lv.'+num(m.level||1)+'</span></div><h3>'+esc(m.push_name||'Jogador')+'</h3><p>❤️ '+num(m.effective_hp??m.hp??0)+'/'+num(m.effective_max_hp??m.max_hp??0)+' • ⚔️ '+num(m.effective_atk??m.atk??0)+' • 🛡️ '+num(m.effective_def??m.def??0)+'</p><button class="btn primary" data-duel-select-only="'+esc(m.jid)+'">Selecionar adversário</button></div>').join(''):'<div class="empty">Nenhum adversário recente disponível.</div>')+
    '</div></div>';
}

function memberCard(m){
  return '<div class="card social-card"><div class="tag-row"><span class="tag">'+esc(characterForClass(m.class_id).name)+'</span><span class="tag">Lv.'+num(m.level||1)+'</span></div><h3>'+esc(m.push_name||'Jogador')+'</h3><p>'+num(m.messages||0)+' msgs • '+num(m.commands||0)+' comandos/7d</p>'+
    '<div class="pet-actions"><button class="btn primary" data-battle="'+esc(m.jid)+'">⚔️ Duelo</button><button class="btn" data-petduel="'+esc(m.jid)+'">🐾 Duelo Pet</button><button class="btn" data-coin-duel="'+esc(m.jid)+'">🪙 Cara/Coroa</button><button class="btn" data-rps-duel="'+esc(m.jid)+'">✊ PPT</button><button class="btn danger" data-rob="'+esc(m.jid)+'">🥷 Roubar</button><button class="btn good" data-transfer="'+esc(m.jid)+'">💸 PIX</button><button class="btn" data-loan-offer="'+esc(m.jid)+'">💳 Emprestar</button><button class="btn" data-relationship-propose="'+esc(m.jid)+'">💍 Casar</button><button class="btn good" data-relationship-accept-member="'+esc(m.jid)+'">✓ Aceitar pedido</button></div></div>';
}
function renderSocial(){
  const members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  const rel=ui.data.relationship;
  if(!currentGroup()) return '<div class="notice warn">Conecte usando <b>!web</b> dentro do grupo para liberar interações com outros jogadores.</div>';
  const games=currentGroup().games||{}, me=ui.data.identity.jid;
  const coinPending=games['coin_duel:'+me]||null, rpsPending=games['rps_duel:'+me]||null;
  const pending=(coinPending||rpsPending)?'<div class="section card"><div class="section-title"><h3>Desafios pendentes</h3><small>Mesma sessão do grupo</small></div><div class="hero-actions">'+
    (coinPending?'<button class="btn good" data-coin-duel-accept>🪙 Aceitar Cara/Coroa • '+money(coinPending.amount)+'</button>':'')+
    (rpsPending?'<button class="btn good" data-rps-duel-accept>✊ Aceitar PPT • '+money(rpsPending.amount)+'</button>':'')+
    '</div></div>':'';
  return '<div class="page-head"><div><h2>Social</h2><p>Roubo, PIX, empréstimo, relacionamento, apostas PvP e atalhos para duelo usam os jogadores reais do grupo.</p></div><div class="hero-actions"><button class="btn primary" data-go-page="duels">⚔️ Abrir Arena de Duelos</button><span class="tag">'+members.length+' jogadores recentes</span></div></div>'+
    pending+
    '<div class="section card"><div class="section-title"><h3>Relacionamento</h3><small>Mesmo estado do WhatsApp</small></div>'+renderRelationship(rel)+(rel?'<div class="hero-actions section"><button class="btn danger" data-relationship-divorce>Divorciar</button></div>':'')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Jogadores do grupo</h3><small>Ações sociais e PvP</small></div><div class="grid three">'+(members.length?members.map(memberCard).join(''):'<div class="empty">Nenhum outro jogador ativo nos últimos 7 dias.</div>')+'</div></div>'+resultPanel();
}

function renderMarket(){
  const ex=ui.extras||{}, market=ex.market||[], mine=ui.data.market||[], inv=ui.data.inventory||[];
  const available=inv.filter(i=>Number(i.quantity)>0 && i.sellable!==false);
  return '<div class="page-head"><div><h2>Mercado</h2><p>Os anúncios são os mesmos do comando !mercado e expiram conforme a regra do bot.</p></div><span class="tag">'+market.length+' ativos</span></div>'+
    '<div class="section-title"><h3>Anúncios ativos</h3><small>'+market.length+'</small></div>'+
    '<div class="grid cards">'+(market.length?market.map(x=>'<div class="card item-card"><div class="item-icon">📣</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.seller_name||'Jogador')+' • x'+num(x.quantity)+' • expira em '+Math.ceil(Number(x.remaining_seconds||0)/60)+' min</p><strong>'+money(x.price)+'</strong><div class="item-actions">'+(x.seller_jid===ui.data.identity.jid?'<button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button>':'<button class="btn primary" data-market-buy="'+x.id+'">Comprar</button>')+'</div></div>').join(''):'<div class="empty">Nenhum anúncio ativo.</div>')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Meus anúncios</h3><small>'+mine.length+'</small></div><div class="list">'+(mine.length?mine.map(x=>'<div class="list-row"><span>'+esc(x.name)+' x'+num(x.quantity)+'</span><span>'+money(x.price)+' <button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button></span></div>').join(''):'<div class="empty">Você não tem anúncios ativos.</div>')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Anunciar do inventário</h3><small>'+available.length+' itens disponíveis</small></div>'+
      (available.length?'<div class="market-inventory">'+available.map(i=>'<div class="market-inventory-row"><div><strong>'+esc(i.name)+'</strong><small>x'+num(i.quantity)+(Number(i.price)>0?' • referência '+money(i.price)+' cada':'')+'</small></div><button class="btn primary" data-market-announce="'+esc(i.item_id)+'" data-market-max="'+num(i.quantity)+'" data-market-ref="'+num(i.price||0)+'">Anunciar</button></div>').join('')+'</div>':'<div class="empty">Você não possui itens anunciáveis.</div>')+
    '</div>'+resultPanel();
}

function renderClan(){
  const ex=ui.extras||{}, clan=ex.clan, clans=ex.clans||[], members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  let actions=clan
    ? '<button class="btn good" data-clan-donate>Doar</button><button class="btn danger" data-clan-leave>Sair do clã</button>'
    : '<button class="btn primary" data-clan-create>Criar clã</button><button class="btn good" data-clan-accept>Aceitar convite</button>';
  return '<div class="page-head"><div><h2>Clã</h2><p>Mesma estrutura dos comandos !cla / !criarcla / !claconvidar.</p></div></div>'+
    '<div class="card"><div class="section-title"><h3>'+esc(clan&&clan.name||'Sem clã')+'</h3><small>'+(clan?'Clã sincronizado':'Entre ou crie um clã')+'</small></div>'+renderClanSummary(clan)+'<div class="hero-actions section">'+actions+'</div></div>'+
    (clan?'<div class="section"><div class="section-title"><h3>Convidar / administrar jogadores</h3><small>Ações respeitam sua função no clã</small></div><div class="grid three">'+members.map(m=>'<div class="card"><h3>'+esc(m.push_name)+'</h3><div class="pet-actions"><button class="btn" data-clan-invite="'+esc(m.jid)+'">Convidar</button><button class="btn danger" data-clan-kick="'+esc(m.jid)+'">Expulsar</button><button class="btn" data-clan-transfer="'+esc(m.jid)+'">Promover líder</button></div></div>').join('')+'</div></div>':'')+
    '<div class="section card"><div class="section-title"><h3>Ranking de clãs</h3><small>'+clans.length+' listados</small></div>'+renderClanList(clans)+'</div>'+resultPanel();
}

function gameStatePanel(type,state){
  if(!state) return '<div class="game-state empty">Nenhuma sessão ativa.</div>';
  if(type==='quiz'){
    const opts=Array.isArray(state.a)?state.a:[];
    return '<div class="game-state"><span class="tag '+(state.difficulty==='difícil'?'epic':'')+'">'+esc(state.difficulty||'normal')+'</span><h4>'+esc(state.q||'Quiz ativo')+'</h4>'+
      (opts.length?'<div class="quiz-options">'+opts.map((o,i)=>'<div><b>'+(i+1)+'.</b> '+esc(o)+'</div>').join('')+'</div>':'')+'</div>';
  }
  if(type==='numero') return '<div class="game-state"><strong>🔢 Número entre 1 e 100</strong><small>Tentativas: '+num(state.attempts||0)+'/'+num(state.max||10)+'</small></div>';
  if(type==='forca') return '<div class="game-state"><strong class="hangman-word">'+esc(state.masked||'_ _ _ _')+'</strong><small>Dica: '+esc(state.hint||'—')+' • ❤️ '+num(state.lives||0)+' • Erradas: '+esc((state.wrong||[]).join(', ')||'nenhuma')+'</small></div>';
  if(type==='roulette_group'){
    const players=Object.values(state.players||{});
    return '<div class="game-state"><strong>🎯 Roleta aberta</strong><small>'+num(players.length)+' participante(s) • expira em '+Math.max(0,Math.ceil((Number(state.expiresAt||0)-Date.now())/1000))+'s</small></div>';
  }
  if(type==='tournament'){
    const players=state.players||[];
    return '<div class="game-state"><strong>🏆 Torneio aberto</strong><small>'+num(players.length)+' jogador(es) • entrada '+money(state.amount||0)+'</small></div>';
  }
  return '<div class="game-state"><span class="tag good">ATIVO</span></div>';
}

function renderGames(){
  const games=currentGroup()&&currentGroup().games||{};
  const groupLinked=Boolean(currentGroup());
  return '<div class="page-head"><div><h2>Minigames</h2><p>Resultados e apostas passam pelo mesmo motor do WhatsApp.</p></div><span class="tag '+(groupLinked?'good':'')+'">'+(groupLinked?'GRUPO VINCULADO':'SOLO')+'</span></div>'+
    '<div class="grid three">'+
      '<div class="card game-card"><div class="game-icon">🪙</div><h3>Cara ou Coroa</h3><p>Aposta individual, mesmo saldo real.</p><input class="game-input" data-coin-amount type="number" inputmode="numeric" min="1" value="1000"><div class="choice-row"><button class="btn" data-game-coin-choice="cara">Cara</button><button class="btn" data-game-coin-choice="coroa">Coroa</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">🎰</div><h3>Roleta</h3><p>Aposta individual com escolha.</p><input class="game-input" data-roulette-amount type="number" inputmode="numeric" min="1" value="1000"><div class="choice-row"><button class="btn" data-game-roulette-choice="vermelho">🔴 Vermelho</button><button class="btn" data-game-roulette-choice="preto">⚫ Preto</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">✊</div><h3>Pedra Papel Tesoura</h3><p>Partida rápida contra o sistema.</p><div class="choice-row"><button class="btn" data-game-rps-choice="pedra">✊ Pedra</button><button class="btn" data-game-rps-choice="papel">✋ Papel</button><button class="btn" data-game-rps-choice="tesoura">✌️ Tesoura</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">🏰</div><h3>Masmorra</h3><p>Usa HP, atributos, equipamentos e tempos de recarga reais.</p><button class="btn primary" data-game-dungeon>Entrar</button></div>'+
      '<div class="card game-card"><h3>❓ Quiz do Grupo</h3>'+gameStatePanel('quiz',games.quiz)+'<div class="game-answer"><input class="game-input" data-quiz-input placeholder="Resposta ou número"><button class="btn good" data-quiz-answer>Responder</button></div><button class="btn" data-quiz-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🔢 Número</h3>'+gameStatePanel('numero',games.numero)+'<div class="game-answer"><input class="game-input" data-number-input type="number" inputmode="numeric" min="1" placeholder="Seu número"><button class="btn good" data-number-guess>Chutar</button></div><button class="btn" data-number-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🔤 Forca</h3>'+gameStatePanel('forca',games.forca)+'<div class="game-answer"><input class="game-input" data-hangman-input placeholder="Letra ou palavra"><button class="btn good" data-hangman-send>Enviar</button></div><button class="btn" data-hangman-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🎯 Roleta em Grupo</h3>'+gameStatePanel('roulette_group',games.roulette_group)+'<p class="muted">Criação e entrada continuam disponíveis; formulário avançado será refinado na próxima etapa.</p><div class="pet-actions"><button class="btn" data-group-roulette-create>Criar</button><button class="btn" data-group-roulette-join>Entrar</button><button class="btn good" data-group-roulette-spin>Girar</button></div></div>'+
      '<div class="card game-card"><h3>🏆 Torneio</h3>'+gameStatePanel('tournament',games.tournament)+'<div class="pet-actions"><button class="btn" data-tournament-create>Criar</button><button class="btn" data-tournament-join>Entrar</button><button class="btn good" data-tournament-start>Iniciar</button></div></div>'+
    '</div>'+resultPanel();
}

function renderGroupMissionCard(ex){
  const board=ex.groupMissionLeaderboard||{}, mission=board.mission||ex.groupMission||null, rows=board.rows||[];
  if(!mission) return '<div class="empty">Nenhuma missão coletiva carregada.</div>';
  const target=Math.max(1,Number(mission.target||1)), progress=Number(mission.progress||0);
  return '<div class="section-title"><div><h3>Missão coletiva</h3><small>'+esc(mission.title||mission.mission_type||'Missão')+'</small></div><span class="tag '+(mission.completed?'good':'')+'">'+num(progress)+'/'+num(target)+'</span></div>'+
    '<div class="progress"><span style="width:'+pct(progress/target*100)+'%"></span></div>'+
    '<p>Recompensa total: <strong>'+money(mission.reward_cash||0)+'</strong> • distribuição proporcional à contribuição.</p>'+
    (rows.length?'<div class="list">'+rows.slice(0,10).map(r=>'<div class="list-row"><span>#'+num(r.position)+' '+esc(r.push_name||'Jogador')+'</span><strong>'+num(r.contribution)+' • '+money(r.share||0)+'</strong></div>').join('')+'</div>':'<div class="empty">Ainda sem contribuição registrada.</div>')+
    '<div class="hero-actions"><button class="btn good" data-group-mission-claim>Resgatar minha parte</button></div>';
}
function renderGroupEventCard(ex){
  const e=ex.groupEvent||null, nowSec=Math.floor(Date.now()/1000);
  if(!e || e.claimed || Number(e.expires_at||0)<=nowSec){
    return '<div class="section-title"><h3>Evento relâmpago do grupo</h3><small>Nenhum evento disponível agora</small></div><p>Quando surgir uma maleta, PIX misterioso ou tesouro no grupo, o Web enxergará o mesmo evento.</p>';
  }
  const remain=Math.max(0,Number(e.expires_at||0)-nowSec);
  const labels={maleta:'💼 Maleta de dinheiro',pix:'💸 PIX misterioso',tesouro:'🧰 Pequeno tesouro'};
  return '<div class="section-title"><div><h3>'+esc(labels[e.event_type]||titleCase(e.event_type))+'</h3><small>Evento compartilhado com o WhatsApp</small></div><span class="tag good">'+remain+'s</span></div>'+
    '<p>Recompensa base: <strong>'+money(e.reward_cash||0)+'</strong></p>'+
    '<button class="btn primary" data-group-event-claim>Resgatar agora</button>';
}

function renderExpeditions(rows){
  rows=rows||[];
  if(!rows.length) return '<div class="empty">Nenhum pet em expedição.</div>';
  const nowSec=Math.floor(Date.now()/1000);
  return '<div class="grid cards">'+rows.map(e=>{
    const remain=Math.max(0,Number(e.ends_at||0)-nowSec);
    const h=Math.floor(remain/3600),m=Math.ceil((remain%3600)/60);
    const ready=remain<=0;
    const trait=e.trait||{};
    const bonuses=[];
    if(Number(trait.xp)>0) bonuses.push('+'+Math.round(Number(trait.xp)*100)+'% XP');
    if(Number(trait.cash)>0) bonuses.push('+'+Math.round(Number(trait.cash)*100)+'% dinheiro');
    if(trait.item) bonuses.push('chance de item');
    return '<div class="card expedition-card"><div class="tag-row"><span class="tag '+(ready?'good':'')+'">'+(ready?'PRONTO':'EM EXPEDIÇÃO')+'</span><span class="tag">'+num(e.hours)+'h</span></div>'+
      '<h3>🐾 '+esc(e.pet_name||titleCase(e.species||'pet'))+'</h3>'+
      '<p>'+esc(titleCase(e.species||''))+' • Lv.'+num(e.level||1)+'</p>'+
      '<div class="grid two expedition-rewards"><div><small>XP previsto</small><strong>+'+num(e.pet_xp||0)+'</strong></div><div><small>Dinheiro</small><strong>'+money(e.cash_reward||0)+'</strong></div></div>'+
      '<p class="muted">'+(bonuses.length?bonuses.join(' • '):'Sem bônus especial')+'</p>'+
      '<div class="expedition-time">'+(ready?'✅ Pode resgatar agora':'⏳ Retorna em '+(h>0?h+'h ':'')+m+'min')+'</div></div>';
  }).join('')+'</div>';
}

function renderActivities(){
  const d=ui.data, ex=ui.extras||{}, sleep=d.activities&&d.activities.sleep, carp=d.activities&&d.activities.carpinar;
  const missions=d.dailyMissions||[], exp=d.petExpeditions||[], plans=ex.carpinarPlans||[];
  return renderDoubleRewardEvent()+'<div class="page-head"><div><h2>Atividades</h2><p>Missões, dormir, carpinar, aventura e expedições dos pets.</p></div></div>'+
    '<div class="grid three">'+
      '<div class="card"><h3>😴 Dormir</h3><p>'+(sleep?'Ativo até '+new Date(Number(sleep.ends_at)*1000).toLocaleString('pt-BR'):'Você está acordado.')+'</p><button class="btn '+(sleep?'danger':'primary')+'" data-sleep="'+(sleep?'wake':'start')+'">'+(sleep?'Acordar':'Dormir')+'</button></div>'+
      '<div class="card"><h3>🌱 Carpinar</h3><p>'+(carp?'Ativo • termina em '+Math.ceil((Number(carp.ends_at)-Date.now()/1000)/60)+' min':'Escolha um dos planos reais abaixo.')+'</p>'+(carp?'<button class="btn danger" data-carpinar="leave">Sair</button>':'<div class="choice-row">'+plans.map(p=>'<button class="btn" data-carpinar-hours="'+Number(p.hours)+'">'+num(p.hours)+'h</button>').join('')+'</div>')+'</div>'+
      '<div class="card"><h3>🐾 Aventura Pet</h3><p>Usa o pet ativo e as regras reais.</p><button class="btn primary" data-pet-adventure>Aventura</button><div class="expedition-form"><select data-expedition-pet><option value="">Escolha o pet</option>'+collection().map(p=>'<option value="'+p.id+'">'+esc(p.name)+' • '+esc(petSpeciesName(p.species))+' • Lv.'+num(p.level)+'</option>').join('')+'</select><select data-expedition-hours><option value="2">2h</option><option value="4" selected>4h</option><option value="8">8h</option></select><button class="btn" data-pet-expedition>Enviar</button></div><button class="btn" data-pet-expedition-resolve>Verificar expedições</button></div>'+
    '</div>'+
    '<div class="section card"><div class="section-title"><h3>Missões diárias</h3><button class="btn good" data-missions-claim>Resgatar prontas</button></div>'+renderMissionList(missions)+'</div>'+
    '<div class="section card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div>'+renderLevelRewards(ex.levelRewards,Number(d.profile&&d.profile.level||1),ex.claimedLevelRewards||[])+'</div>'+
    (currentGroup()?'<div class="section grid two"><div class="card">'+renderGroupMissionCard(ex)+'</div><div class="card">'+renderGroupEventCard(ex)+'</div></div>':'')+
    '<div class="section card"><div class="section-title"><h3>Expedições</h3><button class="btn good" data-pet-expedition-resolve>Verificar retornos</button></div>'+renderExpeditions(exp)+'</div>'+resultPanel();
}

function levelRewardItemLabel(id){
  const labels={
    pocao_m:'Poção Média',caixa_sorte:'Caixa da Sorte',energetico_pet:'Energético Pet',
    pocao_pet_rara:'Poção Pet Rara',caixa_rara:'Caixa Rara',pocao_g:'Poção Grande',
    caixa_epica:'Caixa Épica',elixir_supremo:'Elixir Supremo',pocao_pet_epica:'Poção Pet Épica',
    pocao_pet_suprema:'Poção Pet Suprema',chave_raid_40:'Chave Raid Lv.40',
    chave_raid_50:'Chave Raid Lv.50',pergaminho_reclassificacao:'Pergaminho de Reclassificação'
  };
  return labels[String(id||'')]||titleCase(String(id||'').replaceAll('_',' '));
}

function renderLevelRewards(rows,level,claimedMilestones){
  rows=rows||[];
  if(!rows.length) return '<div class="empty">Nenhuma recompensa de nível configurada.</div>';
  const claimedSet=new Set((Array.isArray(claimedMilestones)?claimedMilestones:[]).map(Number));
  return '<div class="level-rewards">'+rows.map(r=>{
    const milestone=Number(r.milestone||0);
    const unlocked=Number(level)>=milestone;
    const done=claimedSet.has(milestone);
    const items=(r.items||[]).map(i=>esc(levelRewardItemLabel(i.id))+' ×'+num(i.qty)).join(' • ');
    return '<div class="level-reward '+(done?'claimed':unlocked?'unlocked':'locked')+'"><div><span class="tag '+(done?'':unlocked?'good':'')+'">LV.'+num(milestone)+'</span><strong>'+money(r.cash||0)+'</strong><small>'+esc(items||'Somente dinheiro')+'</small></div><span class="reward-status">'+(done?'✓ Resgatado':unlocked?'🎁 Disponível':'🔒')+'</span></div>';
  }).join('')+'</div>';
}

function renderProgression(){
  const d=ui.data||{}, ex=ui.extras||{}, p=profile(), raw=d.profile||{};
  const streak=d.streak||{}, career=d.career||{}, achievements=d.achievements||[], missions=d.dailyMissions||[];
  const level=Number(raw.level||1), exp=Number(raw.exp||0);
  const claimedLevelRewards=ex.claimedLevelRewards||[];
  const nextExp=Math.max(1,level*100);
  const careerXp=Number(career.career_xp||career.xp||0), shifts=Number(career.total_shifts||career.shifts||0);
  return '<div class="page-head"><div><h2>Progressão</h2><p>Equivale aos dados de !nivel, !streak, !carreira, !conquistas e !missoes.</p></div><span class="tag good">NÍVEL '+num(level)+'</span></div>'+
    '<div class="grid stats">'+
      statCard('NÍVEL',num(level),'EXP '+num(exp)+' / '+num(nextExp))+
      statCard('STREAK',num(streak.currentStreak||streak.current_streak||0)+' dias','Recorde '+num(streak.bestStreak||streak.best_streak||0))+
      statCard('CARREIRA XP',num(careerXp),num(shifts)+' turnos')+
      statCard('CONQUISTAS',num(achievements.length),'desbloqueadas')+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Perfil RPG</h3><small>Mesmo stats do WhatsApp</small></div><div class="list">'+
        '<div class="list-row"><span>❤️ HP</span><strong>'+num(p.effective_hp||p.hp)+' / '+num(p.effective_max_hp||p.max_hp)+'</strong></div>'+
        '<div class="list-row"><span>⚔️ ATK</span><strong>'+num(p.effective_atk||p.atk)+'</strong></div>'+
        '<div class="list-row"><span>🛡️ DEF</span><strong>'+num(p.effective_def||p.def)+'</strong></div>'+
        '<div class="list-row"><span>💨 SPD</span><strong>'+num(p.effective_spd||p.spd)+'</strong></div>'+
        '<div class="list-row"><span>⚡ CRIT</span><strong>'+Math.round(Number(p.effective_crit||0)*100)+'%</strong></div>'+
        '<div class="list-row"><span>🏆 Vitórias</span><strong>'+num(p.win||p.wins||0)+'</strong></div>'+
        '<div class="list-row"><span>💀 Derrotas</span><strong>'+num(p.loss||p.losses||0)+'</strong></div>'+
      '</div></div>'+
      '<div class="card"><div class="section-title"><h3>Equipamentos</h3><small>Níveis reais</small></div><div class="list">'+
        '<div class="list-row"><span>🗡️ Arma</span><strong>'+esc(p.weapon_name||'Nenhuma')+' Lv.'+num(p.weapon_level||1)+'</strong></div>'+
        '<div class="list-row"><span>🛡️ Armadura</span><strong>'+esc(p.armor_name||'Nenhuma')+' Lv.'+num(p.armor_level||1)+'</strong></div>'+
        '<div class="list-row"><span>👢 Botas</span><strong>'+esc(p.boot_name||'Nenhuma')+' Lv.'+num(p.boot_level||1)+'</strong></div>'+
      '</div></div>'+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Conquistas</h3><small>'+achievements.length+'</small></div>'+(achievements.length?'<div class="list">'+achievements.map(a=>'<div class="list-row"><span>'+esc(a)+'</span><strong>✓</strong></div>').join('')+'</div>':'<div class="empty">Nenhuma conquista desbloqueada.</div>')+'</div>'+
      '<div class="card"><div class="section-title"><h3>Missões diárias</h3><button class="btn good" data-missions-claim>Resgatar prontas</button></div>'+renderMissionList(missions)+'</div>'+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div>'+renderLevelRewards(ex.levelRewards,level,claimedLevelRewards)+'</div>'+
      '<div class="card"><div class="section-title"><h3>Cooldowns</h3><small>Servidor</small></div>'+renderCooldowns()+'</div>'+
    '</div>'+resultPanel();
}

function leaderboardBlock(title,rows,valueFn){
  return '<div class="card"><div class="section-title"><h3>'+esc(title)+'</h3></div><div class="list">'+((rows||[]).length?(rows||[]).map((x,i)=>'<div class="list-row"><span>#'+(i+1)+' '+esc(x.push_name||x.name||'Jogador')+'</span><strong>'+esc(valueFn(x))+'</strong></div>').join(''):'<div class="empty">Sem dados.</div>')+'</div></div>';
}
function renderRankings(){
  const ex=ui.extras||{}, l=ex.leaderboards||{};
  return '<div class="page-head"><div><h2>Rankings</h2><p>Economia, RPG, pets, patrimônio e atividade do mesmo Neon.</p></div><span class="tag">Seu rank ECO #'+num(ex.ranks&&ex.ranks.economyRank)+' • RPG #'+num(ex.ranks&&ex.ranks.combatRank)+'</span></div>'+
    '<div class="grid two">'+
      leaderboardBlock('💰 Economia',l.economy,x=>money(x.total))+
      leaderboardBlock('⚔️ Combate',l.combat,x=>num(x.score)+' pts')+
      leaderboardBlock('🐾 Pets',l.pets,x=>'Lv.'+num(x.level)+' • '+num(x.power)+' poder')+
      leaderboardBlock('🏛️ Patrimônio',l.patrimony,x=>money(x.total||x.patrimony))+
      leaderboardBlock('💬 Atividade do grupo',l.activity,x=>num(x.messages)+' msgs')+
    '</div>';
}

function renderPatrimonySummary(p){
  p=p||{};
  const parts=[
    ['💵 Carteira',p.cash],['🏦 Banco',p.bank],['🎒 Inventário',p.inventory_value],
    ['🚗 Carros',p.cars_value],['🏍️ Motos/Bikes',p.motorcycles_value],
    ['🏢 Negócios',p.businesses_value],['🏠 Imóvel',p.home_value]
  ];
  return '<div class="grid two patrimony-grid">'+parts.map(x=>'<div class="list-row"><span>'+x[0]+'</span><strong>'+money(x[1])+'</strong></div>').join('')+'</div>'+
    '<div class="patrimony-total"><span>Patrimônio total</span><strong>'+money(p.total)+'</strong></div>';
}
function renderGarageCard(x,kind){
  const isCar=kind==='car';
  return '<div class="card catalog-card"><h3>'+(isCar?'🚗 ':'🏍️ ')+esc(x.name||x.car_name||x.motorcycle_name||x.car_id||x.motorcycle_id)+'</h3>'+
    '<p>Valor de referência: <strong>'+money(x.price||x.price_paid||0)+'</strong></p>'+
    (x.price_paid?'<small>Pago: '+money(x.price_paid)+'</small>':'')+
    '<div class="pet-actions"><button class="btn danger" '+(isCar?'data-car-sell="'+esc(x.id||x.car_id)+'"':'data-moto-sell="'+esc(x.id||x.motorcycle_id)+'"')+'>Vender</button></div></div>';
}
function renderCltStatus(clt){
  const drivers=(clt&&clt.drivers)||[];
  if(!drivers.length) return '<div class="empty">Nenhum motorista CLT contratado.</div>';
  return '<div class="grid cards">'+drivers.map(d=>{
    const t=d.type||{}, car=d.car||null;
    return '<div class="card compact-card"><div class="tag-row"><span class="tag '+(d.active?'good':'')+'">'+(d.active?'EM TURNO':d.finished?'PRONTO PARA COLETAR':'DISPONÍVEL')+'</span><span class="tag">Slot '+num(d.slot||0)+'</span></div>'+
      '<h3>🚕 '+esc(t.name||d.driver_type||'Motorista')+'</h3>'+
      '<p>'+(car?'Carro: '+esc(car.name):'Sem carro alocado')+'</p>'+
      '<p>💰 Acumulado: <strong>'+money(d.accrued||0)+'</strong>'+(d.active?' • ⏳ '+Math.ceil(Number(d.remaining||0)/60)+' min':'')+'</p></div>';
  }).join('')+'</div>';
}
function renderRelationship(rel){
  if(!rel) return '<div class="empty">Nenhum relacionamento ativo.</div>';
  return '<div class="relationship-card"><div><small>PARCEIRO(A)</small><strong>💍 '+esc(rel.partner_name||'Jogador')+'</strong></div>'+
    '<div><small>STATUS</small><strong>Casados</strong></div></div>';
}
function renderClanSummary(clan){
  if(!clan) return '<div class="empty">Você ainda não faz parte de um clã.</div>';
  return '<div class="grid stats">'+
    statCard('NÍVEL',num(clan.level||1),'clã')+
    statCard('MEMBROS',num(clan.members||0),'jogadores')+
    statCard('XP',num(clan.xp||0),'progressão')+
    statCard('COFRE',money(clan.treasury||0),'tesouraria')+
  '</div><p class="muted">Seu cargo: <strong>'+esc(clan.role==='leader'?'Líder':'Membro')+'</strong></p>';
}
function renderClanList(clans){
  if(!clans.length) return '<div class="empty">Nenhum clã cadastrado.</div>';
  return '<div class="list">'+clans.map((x,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(x.name||'Clã')+'</strong><small>Lv.'+num(x.level||1)+' • '+num(x.members||0)+' membros • '+num(x.xp||0)+' XP</small></div><strong>'+money(x.treasury||0)+'</strong></div>').join('')+'</div>';
}

function renderEconomy(){
  const d=ui.data, p=d.profile||{}, businesses=d.businesses||[], cars=d.cars||[], bikes=d.motorcycles||[];
  const catalog=ui.catalog||{}, house=d.home, clt=d.cltUber||{};
  return '<div class="page-head"><div><h2>Economia</h2><p>Patrimônio e operações usam as mesmas tabelas e rotinas do bot.</p></div><span class="tag good">'+money(Number(p.cash||0)+Number(p.bank||0))+'</span></div>'+
    '<div class="grid stats">'+statCard('CARTEIRA',money(p.cash),'disponível')+statCard('BANCO',money(p.bank),'saldo')+statCard('CARROS',cars.length,'garagem')+statCard('MOTOS / BIKE',bikes.length,'entregas')+'</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Ações rápidas</h3><small>Mesmas rotinas do WhatsApp</small></div><div class="hero-actions"><button class="btn good" data-action="all">⚡ Rotina completa</button><button class="btn primary" data-action="work">💼 Trabalhar</button><button class="btn" data-action="uber">🚗 Uber</button><button class="btn" data-action="ifood">🛵 iFood</button><button class="btn good" data-action="business.collect">🏢 Coletar negócios</button></div><div class="bank-quick"><div><label>Movimentar dinheiro</label><input class="bank-input" data-bank-amount inputmode="numeric" type="number" min="1" placeholder="Digite o valor"></div><div class="hero-actions"><button class="btn" data-deposit>🏦 Depositar</button><button class="btn" data-deposit-all>Depositar tudo</button><button class="btn" data-withdraw>💵 Sacar</button><button class="btn" data-withdraw-all>💸 Sacar tudo</button></div></div></div>'+
      '<div class="card"><div class="section-title"><h3>Patrimônio</h3><small>Mesmo cálculo do !patrimonio</small></div>'+renderPatrimonySummary(d.patrimony)+'</div>'+
    '</div>'+
    '<div class="section"><div class="section-title"><h3>Casa</h3><small>'+(house?esc(house.house_id||house.id||house.name):'Sem casa')+'</small></div><div class="grid cards">'+(catalog.houses||[]).map(x=>'<div class="card catalog-card"><h3>🏠 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-house-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Garagem</h3><small>'+cars.length+' veículos</small></div><div class="grid cards">'+(cars.length?cars.map(x=>renderGarageCard(x,'car')).join(''):'<div class="empty">Garagem vazia.</div>')+'</div><div class="grid cards section">'+(catalog.cars||[]).map(x=>'<div class="card catalog-card"><h3>🚘 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-car-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Motos e bicicletas</h3><small>'+bikes.length+' na garagem</small></div><div class="grid cards">'+(bikes.length?bikes.map(x=>renderGarageCard(x,'moto')).join(''):'<div class="empty">Nenhuma moto/bike.</div>')+'</div><div class="grid cards section">'+(catalog.motorcycles||[]).map(x=>'<div class="card catalog-card"><h3>🛵 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-moto-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Meus negócios</h3><small>'+businesses.length+'</small></div><div class="grid cards">'+(businesses.length?businesses.map(b=>'<div class="card biz-card"><h3>'+esc(b.name||b.business_id)+'</h3><p>Lv.'+num(b.level||1)+'</p><button class="btn" data-business-upgrade="'+esc(b.business_id||b.id)+'">Upar</button></div>').join(''):'<div class="empty">Você ainda não possui negócios.</div>')+'</div><div class="grid cards section">'+(catalog.businesses||[]).map(x=>'<div class="card catalog-card"><h3>🏢 '+esc(x.name)+'</h3><p>'+money(x.price)+' • '+money(x.profitHour)+'/h</p><button class="btn primary" data-business-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Central Uber CLT</h3><small>Mesmo estado do !centraluber</small></div>'+renderCltStatus(clt)+'<div class="hero-actions section"><button class="btn" data-clt-hire>Contratar motorista</button><button class="btn primary" data-clt-start>Iniciar turno</button><button class="btn good" data-action="cltUber.collect">Coletar</button></div></div>'+
    '<div class="section card"><div class="section-title"><h3>Extrato recente</h3><small>Últimas 20 movimentações do mesmo jogador</small></div>'+renderTransactions(20)+'</div>'+resultPanel();
}
function renderLoans(){
  const loans=ui.data.loans||{}, borrowed=loans.borrowed||[], lent=loans.lent||[], credit=loans.credit||ui.extras&&ui.extras.loanCredit||{};
  const incoming=borrowed.filter(x=>x.status==='pending');
  const active=borrowed.filter(x=>x.status==='active');
  return '<div class="page-head"><div><h2>Empréstimos</h2><p>Propostas, dívida ativa e crédito vêm diretamente de player_loans.</p></div><span class="tag">Limite '+money(credit.creditLimit||credit.limit||0)+'</span></div>'+
    '<div class="grid stats">'+statCard('CRÉDITO',money(credit.creditLimit||credit.limit||0),'limite calculado')+statCard('PENDENTES',incoming.length,'propostas recebidas')+statCard('ATIVOS',active.length,'dívidas')+statCard('EMPRESTADOS',lent.length,'ofertas suas')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Propostas recebidas</h3><small>'+incoming.length+'</small></div><div class="grid cards">'+
      (incoming.length?incoming.map(x=>'<div class="card"><h3>'+money(x.amount)+' de '+esc(x.lender_name||'Jogador')+'</h3><p>Oferta #'+x.id+' • expira conforme a regra do bot.</p><div class="pet-actions"><button class="btn good" data-loan-accept="'+x.id+'">Aceitar</button><button class="btn danger" data-loan-reject="'+x.id+'">Recusar</button></div></div>').join(''):'<div class="empty">Nenhuma proposta pendente.</div>')+
    '</div></div>'+
    '<div class="section"><div class="section-title"><h3>Dívidas ativas</h3><small>'+active.length+'</small></div><div class="grid cards">'+
      (active.length?active.map(x=>'<div class="card"><h3>'+money(x.principal||x.amount)+'</h3><p>Credor: '+esc(x.lender_name||'Jogador')+' • saldo/juros calculados pelo servidor.</p><button class="btn good" data-loan-pay="total">Pagar total</button></div>').join(''):'<div class="empty">Nenhuma dívida ativa.</div>')+
    '</div></div>'+
    '<div class="section"><div class="section-title"><h3>Ofertas / empréstimos concedidos</h3><small>'+lent.length+'</small></div><div class="list">'+
      (lent.length?lent.map(x=>'<div class="list-row"><span>'+esc(x.borrower_name||'Jogador')+' • '+esc(loanStatusLabel(x.status))+'</span><strong>'+money(x.amount||x.principal)+'</strong></div>').join(''):'<div class="empty">Nenhum empréstimo concedido.</div>')+
    '</div></div>'+resultPanel();
}


function lootRewardIsPotion(item){
  const id=String(item&&item.itemId||'').toLowerCase();
  return id==='pocao_p'||id==='pocao_m'||id==='pocao_g'||id==='elixir_supremo'||id.startsWith('pocao_pet_')||id==='energetico_pet';
}
function setLootReveal(value){
  ui.lootReveal=value||null;
  document.body.classList.toggle('loot-open',Boolean(ui.lootReveal));
}
async function openLootBoxUI(boxId,qty){
  toast('✨ Abrindo caixa...');
  const result=await doAction('item.box.open',{boxId,qty},{quiet:true});
  setLootReveal(result);
  render();
}
function lootRevealModal(){
  const r=ui.lootReveal;
  if(!r) return '';
  const items=Array.isArray(r.items)?r.items:[];
  const utility=[];
  if(Number(r.cash||0)>0) utility.push('<div class="loot-auto"><span>💰 Dinheiro</span><strong>+'+money(r.cash)+'</strong><small>creditado automaticamente</small></div>');
  if(Number(r.exp||0)>0) utility.push('<div class="loot-auto"><span>⭐ EXP</span><strong>+'+num(r.exp)+'</strong><small>aplicado automaticamente</small></div>');
  const rewards=items.map(it=>{
    const potion=lootRewardIsPotion(it);
    const art=itemArtMarkup({itemId:it.itemId,name:it.name,rarity:it.rarity,category:potion?'consumable':''});
    return '<div class="loot-reward '+rarityClass(it.rarity)+'">'+art+
      '<div class="loot-reward-copy"><div class="tag-row"><span class="tag '+esc(it.rarity)+'">'+esc(it.rarity||'item')+'</span><span class="tag">x'+num(it.qty||1)+'</span></div>'+
      '<h3>'+esc(it.name||it.itemId)+'</h3>'+
      (potion?'<p>🧪 Guardada automaticamente no inventário.</p>':'<p>O item já está no seu inventário. Você pode guardar ou vender agora.</p>')+
      '</div>'+
      '<div class="loot-actions">'+
        (potion?'':'<button class="btn danger" data-loot-sell="'+esc(it.itemId)+'" data-loot-sell-qty="'+Number(it.qty||1)+'">Vender • '+money(Number(it.sellUnit||0)*Number(it.qty||1))+'</button>')+
        '<button class="btn good" data-loot-keep>Guardar</button>'+
      '</div></div>';
  }).join('');
  const empty=!items.length&&!utility.length?'<div class="empty">A caixa foi aberta, mas não houve recompensa retornada pelo servidor.</div>':'';
  return '<div class="loot-overlay" data-loot-close>'+
    '<section class="loot-modal" role="dialog" aria-modal="true" aria-label="Recompensa da caixa" onclick="event.stopPropagation()">'+
      '<div class="loot-burst">✨</div>'+
      '<p class="eyebrow">RECOMPENSA DA CAIXA</p>'+
      '<h2>Você ganhou!</h2>'+
      '<p class="muted">'+esc(r.boxName||'Caixa')+' • '+num(r.opened||1)+' aberta(s)</p>'+
      (utility.length?'<div class="loot-utility">'+utility.join('')+'</div>':'')+
      '<div class="loot-rewards">'+rewards+'</div>'+empty+
      '<button class="btn primary loot-close-main" data-loot-keep>Continuar</button>'+
    '</section></div>';
}

function pageSceneKey(page){
  return ({
    character:'bg-arena',
    pets:'bg-abilities',
    inventory:'bg-inventory',
    shop:'bg-shop',
    raids:'bg-raid',
    boss:'bg-boss',
    duels:'bg-arena',
    social:'bg-arena',
    games:'bg-abilities',
    progression:'bg-abilities'
  })[page]||null;
}
function pageScene(page){
  const key=pageSceneKey(page);
  return key?'<div class="page-visual-scene">'+artSprite(key,'page-scene-art','Cenário '+page)+'</div>':'';
}

function render(){
  if(!ui.data || !ui.catalog) return;
  renderNav(); renderHeader();
  const renderers={home:renderHome,character:renderCharacter,pets:renderPets,inventory:renderInventory,shop:renderShop,raids:renderRaids,boss:renderBoss,duels:renderDuels,social:renderSocial,market:renderMarket,clan:renderClan,games:renderGames,activities:renderActivities,progression:renderProgression,rankings:renderRankings,economy:renderEconomy,loans:renderLoans};
  $('#content').innerHTML=pageScene(ui.page)+(renderers[ui.page]||renderHome)()+lootRevealModal();
  bind();
}

function bind(){
  document.querySelectorAll('[data-resync]').forEach(x=>x.onclick=()=>sync(false));
  document.querySelectorAll('[data-character-select]').forEach(x=>x.onclick=async()=>{
    ui.characterId=x.dataset.characterSelect;
    localStorage.setItem(CHARACTER_KEY,ui.characterId);
    await doAction('character.select',{classId:ui.characterId},{success:'🧙 Classe aplicada aos seus atributos.'});
  });
  document.querySelectorAll('[data-go-page]').forEach(x=>x.onclick=async()=>{
    ui.page=x.dataset.goPage;
    setMenu(false);
    if(['social','market','clan','games','activities','progression','rankings','loans'].includes(ui.page)) await syncExtras(false).catch(()=>null);
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
  });
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>doAction(x.dataset.action,{},{}));
  document.querySelectorAll('[data-pet-tab]').forEach(x=>x.onclick=()=>{ui.petTab=x.dataset.petTab;render();});
  document.querySelectorAll('[data-pet-team-save]').forEach(x=>x.onclick=()=>{
    const selects=[...document.querySelectorAll('[data-team-slot]')].sort((a,b)=>Number(a.dataset.teamSlot)-Number(b.dataset.teamSlot));
    const slots=selects.map(s=>Number(s.value||0));
    const principal=slots[0]||0,suporte=slots[1]||0,reserva=slots[2]||0;
    if(!principal) return toast('Escolha o pet Principal.');
    if(reserva&&!suporte) return toast('Escolha o Suporte antes da Reserva.');
    const petIds=[principal,suporte,reserva].filter(v=>Number.isInteger(v)&&v>0);
    if(new Set(petIds).size!==petIds.length) return toast('Não use o mesmo pet em dois slots.');
    doAction('pet.team',{petIds,replaceAll:true},{});
  });
  document.querySelectorAll('[data-pet-select]').forEach(x=>x.onclick=()=>doAction('pet.select',{petId:Number(x.dataset.petSelect)},{}));
  document.querySelectorAll('[data-pet-rename]').forEach(x=>x.onclick=()=>{
    const petId=Number(x.dataset.petRename||0);
    const pet=collection().find(p=>Number(p.id)===petId)||{};
    const input=x.parentElement&&x.parentElement.querySelector('[data-pet-name]');
    const name=String(input&&input.value||'').trim();
    if(!petId) return toast('Pet inválido.');
    if(name.length<2) return toast('Digite um nome com pelo menos 2 caracteres.');
    if(name===String(pet.name||'')) return toast('Esse já é o nome desse pet.');
    doAction('pet.rename',{petId,name},{success:'✏️ Nome do pet alterado.'});
  });
  document.querySelectorAll('[data-pet-action]').forEach(x=>x.onclick=()=>doAction('pet.action',{action:x.dataset.petAction},{}));
  document.querySelectorAll('[data-pet-adopt-direct]').forEach(x=>x.onclick=async()=>{
    const species=String(x.dataset.petAdoptDirect||'');
    const input=x.parentElement&&x.parentElement.querySelector('[data-pet-adopt-name]');
    const name=String(input&&input.value||'').trim();
    if(!species) return toast('Pet inválido.');
    if(name.length<2) return toast('Digite um nome com pelo menos 2 caracteres.');
    x.disabled=true;
    try{
      await doAction('pet.adopt',{species,name},{success:'🐾 Pet adotado e equipado.'});
      ui.petTab='owned';
      render();
    }catch{
      x.disabled=false;
    }
  });
  document.querySelectorAll('[data-pet-adopt-open]').forEach(x=>x.onclick=()=>{
    ui.petAdoptSpecies=x.dataset.petAdoptOpen;
    render();
    window.setTimeout(()=>document.querySelector('[data-pet-adopt-modal-name]')?.focus(),0);
  });
  document.querySelectorAll('[data-pet-adopt-close]').forEach(x=>x.onclick=event=>{
    const overlay=event.currentTarget;
    if(overlay.classList.contains('pet-adopt-overlay') && event.target!==overlay) return;
    ui.petAdoptSpecies='';
    render();
  });
  document.querySelectorAll('[data-pet-adopt-confirm]').forEach(x=>x.onclick=async()=>{
    const input=document.querySelector('[data-pet-adopt-modal-name]');
    const name=String(input&&input.value||'').trim();
    if(name.length<2) return toast('Digite um nome com pelo menos 2 caracteres.');
    const species=x.dataset.petAdoptConfirm;
    x.disabled=true;
    try{
      await doAction('pet.adopt',{species,name},{success:'🐾 Pet adotado e equipado.'});
      ui.petAdoptSpecies='';
      ui.petTab='owned';
      render();
    }catch{
      x.disabled=false;
    }
  });
  document.querySelectorAll('[data-pet-summon]').forEach(x=>x.onclick=()=>doAction('pet.summon',{materialId:x.dataset.petSummon},{}));
  document.querySelectorAll('[data-player-heal]').forEach(x=>x.onclick=()=>doAction('player.heal',{}, {success:'❤️ Personagem curado.'}));
  document.querySelectorAll('[data-team-pet-heal],[data-pet-card-heal]').forEach(x=>x.onclick=()=>{
    const petId=Number(x.dataset.teamPetHeal||x.dataset.petCardHeal||0);
    if(petId>0) doAction('pet.heal',{petId},{success:'❤️ Cura aplicada ao pet.'});
  });
  document.querySelectorAll('[data-pet-heal]').forEach(x=>x.onclick=()=>doAction('pet.heal',{itemId:x.dataset.petHeal},{success:'❤️ Pet ativo curado.'}));
  document.querySelectorAll('[data-pet-energy]').forEach(x=>x.onclick=()=>doAction('pet.energy',{},{}));
  document.querySelectorAll('[data-item-equip]').forEach(x=>x.onclick=()=>doAction('item.equip',{itemId:x.dataset.itemEquip},{}));
  document.querySelectorAll('[data-item-upgrade]').forEach(x=>x.onclick=()=>doAction('item.upgrade',{itemId:x.dataset.itemUpgrade},{}));
  document.querySelectorAll('[data-item-use]').forEach(x=>x.onclick=()=>doAction('item.use',{itemId:x.dataset.itemUse},{}));
  document.querySelectorAll('[data-box-open]').forEach(x=>x.onclick=()=>openLootBoxUI(x.dataset.boxOpen,1));
  document.querySelectorAll('[data-box-open-all]').forEach(x=>x.onclick=()=>openLootBoxUI(x.dataset.boxOpenAll,Number(x.dataset.boxQty||1)));
  document.querySelectorAll('[data-loot-keep]').forEach(x=>x.onclick=()=>{setLootReveal(null);render();});
  document.querySelectorAll('[data-loot-close]').forEach(x=>x.onclick=()=>{setLootReveal(null);render();});
  document.querySelectorAll('[data-loot-sell]').forEach(x=>x.onclick=async()=>{
    const itemId=x.dataset.lootSell,qty=Number(x.dataset.lootSellQty||1);
    setLootReveal(null);
    await doAction('item.sell',{itemId,qty},{success:'💰 Recompensa vendida.'});
  });
  document.querySelectorAll('[data-lucky-open]').forEach(x=>x.onclick=()=>doAction('item.lucky.open',{qty:Number(x.dataset.luckyOpen||1)},{}));
  document.querySelectorAll('[data-sell-duplicates]').forEach(x=>x.onclick=()=>doAction('item.sellDuplicates',{},{}));
  document.querySelectorAll('[data-item-sell]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSell,qty:1},{}));
  document.querySelectorAll('[data-item-sell-all]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSellAll,qty:Number(x.dataset.itemSellQty||1)},{}));
  document.querySelectorAll('[data-shop-buy]').forEach(x=>x.onclick=()=>doAction('item.buy',{itemId:x.dataset.shopBuy,qty:1},{}));
  document.querySelectorAll('[data-shop-buy-qty]').forEach(x=>x.onclick=()=>{
    const qty=Math.max(1,Math.min(9999,Number(prompt('Quantidade para comprar:','2'))||0));
    if(!qty) return;
    const unit=Number(x.dataset.shopPrice||0);
    if(unit>0 && Number((ui.data.profile||{}).cash||0)<unit*qty) return toast('Saldo insuficiente para '+qty+' unidade(s).');
    doAction('item.buy',{itemId:x.dataset.shopBuyQty,qty},{});
  });
  document.querySelectorAll('[data-raid-create]').forEach(x=>x.onclick=()=>doAction('raid.create',{level:Number(x.dataset.raidCreate),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-join]').forEach(x=>x.onclick=()=>doAction('raid.join',{level:Number(x.dataset.raidJoin),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-start]').forEach(x=>x.onclick=async()=>{
    const level=Number(x.dataset.raidStart);
    await doAction('raid.start',{level:level},{success:'⚔️ Raid iniciada. AUTO no servidor: continua mesmo com o app em segundo plano.'});
  });
  document.querySelectorAll('[data-raid-cancel]').forEach(x=>x.onclick=()=>doAction('raid.cancel',{level:Number(x.dataset.raidCancel)},{}));
  document.querySelectorAll('[data-raid-round]').forEach(x=>x.onclick=async()=>{
    const level=Number(x.dataset.raidRound);
    const result=await doAction('raid.round',{level},{});
    animateCombatImpact('raid',result,level);
  });
  document.querySelectorAll('[data-raid-auto]').forEach(x=>x.onclick=()=>{
    const level=Number(x.dataset.raidAuto);
    doAction('raid.auto',{level},{success:'⚡ Automação da Raid confirmada no servidor.'});
  });
  document.querySelectorAll('[data-boss-start]').forEach(x=>x.onclick=()=>doAction('boss.start',{},{}));
  document.querySelectorAll('[data-boss-attack]').forEach(x=>x.onclick=async()=>{
    const result=await doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{});
    animateCombatImpact('boss',result);
  });
  document.querySelectorAll('[data-boss-auto]').forEach(x=>x.onclick=toggleBossAuto);
  document.querySelectorAll('[data-business-upgrade]').forEach(x=>x.onclick=()=>doAction('business.upgrade',{id:x.dataset.businessUpgrade},{}));
  document.querySelectorAll('[data-deposit]').forEach(x=>x.onclick=()=>{
    const input=document.querySelector('[data-bank-amount]');
    const amount=Math.floor(Number(input&&input.value||0));
    if(amount>0) doAction('deposit',{amount},{});
    else toast('Digite um valor válido para depositar.');
  });
  document.querySelectorAll('[data-deposit-all]').forEach(x=>x.onclick=()=>{
    const amount=Number((ui.data.profile||{}).cash||0);
    if(amount>0) doAction('deposit',{amount:'total'},{});
    else toast('Você não tem dinheiro na carteira para depositar.');
  });
  document.querySelectorAll('[data-withdraw]').forEach(x=>x.onclick=()=>{
    const input=document.querySelector('[data-bank-amount]');
    const amount=Math.floor(Number(input&&input.value||0));
    if(amount>0) doAction('withdraw',{amount},{});
    else toast('Digite um valor válido para sacar.');
  });
  document.querySelectorAll('[data-withdraw-all]').forEach(x=>x.onclick=()=>{
    const amount=Number((ui.data.profile||{}).bank||0);
    if(amount>0) doAction('withdraw',{amount},{});
    else toast('Você não tem saldo no banco para sacar.');
  });
  document.querySelectorAll('[data-house-buy]').forEach(x=>x.onclick=()=>doAction('house.buy',{id:x.dataset.houseBuy},{}));
  document.querySelectorAll('[data-car-buy]').forEach(x=>x.onclick=()=>doAction('car.buy',{id:x.dataset.carBuy},{}));
  document.querySelectorAll('[data-car-sell]').forEach(x=>x.onclick=()=>doAction('car.sell',{id:x.dataset.carSell},{}));
  document.querySelectorAll('[data-moto-buy]').forEach(x=>x.onclick=()=>doAction('motorcycle.buy',{id:x.dataset.motoBuy},{}));
  document.querySelectorAll('[data-moto-sell]').forEach(x=>x.onclick=()=>doAction('motorcycle.sell',{id:x.dataset.motoSell},{}));
  document.querySelectorAll('[data-business-buy]').forEach(x=>x.onclick=()=>doAction('business.buy',{id:x.dataset.businessBuy},{}));
  document.querySelectorAll('[data-clt-hire]').forEach(x=>x.onclick=()=>{
    const input=prompt('Tipo/número do motorista CLT:','1');
    if(input) doAction('cltUber.hire',{input},{});
  });
  document.querySelectorAll('[data-clt-start]').forEach(x=>x.onclick=()=>{
    const driverSlot=Number(prompt('Slot do motorista:','1'));
    const carSlot=Number(prompt('Slot do carro:','1'));
    if(driverSlot>0&&carSlot>0) doAction('cltUber.start',{driverSlot,carSlot},{});
  });
  document.querySelectorAll('[data-loan-pay]').forEach(x=>x.onclick=()=>doAction('loan.pay',{amount:x.dataset.loanPay},{}));
  document.querySelectorAll('[data-loan-accept]').forEach(x=>x.onclick=()=>doAction('loan.accept',{id:Number(x.dataset.loanAccept)},{}));
  document.querySelectorAll('[data-loan-reject]').forEach(x=>x.onclick=()=>doAction('loan.reject',{id:Number(x.dataset.loanReject)},{}));
  document.querySelectorAll('[data-duel-target]').forEach(x=>x.onchange=()=>{
    ui.duelTarget=x.value;
    render();
  });
  document.querySelectorAll('[data-duel-select-only]').forEach(x=>x.onclick=()=>{
    ui.duelTarget=x.dataset.duelSelectOnly;
    render();
    window.scrollTo({top:0,left:0,behavior:'smooth'});
  });
  document.querySelectorAll('[data-duel-launch]').forEach(x=>x.onclick=async()=>{
    ui.duelTarget=x.dataset.duelLaunch;
    await doAction('battle',{targetJid:ui.duelTarget},{});
  });
  document.querySelectorAll('[data-duel-pet-launch]').forEach(x=>x.onclick=async()=>{
    ui.duelTarget=x.dataset.duelPetLaunch;
    await doAction('petduel',{targetJid:ui.duelTarget},{});
  });
  document.querySelectorAll('[data-battle]').forEach(x=>x.onclick=async()=>{
    ui.duelTarget=x.dataset.battle;
    await doAction('battle',{targetJid:ui.duelTarget},{});
  });
  document.querySelectorAll('[data-petduel]').forEach(x=>x.onclick=async()=>{
    ui.duelTarget=x.dataset.petduel;
    await doAction('petduel',{targetJid:ui.duelTarget},{});
  });
  document.querySelectorAll('[data-coin-duel]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta do Cara ou Coroa:','1000'));
    if(!(amount>=10)) return;
    const choice=String(prompt('Escolha: cara ou coroa','cara')||'').trim().toLowerCase();
    if(['cara','coroa'].includes(choice)) doAction('game.coinDuel.create',{targetJid:x.dataset.coinDuel,amount,choice},{});
  });
  document.querySelectorAll('[data-rps-duel]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta do Pedra/Papel/Tesoura:','1000'));
    if(!(amount>=10)) return;
    const choice=String(prompt('Escolha: pedra, papel ou tesoura','pedra')||'').trim().toLowerCase();
    if(['pedra','papel','tesoura'].includes(choice)) doAction('game.rpsDuel.create',{targetJid:x.dataset.rpsDuel,amount,choice},{});
  });
  document.querySelectorAll('[data-coin-duel-accept]').forEach(x=>x.onclick=()=>doAction('game.coinDuel.accept',{},{}));
  document.querySelectorAll('[data-rps-duel-accept]').forEach(x=>x.onclick=()=>{
    const choice=String(prompt('Escolha: pedra, papel ou tesoura','pedra')||'').trim().toLowerCase();
    if(['pedra','papel','tesoura'].includes(choice)) doAction('game.rpsDuel.accept',{choice},{});
  });
  document.querySelectorAll('[data-rob]').forEach(x=>x.onclick=()=>doAction('rob',{targetJid:x.dataset.rob},{}));
  document.querySelectorAll('[data-transfer]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor do PIX:','1000'));
    if(amount>0) doAction('transfer',{targetJid:x.dataset.transfer,amount},{});
  });
  document.querySelectorAll('[data-loan-offer]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor do empréstimo:','5000'));
    if(amount>0) doAction('loan.offer',{targetJid:x.dataset.loanOffer,amount},{});
  });
  document.querySelectorAll('[data-relationship-propose]').forEach(x=>x.onclick=()=>doAction('relationship.propose',{targetJid:x.dataset.relationshipPropose},{}));
  document.querySelectorAll('[data-relationship-accept-member]').forEach(x=>x.onclick=()=>doAction('relationship.accept',{targetJid:x.dataset.relationshipAcceptMember},{}));
  document.querySelectorAll('[data-relationship-divorce]').forEach(x=>x.onclick=()=>doAction('relationship.divorce',{},{}));

  document.querySelectorAll('[data-market-buy]').forEach(x=>x.onclick=()=>doAction('market.buy',{listingId:Number(x.dataset.marketBuy)},{}));
  document.querySelectorAll('[data-market-cancel]').forEach(x=>x.onclick=()=>doAction('market.cancel',{listingId:Number(x.dataset.marketCancel)},{}));
  document.querySelectorAll('[data-market-announce]').forEach(x=>x.onclick=()=>{
    const itemId=x.dataset.marketAnnounce;
    const maxQty=Math.max(1,Number(x.dataset.marketMax||1));
    const ref=Math.max(0,Number(x.dataset.marketRef||0));
    const qty=Math.min(maxQty,Math.max(1,Number(prompt('Quantidade para anunciar (máx. '+maxQty+'):','1'))||1));
    const suggested=ref>0?ref*qty:1000;
    const price=Number(prompt('Preço total do anúncio:\nSugestão pela referência atual: '+money(suggested),String(suggested)));
    if(price>0) doAction('market.create',{itemId,qty,price},{});
  });

  document.querySelectorAll('[data-clan-create]').forEach(x=>x.onclick=()=>{
    const name=prompt('Nome do novo clã:','Alpha');
    if(name) doAction('clan.create',{name},{});
  });
  document.querySelectorAll('[data-clan-accept]').forEach(x=>x.onclick=()=>doAction('clan.accept',{},{}));
  document.querySelectorAll('[data-clan-leave]').forEach(x=>x.onclick=()=>doAction('clan.leave',{},{}));
  document.querySelectorAll('[data-clan-donate]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor da doação ao clã:','1000'));
    if(amount>0) doAction('clan.donate',{amount},{});
  });
  document.querySelectorAll('[data-clan-invite]').forEach(x=>x.onclick=()=>doAction('clan.invite',{targetJid:x.dataset.clanInvite},{}));
  document.querySelectorAll('[data-clan-kick]').forEach(x=>x.onclick=()=>doAction('clan.kick',{targetJid:x.dataset.clanKick},{}));
  document.querySelectorAll('[data-clan-transfer]').forEach(x=>x.onclick=()=>doAction('clan.transfer',{targetJid:x.dataset.clanTransfer},{}));

  document.querySelectorAll('[data-game-coin-choice]').forEach(x=>x.onclick=()=>{
    const amount=Math.floor(Number((document.querySelector('[data-coin-amount]')||{}).value||0));
    if(amount>0) doAction('game.coinflip',{amount,choice:x.dataset.gameCoinChoice},{}); else toast('Digite uma aposta válida.');
  });
  document.querySelectorAll('[data-game-roulette-choice]').forEach(x=>x.onclick=()=>{
    const amount=Math.floor(Number((document.querySelector('[data-roulette-amount]')||{}).value||0));
    if(amount>0) doAction('game.roulette',{amount,choice:x.dataset.gameRouletteChoice},{}); else toast('Digite uma aposta válida.');
  });
  document.querySelectorAll('[data-game-rps-choice]').forEach(x=>x.onclick=()=>doAction('game.rps',{choice:x.dataset.gameRpsChoice},{}));
  document.querySelectorAll('[data-game-dungeon]').forEach(x=>x.onclick=()=>doAction('dungeon',{},{}));
  document.querySelectorAll('[data-quiz-start]').forEach(x=>x.onclick=()=>doAction('game.quiz.start',{},{}));
  document.querySelectorAll('[data-quiz-answer]').forEach(x=>x.onclick=()=>{
    const answer=String((document.querySelector('[data-quiz-input]')||{}).value||'').trim();
    if(answer) doAction('game.quiz.answer',{answer},{}); else toast('Digite sua resposta.');
  });
  document.querySelectorAll('[data-number-start]').forEach(x=>x.onclick=()=>doAction('game.number.start',{},{}));
  document.querySelectorAll('[data-number-guess]').forEach(x=>x.onclick=()=>{
    const guess=Math.floor(Number((document.querySelector('[data-number-input]')||{}).value||0));
    if(guess>0) doAction('game.number.guess',{guess},{}); else toast('Digite um número válido.');
  });
  document.querySelectorAll('[data-hangman-start]').forEach(x=>x.onclick=()=>doAction('game.hangman.start',{},{}));
  document.querySelectorAll('[data-hangman-send]').forEach(x=>x.onclick=()=>{
    const value=String((document.querySelector('[data-hangman-input]')||{}).value||'').trim();
    if(!value) return toast('Digite uma letra ou palavra.');
    if(value.length===1) doAction('game.hangman.letter',{letter:value},{});
    else doAction('game.hangman.word',{word:value},{});
  });
  document.querySelectorAll('[data-group-roulette-create]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('Escolha:','vermelho');
    if(amount>0&&choice) doAction('game.groupRoulette.create',{amount,choice},{});
  });
  document.querySelectorAll('[data-group-roulette-join]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('Escolha:','vermelho');
    if(amount>0&&choice) doAction('game.groupRoulette.join',{amount,choice},{});
  });
  document.querySelectorAll('[data-group-roulette-spin]').forEach(x=>x.onclick=()=>doAction('game.groupRoulette.spin',{},{}));
  document.querySelectorAll('[data-tournament-create]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Entrada do torneio:','1000'));
    if(amount>0) doAction('game.tournament.create',{amount},{});
  });
  document.querySelectorAll('[data-tournament-join]').forEach(x=>x.onclick=()=>doAction('game.tournament.join',{},{}));
  document.querySelectorAll('[data-tournament-start]').forEach(x=>x.onclick=()=>doAction('game.tournament.start',{},{}));

  document.querySelectorAll('[data-sleep]').forEach(x=>x.onclick=()=>doAction(x.dataset.sleep==='wake'?'sleep.wake':'sleep.start',{},{}));
  document.querySelectorAll('[data-carpinar]').forEach(x=>x.onclick=()=>{if(x.dataset.carpinar==='leave') doAction('carpinar.leave',{},{});});
  document.querySelectorAll('[data-carpinar-hours]').forEach(x=>x.onclick=()=>doAction('carpinar.start',{hours:Number(x.dataset.carpinarHours)},{}));
  document.querySelectorAll('[data-pet-adventure]').forEach(x=>x.onclick=()=>doAction('pet.adventure',{},{}));
  document.querySelectorAll('[data-pet-expedition]').forEach(x=>x.onclick=()=>{
    const petId=Number((document.querySelector('[data-expedition-pet]')||{}).value||0);
    const hours=Number((document.querySelector('[data-expedition-hours]')||{}).value||0);
    if(!petId) return toast('Escolha o pet da expedição.');
    if(hours>0) doAction('pet.expedition.start',{petId,hours},{});
  });
  document.querySelectorAll('[data-pet-expedition-resolve]').forEach(x=>x.onclick=()=>doAction('pet.expedition.resolve',{},{}));
  document.querySelectorAll('[data-missions-claim]').forEach(x=>x.onclick=()=>doAction('missions.claim',{},{}));
  document.querySelectorAll('[data-level-claim]').forEach(x=>x.onclick=()=>doAction('level.claim',{},{}));
  document.querySelectorAll('[data-group-mission-claim]').forEach(x=>x.onclick=()=>doAction('groupMission.claim',{},{}));
  document.querySelectorAll('[data-group-event-claim]').forEach(x=>x.onclick=()=>doAction('groupEvent.claim',{},{}));
  document.querySelectorAll('[data-clear-result]').forEach(x=>x.onclick=()=>{ui.lastResult=null;render();});
}

// Raid automática agora roda no servidor. Mantemos estes helpers apenas para
// limpar timers antigos de sessões abertas antes desta versão.
function stopRaidAuto(){
  if(ui.raidTimer) clearInterval(ui.raidTimer);
  ui.raidTimer=null; ui.raidLevel=null;
}
function stopBossAuto(){
  if(ui.bossTimer) clearInterval(ui.bossTimer);
  ui.bossTimer=null;
}
function toggleBossAuto(){
  if(ui.bossTimer){stopBossAuto();render();return;}
  const tick=async()=>{
    try{
      const result=await doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{quiet:true,afterSync:false});
      await sync(true);
      animateCombatImpact('boss',result);
      if(!activeBoss()) stopBossAuto();
    }catch{stopBossAuto();render();}
  };
  tick();
  const b=activeBoss();
  const ms=b&&b.event?8000:10000;
  ui.bossTimer=setInterval(tick,ms);
  render();
}

$('#linkForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('#linkError').textContent='';
  try{
    await exchange($('#linkCode').value);
    history.replaceState({},document.title,'/rpg');
    await sync(false);
  }catch(err){ $('#linkError').textContent=err.message; }
});
$('#logoutBtn').onclick=()=>logout(true);
$('#menuBtn').onclick=()=>setMenu(!$('#sidebar').classList.contains('open'));
$('#menuBackdrop').onclick=()=>setMenu(false);
$('#menuBackdrop').addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
document.addEventListener('keydown',e=>{if(e.key==='Escape') setMenu(false);});

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && ui.token) sync(true);
});

setInterval(()=>{
  if(!document.hidden && ui.token && !ui.syncing) sync(true);
},15000);
setInterval(()=>{
  if(!document.hidden && ui.token) refreshLiveCountdowns();
},1000);

(async function boot(){
  renderNav();
  const params=new URLSearchParams(location.search);
  const hashParams=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  const linked=hashParams.get('code') || params.get('link');
  const tokenFromLink=params.get('token');

  if(tokenFromLink){
    ui.token=tokenFromLink;
    localStorage.setItem(TOKEN_KEY,ui.token);
    history.replaceState({},document.title,'/rpg');
  }

  // Um código de !web fica no fragmento (#code=...), invisível para crawlers e previews.
  // Só o navegador executa o POST que consome o código.
  if(linked){
    $('#linkCode').value=linked;
    try{
      await exchange(linked);
      history.replaceState({},document.title,'/rpg');
      await sync(false);
      return;
    }catch(err){
      // Se o aparelho já tem sessão válida, um código antigo/consumido não deve derrubá-la.
      if(ui.token){
        history.replaceState({},document.title,'/rpg');
        showApp();
        await sync(true);
        if(ui.token) return;
      }
      showLogin(err.message+' Gere um novo !web e toque no novo link. O código vale por 30 minutos.');
      return;
    }
  }

  if(ui.token){
    showApp();
    await sync(true);
    if(ui.token) return;
  }

  showLogin();
})();
