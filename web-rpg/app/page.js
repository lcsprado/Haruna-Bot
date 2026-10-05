'use client';

import { useEffect, useMemo, useState } from 'react';

const nf = new Intl.NumberFormat('pt-BR');
const fmt = (n) => nf.format(Math.max(0, Math.round(Number(n) || 0)));
const pct = (v,max) => max ? Math.max(0,Math.min(100,(v/max)*100)) : 0;

const INITIAL = {
  profile: { name:'~LP🍀☘️', level:35, xp:777, xpNext:3500, hp:372, maxHp:372, atk:137, def:87, spd:44, crit:12.5, cash:82450, bank:185000, wins:32, losses:13 },
  equipment: {
    weapon:{id:'eclipse',name:'Espada do Eclipse',icon:'🗡️',level:2,stat:'+59 ATK',rarity:'Épico',category:'weapon'},
    armor:{id:'abissal',name:'Armadura Abissal',icon:'🥋',level:1,stat:'+48 DEF',rarity:'Épico',category:'armor'},
    boots:{id:'vento',name:'Bota do Vento',icon:'👢',level:1,stat:'+4 SPD',rarity:'Incomum',category:'boots'}
  },
  inventory:[
    {id:'tridente',name:'Tridente da Tempestade',icon:'🔱',rarity:'Épico',category:'weapon',level:1,qty:1,stat:'+48 ATK',price:30000},
    {id:'eclipse',name:'Espada do Eclipse',icon:'🗡️',rarity:'Épico',category:'weapon',level:2,qty:1,stat:'+59 ATK',price:42000},
    {id:'abissal',name:'Armadura Abissal',icon:'🥋',rarity:'Épico',category:'armor',level:1,qty:1,stat:'+48 DEF',price:44000},
    {id:'colosso',name:'Armadura do Colosso',icon:'🛡️',rarity:'Evento',category:'armor',level:1,qty:1,stat:'+52 DEF / +140 HP',price:0},
    {id:'vento',name:'Bota do Vento',icon:'👢',rarity:'Incomum',category:'boots',level:1,qty:1,stat:'+4 SPD',price:22000},
    {id:'pocao_p',name:'Poção Pequena',icon:'🧪',rarity:'Comum',category:'consumable',level:1,qty:15,stat:'+35 HP',price:700},
    {id:'pocao_pet_comum',name:'Poção de Pet Comum',icon:'💙',rarity:'Comum',category:'consumable',level:1,qty:4,stat:'+60 HP Pet',price:900},
    {id:'pocao_pet_rara',name:'Poção de Pet Rara',icon:'💙',rarity:'Raro',category:'consumable',level:1,qty:6,stat:'+160 HP Pet',price:2400},
    {id:'raid10',name:'Chave de Raid Lv.10',icon:'🗝️',rarity:'Incomum',category:'special',level:1,qty:1,stat:'Abre Raid Lv.10',price:10000},
    {id:'raid15',name:'Chave de Raid Lv.15',icon:'🗝️',rarity:'Incomum',category:'special',level:1,qty:1,stat:'Abre Raid Lv.15',price:16000},
    {id:'raid20',name:'Chave de Raid Lv.20',icon:'🗝️',rarity:'Raro',category:'special',level:1,qty:1,stat:'Abre Raid Lv.20',price:25000},
    {id:'raid25',name:'Chave de Raid Lv.25',icon:'🗝️',rarity:'Raro',category:'special',level:1,qty:1,stat:'Abre Raid Lv.25',price:40000},
    {id:'raid30',name:'Chave de Raid Lv.30',icon:'🗝️',rarity:'Épico',category:'special',level:1,qty:2,stat:'Abre Raid Lv.30',price:60000},
    {id:'raid40',name:'Chave de Raid Lv.40',icon:'🗝️',rarity:'Épico',category:'special',level:1,qty:1,stat:'Abre Raid Lv.40',price:100000},
    {id:'raid50',name:'Chave de Raid Lv.50',icon:'🗝️',rarity:'Lendário',category:'special',level:1,qty:1,stat:'Abre Raid Lv.50',price:160000}
  ],
  pets:[
    {id:1,name:'Kitsune',species:'kitsune',icon:'🦊',level:27,hp:392,maxHp:430,energy:86,maxEnergy:120,style:'Astúcia',bonus:'+7,5% CRIT'},
    {id:2,name:'Dragão Vulcânico',species:'dragao_vulcanico',icon:'🐉',level:20,hp:510,maxHp:510,energy:76,maxEnergy:110,style:'Voador',bonus:'+ATK Boss/Raid'},
    {id:3,name:'Águia',species:'aguia',icon:'🦅',level:14,hp:250,maxHp:280,energy:94,maxEnergy:105,style:'Voador',bonus:'+SPD'},
    {id:4,name:'Tartaruga',species:'tartaruga',icon:'🐢',level:12,hp:390,maxHp:390,energy:100,maxEnergy:100,style:'Guardião',bonus:'+DEF'}
  ],
  petTeam:[1,2,3],
  raid:{level:30,name:'Rei Abissal',icon:'👹',hp:98000,maxHp:98000,atk:55,myDamage:0,started:false},
  boss:{name:'Colosso do Cerco',icon:'🗿',hp:193418,maxHp:193418,atk:26,myDamage:0},
  businesses:[
    {id:1,name:'Loja de Bairro',icon:'🏪',level:3,stored:2840,rate:420},
    {id:2,name:'Oficina Alpha',icon:'🔧',level:2,stored:4950,rate:760}
  ],
  missions:[
    {id:1,title:'Trabalhe 3 vezes',progress:1,target:3,reward:'R$ 2.500 + 80 XP',claimed:false},
    {id:2,title:'Cause 10.000 de dano',progress:4200,target:10000,reward:'Caixa Rara',claimed:false},
    {id:3,title:'Faça 1 Raid',progress:0,target:1,reward:'150 XP de Pet',claimed:false}
  ],
  market:[
    {id:101,seller:'João',item:'Manto Rúnico',icon:'🧥',price:72000,left:'43 min',bought:false},
    {id:102,seller:'Guto',item:'Caixa Épica',icon:'📦',price:39000,left:'51 min',bought:false}
  ],
  log:['Protótipo Alpha RPG Web iniciado.']
};

const tabs = [
  ['home','🏠','Início'],['raid','👹','Raid'],['boss','🗿','Boss'],['duel','⚔️','Duelo'],
  ['petduel','🐾','Duelo Pet'],['pets','🐉','Pets'],['items','🎒','Itens'],['business','🏢','Negócios'],
  ['jobs','🛵','Trabalhos'],['bank','🏦','Banco'],['market','🛒','Mercado'],['missions','📜','Missões']
];

const RAIDS = [
  {level:10,name:'Guardião de Pedra',icon:'🪨',hp:13000,atk:15,keyPrice:10000,cashPool:20000,xpPool:1200,petXpPool:120,duration:12,minPlayers:1,material:{id:'nucleo_pedra',name:'Fragmento do Núcleo de Pedra',icon:'🪨'},box:null,gear:null,gearChance:0},
  {level:15,name:'Dragão Vulcânico',icon:'🐲',hp:24000,atk:23,keyPrice:16000,cashPool:35000,xpPool:1800,petXpPool:180,duration:15,minPlayers:2,material:{id:'escama_vulcanica',name:'Escama Vulcânica',icon:'🔥'},box:'caixa_sorte',gear:['foice_carmesim','manto_fenix'],gearChance:.015},
  {level:20,name:'Devorador Abissal',icon:'👁️',hp:39000,atk:33,keyPrice:25000,cashPool:55000,xpPool:2600,petXpPool:260,duration:18,minPlayers:2,material:{id:'olho_abissal',name:'Olho Abissal',icon:'👁️'},box:'caixa_rara',gear:['lanca_solar','couraca_vulcanica'],gearChance:.0175},
  {level:25,name:'Titã de Ferro',icon:'🦾',hp:63000,atk:43,keyPrice:40000,cashPool:80000,xpPool:3600,petXpPool:360,duration:22,minPlayers:2,material:{id:'nucleo_titan',name:'Núcleo do Titã',icon:'⚙️'},box:'caixa_rara',gear:['garras_vazio','armadura_vazio'],gearChance:.02},
  {level:30,name:'Rei Abissal',icon:'👹',hp:98000,atk:55,keyPrice:60000,cashPool:120000,xpPool:5000,petXpPool:500,duration:30,minPlayers:2,material:{id:'essencia_rei_abissal',name:'Essência do Rei Abissal',icon:'🌑'},box:'caixa_epica',gear:['espada_eclipse','armadura_eclipse'],gearChance:.025},
  {level:40,name:'Serafim Caído',icon:'🪽',hp:170000,atk:77,keyPrice:100000,cashPool:200000,xpPool:7500,petXpPool:750,duration:40,minPlayers:2,material:{id:'fragmento_celestial',name:'Fragmento Celestial',icon:'✨'},box:'caixa_epica',gear:['excalibur','armadura_titan'],gearChance:.008},
  {level:50,name:'Alpha Corrompido',icon:'☠️',hp:290000,atk:108,keyPrice:160000,cashPool:350000,xpPool:11000,petXpPool:1100,duration:50,minPlayers:2,material:{id:'nucleo_alpha_corrompido',name:'Núcleo Alpha Corrompido',icon:'☠️'},box:'caixa_epica',gear:['katana_divina','armadura_divina'],gearChance:.005}
];

const REWARD_ITEMS = {
  caixa_sorte:{id:'caixa_sorte',name:'Caixa da Sorte',icon:'🎁',rarity:'Comum',category:'special',level:1,stat:'Pode conter dinheiro, EXP ou itens.',price:3000},
  caixa_rara:{id:'caixa_rara',name:'Caixa Rara',icon:'🎁',rarity:'Raro',category:'special',level:1,stat:'Item garantido no mínimo Incomum.',price:12000},
  caixa_epica:{id:'caixa_epica',name:'Caixa Épica',icon:'🎁',rarity:'Épico',category:'special',level:1,stat:'Item garantido no mínimo Raro.',price:35000},
  foice_carmesim:{id:'foice_carmesim',name:'Foice Carmesim',icon:'🪓',rarity:'Épico',category:'weapon',level:1,stat:'+43 ATK',price:72000},
  manto_fenix:{id:'manto_fenix',name:'Manto da Fênix',icon:'🧥',rarity:'Épico',category:'armor',level:1,stat:'+43 DEF',price:78000},
  lanca_solar:{id:'lanca_solar',name:'Lança Solar',icon:'🔱',rarity:'Épico',category:'weapon',level:1,stat:'+46 ATK',price:85000},
  couraca_vulcanica:{id:'couraca_vulcanica',name:'Couraça Vulcânica',icon:'🛡️',rarity:'Épico',category:'armor',level:1,stat:'+46 DEF',price:92000},
  garras_vazio:{id:'garras_vazio',name:'Garras do Vazio',icon:'🗡️',rarity:'Épico',category:'weapon',level:1,stat:'+51 ATK',price:115000},
  armadura_vazio:{id:'armadura_vazio',name:'Armadura do Vazio',icon:'🥋',rarity:'Épico',category:'armor',level:1,stat:'+51 DEF',price:125000},
  espada_eclipse:{id:'espada_eclipse',name:'Espada do Eclipse',icon:'🗡️',rarity:'Épico',category:'weapon',level:1,stat:'+54 ATK',price:132000},
  armadura_eclipse:{id:'armadura_eclipse',name:'Armadura do Eclipse',icon:'🥋',rarity:'Épico',category:'armor',level:1,stat:'+54 DEF',price:145000},
  excalibur:{id:'excalibur',name:'Excalibur',icon:'⚔️',rarity:'Lendário',category:'weapon',level:1,stat:'+85 ATK / +2% CRIT',price:0},
  armadura_titan:{id:'armadura_titan',name:'Armadura do Titã',icon:'🛡️',rarity:'Lendário',category:'armor',level:1,stat:'+85 DEF / +110 HP',price:0},
  katana_divina:{id:'katana_divina',name:'Katana Divina',icon:'🗡️',rarity:'Lendário',category:'weapon',level:1,stat:'+95 ATK / +3% CRIT',price:0},
  armadura_divina:{id:'armadura_divina',name:'Armadura Divina',icon:'👑',rarity:'Lendário',category:'armor',level:1,stat:'+95 DEF / +140 HP / +1% CRIT',price:0},
  colete_vital:{id:'colete_vital',name:'Colete Vital',icon:'🦺',rarity:'Raro',category:'armor',level:1,stat:'+18 DEF / +60 HP',price:0},
  armadura_colosso:{id:'armadura_colosso',name:'Armadura do Colosso',icon:'🛡️',rarity:'Evento',category:'armor',level:1,stat:'+52 DEF / +140 HP / +4% CRIT',price:0}
};

const PET_REWARD_BASE={
  papagaio:{xp:.05},hamster:{drop:.025},coruja:{xp:.08},unicornio:{drop:.04},
  golfinho_celestial:{xp:.04},polvo_arcano:{drop:.03},baleia_colossal:{xp:.04},
  golem_ancestral:{drop:.02,raid:true},colosso_cristal:{drop:.04,raid:true},
  fenix_fogo:{xp:.05,raid:true},corvo_abissal:{drop:.03,raid:true},fenix_gelo:{xp:.06,raid:true},
  guardiao_obsidiana:{drop:.035,raid:true},tigre_lunar:{drop:.03,raid:true},imperador_abissal:{drop:.04,raid:true},
  leao_solar:{xp:.05,raid:true},grifo_celestial:{drop:.04,raid:true},fenix_celestial:{xp:.08,raid:true},
  serpente_cosmica:{drop:.06,xp:.08,raid:true},fenix_alpha:{drop:.07,xp:.08,raid:true}
};

const SHOP_ITEMS = [
  {id:'pocao_p',name:'Poção Pequena',icon:'🧪',rarity:'Comum',category:'consumable',level:1,stat:'+35 HP',price:700,shopGroup:'Cura'},
  {id:'pocao_m',name:'Poção Média',icon:'🧪',rarity:'Incomum',category:'consumable',level:1,stat:'+80 HP',price:1800,shopGroup:'Cura'},
  {id:'pocao_g',name:'Poção Grande',icon:'🧪',rarity:'Raro',category:'consumable',level:1,stat:'+160 HP',price:4200,shopGroup:'Cura'},
  {id:'pocao_pet_comum',name:'Poção de Pet Comum',icon:'💙',rarity:'Comum',category:'consumable',level:1,stat:'+60 HP Pet',price:900,shopGroup:'Pet'},
  {id:'pocao_pet_rara',name:'Poção de Pet Rara',icon:'💙',rarity:'Raro',category:'consumable',level:1,stat:'+160 HP Pet',price:2400,shopGroup:'Pet'},
  {id:'pocao_pet_epica',name:'Poção de Pet Épica',icon:'💜',rarity:'Épico',category:'consumable',level:1,stat:'+320 HP Pet',price:6000,shopGroup:'Pet'},
  {id:'raid10',name:'Chave de Raid Lv.10',icon:'🗝️',rarity:'Incomum',category:'special',level:1,stat:'Abre Raid Lv.10',price:10000,shopGroup:'Raid'},
  {id:'raid15',name:'Chave de Raid Lv.15',icon:'🗝️',rarity:'Incomum',category:'special',level:1,stat:'Abre Raid Lv.15',price:16000,shopGroup:'Raid'},
  {id:'raid20',name:'Chave de Raid Lv.20',icon:'🗝️',rarity:'Raro',category:'special',level:1,stat:'Abre Raid Lv.20',price:25000,shopGroup:'Raid'},
  {id:'raid25',name:'Chave de Raid Lv.25',icon:'🗝️',rarity:'Raro',category:'special',level:1,stat:'Abre Raid Lv.25',price:40000,shopGroup:'Raid'},
  {id:'raid30',name:'Chave de Raid Lv.30',icon:'🗝️',rarity:'Épico',category:'special',level:1,stat:'Abre Raid Lv.30',price:60000,shopGroup:'Raid'},
  {id:'raid40',name:'Chave de Raid Lv.40',icon:'🗝️',rarity:'Épico',category:'special',level:1,stat:'Abre Raid Lv.40',price:100000,shopGroup:'Raid'},
  {id:'raid50',name:'Chave de Raid Lv.50',icon:'🗝️',rarity:'Lendário',category:'special',level:1,stat:'Abre Raid Lv.50',price:160000,shopGroup:'Raid'},
  {id:'espada_ferro_loja',name:'Espada de Ferro',icon:'⚔️',rarity:'Incomum',category:'weapon',level:1,stat:'+24 ATK',price:12000,shopGroup:'Equipamento'},
  {id:'armadura_aco_loja',name:'Armadura de Aço',icon:'🛡️',rarity:'Raro',category:'armor',level:1,stat:'+30 DEF',price:18000,shopGroup:'Equipamento'},
  {id:'botas_agilidade_loja',name:'Botas da Agilidade',icon:'🥾',rarity:'Raro',category:'boots',level:1,stat:'+8 SPD',price:15000,shopGroup:'Equipamento'}
];

function Bar({value,max,tone='hp'}) {
  return <div className={'bar '+tone}><span style={{width:pct(value,max)+'%'}} /></div>;
}
function Card({children,className=''}) { return <div className={'card '+className}>{children}</div>; }
function Button({children,onClick,kind='primary',disabled=false}) { return <button className={'btn '+kind} onClick={onClick} disabled={disabled}>{children}</button>; }
function Stat({icon,label,value}) { return <div className="stat"><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>; }

export default function Game(){
  const [tab,setTab]=useState('home');
  const [game,setGame]=useState(INITIAL);
  const [loaded,setLoaded]=useState(false);
  const [toast,setToast]=useState('');
  const [bankAmount,setBankAmount]=useState(10000);
  const [autoRaid,setAutoRaid]=useState(false);
  const [raidUsePet,setRaidUsePet]=useState(true);
  const [autoBoss,setAutoBoss]=useState(false);
  const [bossUsePet,setBossUsePet]=useState(true);
  const [autoDuel,setAutoDuel]=useState(false);
  const [autoPetDuel,setAutoPetDuel]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [duelBattle,setDuelBattle]=useState({player:null,pet:null});
  const [rewardReveal,setRewardReveal]=useState(null);
  const [combatFx,setCombatFx]=useState({
    raidHit:false,raidDamage:null,raidCrit:false,
    bossHit:false,bossDamage:null,bossCrit:false,playerHit:false,
    duelEnemyHit:false,duelPlayerHit:false,duelDamage:null,duelReceived:null,
    healText:null,equipSlot:null
  });

  useEffect(()=>{
    try{
      const saved=localStorage.getItem('alpha-web-rpg-v1');
      if(saved) setGame(JSON.parse(saved));
    }catch{}
    setLoaded(true);
  },[]);

  useEffect(()=>{
    if(loaded) localStorage.setItem('alpha-web-rpg-v1',JSON.stringify(game));
  },[game,loaded]);

  const p=game.profile;
  const playerPotionQty=game.inventory
    .filter(i=>['pocao_p','pocao_m','pocao_g','elixir_supremo'].includes(i.id))
    .reduce((sum,i)=>sum+Number(i.qty||0),0);
  const activePet=game.pets.find(x=>x.id===game.petTeam[0]) || game.pets[0];
  const reservePet=game.pets.find(x=>x.id===game.petTeam[2]) || null;
  const bossPet=(activePet.hp>0&&activePet.energy>=2)?activePet:(reservePet&&reservePet.hp>0&&reservePet.energy>=2?reservePet:activePet);

  const synergy=useMemo(()=>{
    const team=game.petTeam.map(id=>game.pets.find(x=>x.id===id)).filter(Boolean);
    if(team.length!==3) return 'Sem sinergia ativa';
    const styles=team.map(x=>x.style);
    if(styles.every(s=>s==='Voador')) return '🪽 Esquadrão Aéreo — +3% ATK';
    if(styles.every(s=>s==='Guardião')) return '🛡️ Muralha Viva — +4% DEF';
    if(styles.every(s=>s==='Predador')) return '🐾 Caçada Coordenada — +2% ATK +2% CRIT';
    return '🐾 Time completo — bônus individuais ativos';
  },[game.petTeam,game.pets]);

  function notify(msg){ setToast(msg); window.setTimeout(()=>setToast(''),2200); }
  function withLog(g,msg){ return {...g,log:[msg,...g.log].slice(0,8)}; }
  function fx(patch,clearPatch,duration=520){
    setCombatFx(v=>({...v,...patch}));
    window.setTimeout(()=>setCombatFx(v=>({...v,...clearPatch})),duration);
  }
  function rarityClass(rarity=''){
    const r=String(rarity).toLowerCase();
    if(r.includes('lend')) return 'rarity-legendary';
    if(r.includes('evento')) return 'rarity-event';
    if(r.includes('ép')||r.includes('ep')) return 'rarity-epic';
    if(r.includes('raro')) return 'rarity-rare';
    return '';
  }

  function rarityScore(rarity=''){
    const r=String(rarity).toLowerCase();
    if(r.includes('lend')) return 5;
    if(r.includes('evento')) return 4;
    if(r.includes('ép')||r.includes('ep')) return 3;
    if(r.includes('raro')) return 2;
    if(r.includes('incomum')) return 1;
    return 0;
  }

  function rewardTone(rewards=[]){
    const best=rewards.reduce((a,r)=>rarityScore(r.rarity)>rarityScore(a.rarity)?r:a,{rarity:'Comum'});
    const s=rarityScore(best.rarity);
    return s>=5?'legendary':String(best.rarity||'').toLowerCase().includes('evento')?'event':s>=3?'epic':s>=2?'rare':'common';
  }

  function rewardArtClass(r){
    if(r.type==='cash') return 'art-cash';
    if(r.type==='xp') return 'art-xp';
    if(r.type==='petxp') return 'art-petxp';
    const id=String(r.id||'');
    if(id.includes('chave')) return 'art-key';
    if(id.includes('pocao')||id.includes('elixir')) return 'art-potion';
    if(r.inventoryItem?.category==='armor') return 'art-armor';
    return '';
  }

  function showRewards(source,title,rewards,subtitle='Recompensas recebidas'){
    const clean=(rewards||[]).filter(Boolean);
    const tone=rewardTone(clean);
    setRewardReveal({id:Date.now(),source,title,subtitle,rewards:clean,tone});
    if(tone==='legendary'&&typeof navigator!=='undefined'&&navigator.vibrate){
      navigator.vibrate([90,45,130,45,180]);
    }
  }

  function addInventory(inv,item,qty=1){
    if(!item||qty<=0) return inv;
    const found=inv.find(x=>x.id===item.id);
    if(found) return inv.map(x=>x.id===item.id?{...x,qty:Number(x.qty||0)+qty}:x);
    return [...inv,{...item,qty}];
  }

  function petRewardBonus(pet){
    const base=PET_REWARD_BASE[pet?.species]||{};
    const raid=Boolean(base.raid);
    const maxGrowth=raid?.25:.50;
    const scale=1+Math.min(maxGrowth,Math.max(0,Number(pet?.level||1)-1)*(maxGrowth/99));
    const cap=raid?.15:.10;
    const scaled=k=>Math.min(cap,Number(base[k]||0)*scale);
    return {xp:scaled('xp'),drop:scaled('drop')};
  }

  function grantLocalPetTeamXp(pets,team,baseGain){
    const weights=[1,.60,.35];
    const ids=team||[];
    return pets.map(pet=>{
      const slot=ids.indexOf(pet.id);
      if(slot<0) return pet;
      const gain=Math.max(1,Math.floor(baseGain*weights[slot]));
      const oldXp=Number(pet.xp ?? Math.max(0,(Number(pet.level||1)-1)*100));
      const rawXp=oldXp+gain;
      const level=Math.min(100,1+Math.floor(rawXp/100));
      return {...pet,xp:level>=100?9900:rawXp,level};
    });
  }

  function buildRaidRewards(cfg,petUsed){
    const pb=petRewardBonus(activePet);
    const share=1;
    const cash=Math.max(250,Math.floor(cfg.keyPrice*1.08)+Math.floor(cfg.cashPool*(.04+.12*share)));
    const exp=Math.max(20,Math.floor(cfg.xpPool*(.10+.90*share)*(1+Number(pb.xp||0))));
    const petXp=petUsed?Math.max(5,Math.floor(cfg.petXpPool*(.15+.85*share))):0;
    const rewards=[
      {type:'cash',name:'Dinheiro',icon:'🪙',value:'R$ '+fmt(cash),amount:cash,rarity:'Comum'},
      {type:'xp',name:'Experiência',icon:'✨',value:'+'+fmt(exp)+' XP',amount:exp,rarity:'Comum'}
    ];
    if(petXp) rewards.push({type:'petxp',name:'XP de Pet',icon:'🐾',value:'+'+fmt(petXp)+' XP',amount:petXp,rarity:'Incomum'});

    const materialQty=cfg.level===10?3:2;
    rewards.push({type:'item',id:cfg.material.id,name:cfg.material.name,icon:cfg.material.icon,value:'+'+materialQty,qty:materialQty,rarity:'Incomum',inventoryItem:{id:cfg.material.id,name:cfg.material.name,icon:cfg.material.icon,rarity:'Incomum',category:'special',level:1,stat:'Material de invocação de Raid',price:0}});

    if(cfg.box){
      const boxChance=cfg.level>=30?Math.min(.65,.55+Number(pb.drop||0)*.50):.35;
      if(Math.random()<boxChance){
        const box=REWARD_ITEMS[cfg.box];
        rewards.push({type:'item',id:box.id,name:box.name,icon:box.icon,value:'+1',qty:1,rarity:box.rarity,inventoryItem:box});
      }
    }

    if(Array.isArray(cfg.gear)&&cfg.gear.length){
      const rankBonus=cfg.level>=40?.003:.005;
      const collaborationBonus=.004;
      const petDropBonus=Math.min(.008,Number(pb.drop||0)*.10);
      const chance=Math.min(.08,Number(cfg.gearChance||0)+rankBonus+collaborationBonus+petDropBonus);
      if(Math.random()<chance){
        const gearId=cfg.gear[Math.floor(Math.random()*cfg.gear.length)];
        const gear=REWARD_ITEMS[gearId];
        if(gear) rewards.push({type:'item',id:gear.id,name:gear.name,icon:gear.icon,value:'+1',qty:1,rarity:gear.rarity,detail:gear.stat,inventoryItem:gear});
      }
    }
    return {cash,exp,petXp,rewards};
  }

  function buildSiegeRewards(totalDamage=game.boss.myDamage){
    const pb=petRewardBonus(activePet);
    const cash=28000;
    const exp=Math.round(Math.floor((700+3500+900)*(1+Number(pb.xp||0))));
    const petXp=Math.round(180+700+180);
    const rewards=[
      {type:'cash',name:'Dinheiro',icon:'🪙',value:'R$ '+fmt(cash),amount:cash,rarity:'Comum'},
      {type:'xp',name:'Experiência',icon:'✨',value:'+'+fmt(exp)+' XP',amount:exp,rarity:'Comum'},
      {type:'petxp',name:'XP de Pet',icon:'🐾',value:'+'+fmt(petXp)+' XP',amount:petXp,rarity:'Incomum'}
    ];
    if(totalDamage>=1500&&Math.random()<.35){
      const item=REWARD_ITEMS.colete_vital;
      rewards.push({type:'item',id:item.id,name:item.name,icon:item.icon,value:'+1',qty:1,rarity:item.rarity,detail:item.stat,inventoryItem:item});
    }
    const eventItem=REWARD_ITEMS.armadura_colosso;
    rewards.push({type:'item',id:eventItem.id,name:eventItem.name,icon:eventItem.icon,value:'+1',qty:1,rarity:eventItem.rarity,detail:eventItem.stat,inventoryItem:eventItem});
    const box=REWARD_ITEMS.caixa_rara;
    rewards.push({type:'item',id:box.id,name:'Caixa Rara — Cerco',icon:box.icon,value:'+1',qty:1,rarity:box.rarity,inventoryItem:box});
    return {cash,exp,petXp,rewards};
  }

  function selectRaid(level){
    setAutoRaid(false);
    const raid=RAIDS.find(x=>x.level===level);
    if(!raid) return;
    setGame(g=>({...g,raid:{level:raid.level,name:raid.name,icon:raid.icon,hp:raid.hp,maxHp:raid.hp,atk:raid.atk,myDamage:0,started:false,petTurns:0}}));
    notify('Raid Lv.'+level+' selecionada.');
  }

  function attackRaid(usePet=true,silent=false){
    if(game.raid.hp<=0){
      setAutoRaid(false);
      if(!silent) notify('A Raid já foi concluída.');
      return;
    }
    const keyId='raid'+game.raid.level;
    const key=game.inventory.find(i=>i.id===keyId);
    if(!game.raid.started && (!key || key.qty<1)){
      setAutoRaid(false);
      if(!silent) notify('Você não possui a chave desta Raid.');
      return;
    }

    const cfg=RAIDS.find(x=>x.level===game.raid.level)||RAIDS[0];
    const petActive=Boolean(usePet&&activePet.energy>=2&&activePet.hp>0);
    const crit=Math.random()<p.crit/100;
    const dmg=Math.round(p.atk*(7.5+Math.random()*3)*(petActive?1.075:1)*(crit?1.85:1));
    const willWin=game.raid.hp-dmg<=0;
    const petUsed=Number(game.raid.petTurns||0)+(petActive?1:0)>0;
    const rewardPack=willWin?buildRaidRewards(cfg,petUsed):null;

    fx({raidHit:true,raidDamage:dmg,raidCrit:crit},{raidHit:false,raidDamage:null,raidCrit:false},620);

    setGame(g=>{
      const nextHp=Math.max(0,g.raid.hp-dmg);
      let inventory=g.raid.started ? g.inventory : g.inventory.map(i=>i.id===('raid'+g.raid.level)?{...i,qty:Math.max(0,i.qty-1)}:i);
      let pets=petActive?g.pets.map(x=>x.id===g.petTeam[0]?{...x,energy:Math.max(0,x.energy-2)}:x):g.pets;
      let out={
        ...g,
        raid:{...g.raid,hp:nextHp,myDamage:g.raid.myDamage+dmg,started:true,petTurns:Number(g.raid.petTurns||0)+(petActive?1:0)},
        inventory,
        pets,
        missions:g.missions.map(m=>m.id===2?{...m,progress:Math.min(m.target,m.progress+dmg)}:m)
      };

      if(nextHp===0&&rewardPack){
        for(const r of rewardPack.rewards){
          if(r.inventoryItem) out.inventory=addInventory(out.inventory,r.inventoryItem,Number(r.qty||1));
        }
        out.profile={...out.profile,cash:out.profile.cash+rewardPack.cash,xp:out.profile.xp+rewardPack.exp};
        if(rewardPack.petXp) out.pets=grantLocalPetTeamXp(out.pets,out.petTeam,rewardPack.petXp);
        out.missions=out.missions.map(m=>m.id===3?{...m,progress:1}:m);
        return withLog(out,'🏆 Raid Lv.'+g.raid.level+' concluída — recompensas recebidas.');
      }
      return withLog(out,(crit?'💥 CRÍTICO! ':'⚔️ ')+fmt(dmg)+' de dano na Raid'+(usePet?'':' · sem pet')+'.');
    });

    if(willWin&&rewardPack){
      setAutoRaid(false);
      window.setTimeout(()=>showRewards('raid','RECOMPENSAS DA RAID',rewardPack.rewards,'Raid Lv.'+cfg.level+' · '+cfg.name+' derrotado'),180);
    }
    if(!silent&&!willWin) notify((crit?'CRÍTICO — ':'')+fmt(dmg)+' de dano');
  }

  function attackBoss(usePet=true,silent=false){
    if(game.boss.hp<=0) return notify('Boss já derrotado.');
    if(p.hp<=0) return notify('Você está sem HP. Cure-se antes de atacar.');

    const petActive=Boolean(usePet&&bossPet&&bossPet.energy>=2&&bossPet.hp>0);
    const critChance=p.crit+(petActive&&bossPet.species==='kitsune'?7.5:0);
    const crit=Math.random()<critChance/100;
    const rawBase=Math.max(5,Math.floor(p.atk*(.85+Math.random()*.45)));
    const dmg=Math.max(5,Math.floor(rawBase*(petActive?1.075:1)*(crit?1.5:1)));
    const bossWillWin=game.boss.hp-dmg<=0;
    const bossRewardPack=bossWillWin?buildSiegeRewards(game.boss.myDamage+dmg):null;

    fx({bossHit:true,bossDamage:dmg,bossCrit:crit},{bossHit:false,bossDamage:null,bossCrit:false},620);
    if(game.boss.hp-dmg>0){
      window.setTimeout(()=>fx({playerHit:true},{playerHit:false},360),230);
    }

    setGame(g=>{
      const nextBossHp=Math.max(0,g.boss.hp-dmg);
      let profile={...g.profile};
      let pets=[...g.pets];
      let inventory=[...g.inventory];
      let petEvent='';
      let playerEvent='';

      if(petActive){
        pets=pets.map(x=>x.id===bossPet.id?{...x,energy:Math.max(0,x.energy-2)}:x);
      }

      if(nextBossHp>0){
        const bossCritical=Math.random()<.05;
        const bossDamage=Math.max(1,Math.round((Number(g.boss.atk||26)-g.profile.def*.22)*(.8+Math.random()*.4)*(bossCritical?1.5:1)));
        profile.hp=Math.max(0,profile.hp-bossDamage);
        playerEvent=' · Boss causou '+fmt(bossDamage)+(bossCritical?' CRÍTICO':'')+' em você';

        if(petActive){
          const current=pets.find(x=>x.id===bossPet.id);
          if(current){
            const petTaken=Math.max(1,Math.round(Number(g.boss.atk||26)*(.30+Math.random()*.22)));
            let petHp=Math.max(0,current.hp-petTaken);
            petEvent=' · '+current.name+' sofreu '+fmt(petTaken);

            const maxHp=current.maxHp;
            const shouldAutoHeal=petHp>0&&maxHp>0&&petHp/maxHp<.35;
            if(shouldAutoHeal){
              const defs=[
                {id:'pocao_pet_comum',heal:60,name:'Poção de Pet Comum'},
                {id:'pocao_pet_rara',heal:160,name:'Poção de Pet Rara'},
                {id:'pocao_pet_epica',heal:320,name:'Poção de Pet Épica'},
                {id:'pocao_pet_suprema',heal:800,name:'Poção de Pet Suprema'}
              ];
              const missing=Math.max(1,maxHp-petHp);
              const available=defs.filter(d=>Number(inventory.find(i=>i.id===d.id)?.qty||0)>0);
              const chosen=available.find(d=>d.heal>=missing)||available[available.length-1];
              if(chosen){
                petHp=Math.min(maxHp,petHp+chosen.heal);
                inventory=inventory.map(i=>i.id===chosen.id?{...i,qty:i.qty-1}:i);
                petEvent+=' · auto: '+chosen.name+' → '+petHp+'/'+maxHp+' HP';
              }
            }

            pets=pets.map(x=>x.id===current.id?{...x,hp:petHp}:x);
            if(petHp<=0&&current.id===g.petTeam[0]){
              const reserve=pets.find(x=>x.id===g.petTeam[2]);
              if(reserve&&reserve.hp>0&&reserve.energy>=2) petEvent+=' · Reserva '+reserve.name+' entra no próximo ataque';
            }
          }
        }

        const playerPotionDefs=[
          {id:'pocao_p',heal:35,name:'Poção Pequena'},
          {id:'pocao_m',heal:80,name:'Poção Média'},
          {id:'pocao_g',heal:160,name:'Poção Grande'},
          {id:'elixir_supremo',heal:999999,name:'Elixir Supremo'}
        ];
        const playerNeedsHeal=profile.hp<=0 || (profile.maxHp>0&&profile.hp/profile.maxHp<.35);
        if(playerNeedsHeal){
          const missing=Math.max(1,profile.maxHp-profile.hp);
          const available=playerPotionDefs.filter(d=>Number(inventory.find(i=>i.id===d.id)?.qty||0)>0);
          const chosen=available.find(d=>d.heal>=missing)||available[available.length-1];
          if(chosen){
            profile.hp=Math.min(profile.maxHp,Math.max(0,profile.hp)+chosen.heal);
            inventory=inventory.map(i=>i.id===chosen.id?{...i,qty:i.qty-1}:i);
            playerEvent+=' · auto: '+chosen.name+' → '+profile.hp+'/'+profile.maxHp+' HP';
          }
        }
      }

      let out={
        ...g,
        profile,
        pets,
        inventory,
        boss:{...g.boss,hp:nextBossHp,myDamage:g.boss.myDamage+dmg}
      };
      if(nextBossHp===0&&bossRewardPack){
        for(const r of bossRewardPack.rewards){
          if(r.inventoryItem) out.inventory=addInventory(out.inventory,r.inventoryItem,Number(r.qty||1));
        }
        out.profile={...out.profile,cash:out.profile.cash+bossRewardPack.cash,xp:out.profile.xp+bossRewardPack.exp};
        out.pets=grantLocalPetTeamXp(out.pets,out.petTeam,bossRewardPack.petXp);
        return withLog(out,'🏆 Colosso do Cerco derrotado — recompensas recebidas.');
      }
      return withLog(out,(crit?'💥 CRÍTICO! ':'🗿 ')+fmt(dmg)+' de dano no Boss'+(usePet?'':' · sem pet')+playerEvent+petEvent+'.');
    });
    if(bossWillWin&&bossRewardPack){
      setAutoBoss(false);
      window.setTimeout(()=>showRewards('boss','RECOMPENSAS DO BOSS',bossRewardPack.rewards,'Colosso do Cerco derrotado'),180);
    }
    if(!silent&&!bossWillWin) notify(fmt(dmg)+' de dano no Boss');
  }

  function startDuel(pet=false){
    const key=pet?'pet':'player';
    const mineMax=pet?activePet.maxHp:p.maxHp;
    const mineHp=pet?activePet.hp:p.hp;
    if(mineHp<=0) return notify(pet?'Seu pet está sem HP.':'Você está sem HP.');
    if(pet&&activePet.energy<2) return notify('Seu pet está sem energia suficiente.');
    const enemyMax=Math.max(120,Math.round(mineMax*(.82+Math.random()*.34)));
    const enemyAtk=pet
      ? Math.max(12,Math.round((activePet.level*3+18)*(.9+Math.random()*.25)))
      : Math.max(18,Math.round(p.atk*(.72+Math.random()*.20)));
    const battle={
      active:true,round:0,
      enemyName:pet?'Lobo de Arena':'Rival Alpha',
      enemyIcon:pet?'🐺':'🥷',
      myHp:mineHp,myMaxHp:mineMax,
      enemyHp:enemyMax,enemyMaxHp:enemyMax,
      enemyAtk,last:'Combate iniciado.'
    };
    setDuelBattle(d=>({...d,[key]:battle}));
    notify((pet?'Duelo Pet':'Duelo')+' iniciado.');
  }

  function duelTurn(pet=false,silent=false){
    const key=pet?'pet':'player';
    const battle=duelBattle[key];
    if(!battle?.active){
      startDuel(pet);
      return;
    }

    const attackBase=pet
      ? Math.max(10,Math.round(activePet.level*4+activePet.energy*.12))
      : Math.max(12,p.atk);
    const critChance=pet?Math.min(.25,.05+activePet.level/800):Math.min(.40,p.crit/100);
    const crit=Math.random()<critChance;
    const damage=Math.max(5,Math.round(attackBase*(.72+Math.random()*.42)*(crit?1.5:1)));
    const enemyAfter=Math.max(0,battle.enemyHp-damage);
    fx({duelEnemyHit:true,duelDamage:damage},{duelEnemyHit:false,duelDamage:null},560);

    if(enemyAfter<=0){
      const xp=pet?45:65;
      setDuelBattle(d=>({...d,[key]:{...battle,enemyHp:0,round:battle.round+1,active:false,last:(crit?'CRÍTICO! ':'')+fmt(damage)+' de dano. Vitória!'}}));
      setGame(g=>withLog({
        ...g,
        profile:{...g.profile,wins:g.profile.wins+1,xp:g.profile.xp+xp},
        pets:pet?g.pets.map(x=>x.id===g.petTeam[0]?{...x,energy:Math.max(0,x.energy-2)}:x):g.pets
      },(pet?'🐾':'⚔️')+' Vitória no '+(pet?'Duelo Pet':'Duelo')+'. +'+xp+' XP.'));
      if(pet) setAutoPetDuel(false); else setAutoDuel(false);
      window.setTimeout(()=>showRewards(pet?'petduel':'duel',pet?'VITÓRIA NO DUELO PET':'VITÓRIA NO DUELO',[
        {type:'xp',name:'Experiência',icon:'✨',value:'+'+fmt(xp)+' XP',amount:xp,rarity:'Comum'}
      ],pet?'Seu pet venceu o confronto':'Você venceu o confronto'),140);
      if(!silent) notify('Vitória! +'+xp+' XP');
      return;
    }

    const defense=pet?Math.round(activePet.level*1.4):p.def;
    const received=Math.max(3,Math.round((battle.enemyAtk-defense*.18)*(.78+Math.random()*.38)));
    const myAfter=Math.max(0,battle.myHp-received);
    window.setTimeout(()=>fx({duelPlayerHit:true,duelReceived:received},{duelPlayerHit:false,duelReceived:null},520),220);
    const last=(crit?'💥 CRÍTICO! ':'⚔️ ')+fmt(damage)+' causado · '+fmt(received)+' recebido';

    if(myAfter<=0){
      setDuelBattle(d=>({...d,[key]:{...battle,myHp:0,enemyHp:enemyAfter,round:battle.round+1,active:false,last:last+' · Derrota'}}));
      setGame(g=>withLog({
        ...g,
        profile:{...g.profile,losses:g.profile.losses+1,xp:g.profile.xp+20},
        pets:pet?g.pets.map(x=>x.id===g.petTeam[0]?{...x,hp:0,energy:Math.max(0,x.energy-2)}:x):g.pets
      },(pet?'🐾':'⚔️')+' Derrota no '+(pet?'Duelo Pet':'Duelo')+'.'));
      if(pet) setAutoPetDuel(false); else setAutoDuel(false);
      if(!silent) notify('Derrota. +20 XP');
      return;
    }

    setDuelBattle(d=>({...d,[key]:{...battle,myHp:myAfter,enemyHp:enemyAfter,round:battle.round+1,last}}));
    if(pet){
      setGame(g=>({...g,pets:g.pets.map(x=>x.id===g.petTeam[0]?{...x,hp:myAfter,energy:Math.max(0,x.energy-2)}:x)}));
    }else{
      setGame(g=>({...g,profile:{...g.profile,hp:myAfter}}));
    }
    if(!silent) notify(last);
  }

  function usePlayerPotion(item){
    const heals={pocao_p:35,pocao_m:80,pocao_g:160,elixir_supremo:999999};
    const heal=heals[item?.id]||0;
    if(!heal) return;
    const current=game.inventory.find(i=>i.id===item.id);
    if(!current?.qty) return notify('Você não possui essa poção.');
    if(p.hp>=p.maxHp) return notify('Seu HP já está cheio.');
    const amount=Math.min(heal,p.maxHp-p.hp);
    setGame(g=>({
      ...g,
      profile:{...g.profile,hp:Math.min(g.profile.maxHp,g.profile.hp+heal)},
      inventory:g.inventory.map(i=>i.id===item.id?{...i,qty:Math.max(0,i.qty-1)}:i)
    }));
    fx({healText:'+'+amount+' HP'},{healText:null},720);
    notify('+'+amount+' HP');
  }

  function healPet(){
    const defs=[
      {id:'pocao_pet_comum',heal:60,name:'Poção de Pet Comum'},
      {id:'pocao_pet_rara',heal:160,name:'Poção de Pet Rara'},
      {id:'pocao_pet_epica',heal:320,name:'Poção de Pet Épica'},
      {id:'pocao_pet_suprema',heal:800,name:'Poção de Pet Suprema'}
    ];
    const item=defs.find(d=>Number(game.inventory.find(i=>i.id===d.id)?.qty||0)>0);
    if(!item) return notify('Sem Poção de Pet.');
    if(activePet.hp>=activePet.maxHp) return notify('HP do pet já está cheio.');
    setGame(g=>({...g,pets:g.pets.map(x=>x.id===g.petTeam[0]?{...x,hp:Math.min(x.maxHp,x.hp+item.heal)}:x),inventory:g.inventory.map(i=>i.id===item.id?{...i,qty:i.qty-1}:i)}));
    fx({healText:'+'+item.heal+' HP PET'},{healText:null},720);
    notify('+'+item.heal+' HP no pet');
  }

  function restPet(){
    setGame(g=>({...g,pets:g.pets.map(x=>x.id===g.petTeam[0]?{...x,energy:Math.min(x.maxEnergy,x.energy+30)}:x)}));
    notify('+30 energia');
  }

  function equip(item){
    if(!['weapon','armor','boots'].includes(item.category)) return;
    setGame(g=>({...g,equipment:{...g.equipment,[item.category]:{...item}}}));
    fx({equipSlot:item.category},{equipSlot:null},700);
    notify(item.name+' equipado.');
  }

  function dropEquip(slot,event){
    event.preventDefault();
    const id=event.dataTransfer.getData('text/item-id');
    const item=game.inventory.find(i=>i.id===id);
    if(!item) return notify('Item não encontrado.');
    if(item.category!==slot) return notify('Esse item não serve neste slot.');
    equip(item);
  }

  function upgrade(item){
    if(!['weapon','armor','boots'].includes(item.category)) return;
    if(item.level>=10) return notify('Item já está no Lv.10.');
    const base=item.rarity==='Épico'?16000:item.rarity==='Raro'?7000:item.rarity==='Evento'?50000:3000;
    const cost=base*item.level;
    if(p.cash<cost) return notify('Saldo insuficiente. Custo: R$ '+fmt(cost));
    setGame(g=>({
      ...g,
      profile:{...g.profile,cash:g.profile.cash-cost},
      inventory:g.inventory.map(i=>i.id===item.id?{...i,level:i.level+1}:i),
      equipment:Object.fromEntries(Object.entries(g.equipment).map(([k,v])=>[k,v?.id===item.id?{...v,level:(v.level||1)+1}:v]))
    }));
    notify(item.name+' subiu para Lv.'+(item.level+1));
  }

  function setPetSlot(slot,petId){
    setGame(g=>{
      const next=[...g.petTeam];
      const other=next.indexOf(petId);
      if(other>=0) next[other]=next[slot];
      next[slot]=petId;
      return {...g,petTeam:next};
    });
    notify('Time Pet atualizado.');
  }

  function collectBusinesses(){
    const gross=game.businesses.reduce((s,b)=>s+b.stored,0);
    if(gross<=0) return notify('Nada para coletar.');
    const tax=Math.round(gross*.10);
    const net=gross-tax;
    setGame(g=>withLog({...g,profile:{...g.profile,cash:g.profile.cash+net},businesses:g.businesses.map(b=>({...b,stored:0}))},'🏢 Negócios: R$ '+fmt(net)+' líquidos. TAXADE te pegou: -R$ '+fmt(tax)+'.'));
    window.setTimeout(()=>showRewards('business','NEGÓCIOS COLETADOS',[
      {type:'cash',name:'Dinheiro líquido',icon:'🪙',value:'R$ '+fmt(net),amount:net,rarity:'Comum'}
    ],'TAXADE te pegou: -R$ '+fmt(tax)),100);
    notify('Coletado R$ '+fmt(net));
  }

  function work(kind){
    const base={Trabalho:680,Uber:920,Ifood:540}[kind]||500;
    const gross=Math.round(base*(.85+Math.random()*.35));
    const tax=Math.round(gross*.10);
    const net=gross-tax;
    setGame(g=>withLog({
      ...g,
      profile:{...g.profile,cash:g.profile.cash+net,xp:g.profile.xp+25},
      missions:g.missions.map(m=>m.id===1?{...m,progress:Math.min(m.target,m.progress+1)}:m),
      businesses:g.businesses.map(b=>({...b,stored:b.stored+Math.round(b.rate*.12)}))
    },'🛵 '+kind+': R$ '+fmt(net)+' líquido. TAXADE: -R$ '+fmt(tax)+'.'));
    window.setTimeout(()=>showRewards('work',kind.toUpperCase(),[
      {type:'cash',name:'Dinheiro líquido',icon:'🪙',value:'R$ '+fmt(net),amount:net,rarity:'Comum'},
      {type:'xp',name:'Experiência',icon:'✨',value:'+25 XP',amount:25,rarity:'Comum'}
    ],'TAXADE te pegou: -R$ '+fmt(tax)),100);
    notify(kind+': +R$ '+fmt(net));
  }

  function bank(action){
    const amount=Math.max(1,Math.floor(Number(bankAmount)||0));
    if(action==='deposit'){
      if(p.cash<amount) return notify('Carteira insuficiente.');
      setGame(g=>({...g,profile:{...g.profile,cash:g.profile.cash-amount,bank:g.profile.bank+amount}}));
      notify('Depositado R$ '+fmt(amount));
    }else{
      if(p.bank<amount) return notify('Banco insuficiente.');
      setGame(g=>({...g,profile:{...g.profile,cash:g.profile.cash+amount,bank:g.profile.bank-amount}}));
      notify('Sacado R$ '+fmt(amount));
    }
  }

  function buyShop(item){
    const total=p.cash+p.bank;
    if(total<item.price) return notify('Saldo total insuficiente.');
    setGame(g=>{
      let cash=g.profile.cash;
      let bank=g.profile.bank;
      let remaining=item.price;
      const fromCash=Math.min(cash,remaining);
      cash-=fromCash;
      remaining-=fromCash;
      if(remaining>0) bank-=remaining;

      const exists=g.inventory.find(i=>i.id===item.id);
      const inventory=exists
        ? g.inventory.map(i=>i.id===item.id?{...i,qty:Number(i.qty||0)+1}:i)
        : [...g.inventory,{...item,qty:1}];

      return withLog({
        ...g,
        profile:{...g.profile,cash,bank},
        inventory
      },'🛒 Loja: '+item.name+' comprado por R$ '+fmt(item.price)+'.');
    });
    notify(item.name+' comprado.');
  }

  function buyMarket(entry){
    if(entry.bought) return;
    if(p.cash<entry.price) return notify('Saldo insuficiente.');
    setGame(g=>({...g,profile:{...g.profile,cash:g.profile.cash-entry.price},market:g.market.map(x=>x.id===entry.id?{...x,bought:true}:x),inventory:[...g.inventory,{id:'market-'+entry.id,name:entry.item,icon:entry.icon,rarity:'Mercado',category:'special',level:1,qty:1,stat:'Comprado de '+entry.seller,price:entry.price}]}));
    notify(entry.item+' comprado.');
  }

  function claimMission(m){
    if(m.claimed||m.progress<m.target) return;
    setGame(g=>{
      let profile={...g.profile},inventory=[...g.inventory],pets=[...g.pets];
      if(m.id===1){profile.cash+=2500;profile.xp+=80;}
      if(m.id===2) inventory.push({id:'caixa-rara-'+Date.now(),name:'Caixa Rara',icon:'📦',rarity:'Raro',category:'special',level:1,qty:1,stat:'Recompensa de missão',price:12000});
      if(m.id===3) pets=pets.map(x=>x.id===g.petTeam[0]?{...x,level:Math.min(100,x.level+1)}:x);
      return withLog({...g,profile,inventory,pets,missions:g.missions.map(x=>x.id===m.id?{...x,claimed:true}:x)},'📜 Missão resgatada: '+m.title+'.');
    });
    const missionRewards=m.id===1
      ? [{type:'cash',name:'Dinheiro',icon:'🪙',value:'R$ 2.500',amount:2500,rarity:'Comum'},{type:'xp',name:'Experiência',icon:'✨',value:'+80 XP',amount:80,rarity:'Comum'}]
      : m.id===2
        ? [{type:'item',name:'Caixa Rara',icon:'🎁',value:'+1',qty:1,rarity:'Raro'}]
        : [{type:'petxp',name:'XP de Pet',icon:'🐾',value:'+150 XP',amount:150,rarity:'Incomum'}];
    window.setTimeout(()=>showRewards('mission','MISSÃO CONCLUÍDA',missionRewards,m.title),100);
    notify('Recompensa resgatada.');
  }

  function reset(){
    if(!confirm('Resetar apenas os dados deste protótipo?')) return;
    localStorage.removeItem('alpha-web-rpg-v1');
    setGame(INITIAL);setTab('home');notify('Protótipo resetado.');
  }

  const RewardOverlay=()=>{
    if(!rewardReveal) return null;
    const legendary=rewardReveal.tone==='legendary';
    return <div className={'reward-overlay '+rewardReveal.tone} role="dialog" aria-modal="true">
      <div className="reward-backdrop"/>
      <div className={'reward-modal '+rewardReveal.tone}>
        <div className={'reward-burst '+rewardReveal.tone}/>
        <button className="reward-close" onClick={()=>setRewardReveal(null)} aria-label="Fechar">✕</button>
        <div className={'reward-hero '+(legendary?'legendary-art':'raid-art')}>
          <div className="reward-hero-glow"/>
          {!legendary&&<div className="reward-chest-fallback">🎁</div>}
        </div>
        {legendary&&<div className="legendary-label">👑 LENDÁRIO!</div>}
        <div className="reward-kicker">{rewardReveal.source==='raid'?'VITÓRIA NA RAID':rewardReveal.source==='boss'?'BOSS DERROTADO':'RECOMPENSA'}</div>
        <h2>{rewardReveal.title}</h2>
        <p>{rewardReveal.subtitle}</p>
        <div className="reward-grid">
          {rewardReveal.rewards.map((r,i)=><div key={(r.id||r.type||r.name)+'-'+i} className={'reward-card '+rarityClass(r.rarity)}>
            <div className={'reward-icon '+(rewardArtClass(r)?'reward-illustration '+rewardArtClass(r):'')}>{!rewardArtClass(r)&&(r.icon||'🎁')}</div>
            <small>{r.name}</small>
            <strong>{r.value}</strong>
            {r.detail&&<span>{r.detail}</span>}
            {r.rarity&&rarityScore(r.rarity)>0&&<em>{r.rarity}</em>}
          </div>)}
        </div>
        <Button onClick={()=>setRewardReveal(null)} kind={legendary?'legendary':'auto'}>{legendary?'✨ CONTINUAR':'📦 CONTINUAR'}</Button>
      </div>
    </div>;
  };

  const Home=()=> <div className="stack">
    <Card className="hero">
      <div><div className="eyebrow">ALPHA RPG WEB · PROTÓTIPO ISOLADO</div><h1>{p.name}</h1><p>O mesmo RPG do WhatsApp, agora com interface visual.</p></div>
      <div className="avatar">⚔️</div>
    </Card>
    <div className="stats-grid">
      <Stat icon="⭐" label="Nível" value={p.level}/><Stat icon="❤️" label="HP" value={p.hp+'/'+p.maxHp}/><Stat icon="⚔️" label="ATK" value={p.atk}/>
      <Stat icon="🛡️" label="DEF" value={p.def}/><Stat icon="💨" label="SPD" value={p.spd}/><Stat icon="💥" label="CRIT" value={p.crit+'%'}/>
    </div>
    <div className="two-col">
      <Card><div className="card-head"><h3>Progressão</h3><span>EXP {fmt(p.xp)}/{fmt(p.xpNext)}</span></div><Bar value={p.xp} max={p.xpNext} tone="xp"/>
        <div className="money-row"><div><small>Carteira</small><strong>R$ {fmt(p.cash)}</strong></div><div><small>Banco</small><strong>R$ {fmt(p.bank)}</strong></div><div><small>Total</small><strong>R$ {fmt(p.cash+p.bank)}</strong></div></div>
      </Card>
      <Card><div className="card-head"><h3>Equipamentos</h3><span>{p.wins}V / {p.losses}D</span></div>
        <div className="equip-row">{Object.entries(game.equipment).map(([slot,item])=><div className="equip-slot" key={slot}><div className="big-icon">{item?.icon||'＋'}</div><small>{slot==='weapon'?'Arma':slot==='armor'?'Armadura':'Botas'}</small><strong>{item?.name||'Vazio'}</strong>{item&&<span>Lv.{item.level}</span>}</div>)}</div>
      </Card>
    </div>
    <Card><div className="card-head"><h3>Atalhos</h3><span>Clique para abrir</span></div><div className="shortcut-grid">{tabs.filter(x=>x[0]!=='home').map(([id,icon,label])=><button key={id} className="shortcut" onClick={()=>setTab(id)}><b>{icon}</b><span>{label}</span></button>)}</div></Card>
    <Card><div className="card-head"><h3>Atividade recente</h3><span>salva no aparelho</span></div><div className="activity">{game.log.map((x,i)=><div key={i}>{x}</div>)}</div></Card>
  </div>;

  const Raid=()=> <div className="stack">
    <Card className="battle-card">
      <div className="combat-badge">{autoRaid?'AUTO ATIVO':'MANUAL'}</div>
      <div className="combat-visual">
        <div className={'monster '+(combatFx.raidHit?'hit-shake':'')}>{game.raid.icon}</div>
        {combatFx.raidDamage&&<div className={'float-number damage '+(combatFx.raidCrit?'crit':'')}>
          -{fmt(combatFx.raidDamage)}{combatFx.raidCrit?' CRÍTICO!':''}
        </div>}
      </div>
      <div className="eyebrow">RAID LV.{game.raid.level}</div>
      <h2>{game.raid.name}</h2>
      <div className="hp-line"><b>{fmt(game.raid.hp)} / {fmt(game.raid.maxHp)} HP</b><span>{Math.round(pct(game.raid.hp,game.raid.maxHp))}%</span></div>
      <Bar value={game.raid.hp} max={game.raid.maxHp}/>
      <div className="battle-info">
        <span>Seu dano: <b>{fmt(game.raid.myDamage)}</b></span>
        <span>Pet: <b>{activePet.icon} {activePet.name}</b></span>
        <span>Energia: <b>{activePet.energy}/{activePet.maxEnergy}</b></span>
      </div>
      <div className="button-row combat-actions">
        <Button onClick={()=>attackRaid(true)} disabled={game.raid.hp<=0||autoRaid}>⚔️ Atacar com pet</Button>
        <Button onClick={()=>attackRaid(false)} kind="secondary" disabled={game.raid.hp<=0||autoRaid}>🗡️ Atacar sem pet</Button>
        {!autoRaid&&<Button onClick={()=>{setRaidUsePet(true);setAutoRaid(true)}} kind="auto">▶ Auto com pet</Button>}
        {!autoRaid&&<Button onClick={()=>{setRaidUsePet(false);setAutoRaid(true)}} kind="auto">▶ Auto sem pet</Button>}
        {autoRaid&&<Button onClick={()=>setAutoRaid(false)} kind="danger">⏹ Parar Auto</Button>}
      </div>
      <p className="hint">O Auto da Raid continua mesmo se você abrir outra tela e para sozinho quando a Raid termina ou a chave não está disponível.</p>
    </Card>

    <Card>
      <div className="card-head"><h3>Raids disponíveis</h3><span>A chave é consumida no primeiro ataque</span></div>
      <div className="raid-levels">{RAIDS.map(r=><button onClick={()=>selectRaid(r.level)} className={r.level===game.raid.level?'active':''} key={r.level}><b>Lv.{r.level}</b><small>{r.name}</small><small>{fmt(r.hp)} HP · {r.duration} min</small></button>)}</div>
    </Card>
  </div>;

  const Boss=()=> <div className="combat-page">
    <Card className="battle-card event">
      <div className="combat-badge">{autoBoss?'AUTO ATIVO':'MANUAL'}</div>
      <div className="combat-visual"><div className={'monster '+(combatFx.bossHit?'hit-shake':'')}>{game.boss.icon}</div>{combatFx.bossDamage&&<div className={'float-number damage '+(combatFx.bossCrit?'crit':'')}>-{fmt(combatFx.bossDamage)}{combatFx.bossCrit?' CRÍTICO!':''}</div>}</div><div className="eyebrow">BOSS DE EVENTO</div><h2>{game.boss.name}</h2>
      <div className="hp-line"><b>{fmt(game.boss.hp)} / {fmt(game.boss.maxHp)} HP</b><span>{Math.round(pct(game.boss.hp,game.boss.maxHp))}%</span></div><Bar value={game.boss.hp} max={game.boss.maxHp}/>
      <div className={'combat-player-strip '+(combatFx.playerHit?'damage-flash':'')}><span>❤️ Você: <b>{p.hp}/{p.maxHp}</b></span><span>⚔️ Dano acumulado: <b>{fmt(game.boss.myDamage)}</b></span></div>
      <div className={'pet-inline '+(combatFx.bossHit?'attack-lunge':'')}><div className="pet-art pet-idle">{bossPet.icon}</div><div><strong>{bossPet.name}</strong><small>{bossPet.id===activePet.id?'Principal':'Reserva'} · {bossPet.style}</small></div><div className="pet-bars"><Bar value={bossPet.hp} max={bossPet.maxHp}/><Bar value={bossPet.energy} max={bossPet.maxEnergy} tone="energy"/></div></div>
      <div className="button-row combat-actions">
        <Button onClick={()=>attackBoss(true)} disabled={game.boss.hp<=0||autoBoss}>⚔️ Atacar com pet</Button>
        <Button onClick={()=>attackBoss(false)} kind="secondary" disabled={game.boss.hp<=0||autoBoss}>🗡️ Atacar sem pet</Button>
        {!autoBoss&&<Button onClick={()=>{setBossUsePet(true);setAutoBoss(true)}} kind="auto">▶ Auto com pet</Button>}
        {!autoBoss&&<Button onClick={()=>{setBossUsePet(false);setAutoBoss(true)}} kind="auto">▶ Auto sem pet</Button>}
        {autoBoss&&<Button onClick={()=>setAutoBoss(false)} kind="danger">⏹ Parar Auto</Button>}
        <Button onClick={healPet} kind="secondary">💙 Curar pet</Button><Button onClick={restPet} kind="ghost">⚡ Descansar</Button>
      </div>
      {combatFx.healText&&<div className="float-number heal floating-center">{combatFx.healText}</div>}
      <p className="hint">Auto ataca a cada 1,1 s, usa cura preventiva abaixo de 35% e pausa se o HP ficar crítico sem poções.</p>
    </Card>
  </div>;

  const Duel=({pet=false})=>{
    const key=pet?'pet':'player';
    const battle=duelBattle[key];
    const auto=pet?autoPetDuel:autoDuel;
    const setAuto=pet?setAutoPetDuel:setAutoDuel;
    return <div className="combat-page">
      <Card className="battle-card duel-card">
        <div className="combat-badge">{auto?'AUTO ATIVO':battle?.active?'EM COMBATE':'ARENA'}</div>
        <div className="duel-stage">
          <div className={'fighter '+(combatFx.duelPlayerHit?'hit-shake damage-flash ':'')+(!battle?.active&&battle?.enemyHp===0?'winner ':'')+(!battle?.active&&battle?.myHp===0?'defeated ':'')+(combatFx.duelEnemyHit?'attack-lunge':'')}>
            <div className={'fighter-icon '+(pet?'pet-idle':'')}>{pet?activePet.icon:'🧑‍🚀'}</div>
            {combatFx.duelReceived&&<div className="float-number damage self-hit">-{fmt(combatFx.duelReceived)}</div>}
            <strong>{pet?activePet.name:p.name}</strong>
            <small>{pet?'Lv.'+activePet.level:'Lv.'+p.level}</small>
            <Bar value={battle?.myHp ?? (pet?activePet.hp:p.hp)} max={battle?.myMaxHp ?? (pet?activePet.maxHp:p.maxHp)}/>
            <span>{fmt(battle?.myHp ?? (pet?activePet.hp:p.hp))} HP</span>
          </div>
          <div className="versus">VS</div>
          <div className={'fighter enemy '+(combatFx.duelEnemyHit?'hit-shake damage-flash ':'')+(!battle?.active&&battle?.enemyHp===0?'defeated ':'')+(!battle?.active&&battle?.myHp===0?'winner ':'')}>
            <div className="fighter-icon">{battle?.enemyIcon || (pet?'🐺':'🥷')}</div>
            {combatFx.duelDamage&&<div className="float-number damage">-{fmt(combatFx.duelDamage)}</div>}
            <strong>{battle?.enemyName || (pet?'Pet Rival':'Rival Alpha')}</strong>
            <small>{battle?'Rodada '+battle.round:'Aguardando desafio'}</small>
            <Bar value={battle?.enemyHp ?? 1} max={battle?.enemyMaxHp ?? 1}/>
            <span>{battle?fmt(battle.enemyHp)+' HP':'—'}</span>
          </div>
        </div>
        <div className="combat-message">{battle?.last || (pet?'Seu pet luta rodada a rodada.':'O duelo agora acontece por rodadas.')}</div>
        <div className="button-row combat-actions">
          {!battle?.active&&<Button onClick={()=>startDuel(pet)}>{pet?'🐾 Novo Duelo Pet':'⚔️ Novo Duelo'}</Button>}
          {battle?.active&&<Button onClick={()=>duelTurn(pet)} disabled={auto}>⚔️ Atacar</Button>}
          {battle?.active&&!auto&&<Button onClick={()=>setAuto(true)} kind="auto">▶ Auto</Button>}
          {battle?.active&&auto&&<Button onClick={()=>setAuto(false)} kind="danger">⏹ Parar Auto</Button>}
        </div>
        {pet&&<p className="hint">Cada rodada consome 2 de energia do pet. O auto para ao vencer, perder ou ficar sem condição de continuar.</p>}
      </Card>
    </div>;
  };

  const Pets=()=> <div className="stack">
    <Card><div className="card-head"><h3>Time Pet</h3><span>{synergy}</span></div><div className="pet-team">{['Principal','Suporte','Reserva'].map((label,slot)=>{
      const pet=game.pets.find(x=>x.id===game.petTeam[slot]);
      return <div className="team-slot" key={label}><small>{slot+1}. {label}</small><div className="pet-art pet-idle">{pet?.icon||'＋'}</div><strong>{pet?.name||'Vazio'}</strong><select value={pet?.id||''} onChange={e=>setPetSlot(slot,Number(e.target.value))}>{game.pets.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></div>;
    })}</div></Card>
    <div className="cards-grid">{game.pets.map(pet=><Card key={pet.id} className={game.petTeam.includes(pet.id)?'selected':''}><div className="item-top"><div className="item-icon pet-idle">{pet.icon}</div><div><h3>{pet.name}</h3><span>Lv.{pet.level} · {pet.style}</span></div></div><small>{pet.bonus}</small><div className="line-label"><span>HP</span><b>{pet.hp}/{pet.maxHp}</b></div><Bar value={pet.hp} max={pet.maxHp}/><div className="line-label"><span>Energia</span><b>{pet.energy}/{pet.maxEnergy}</b></div><Bar value={pet.energy} max={pet.maxEnergy} tone="energy"/></Card>)}</div>
  </div>;

  const Items=()=> <div className="stack">
    <Card>
      <div className="card-head"><h3>Equipamentos</h3><span>Arraste um item compatível para o slot</span></div>
      <div className="drop-equip-row">
        {['weapon','armor','boots'].map(slot=>{
          const item=game.equipment[slot];
          const label=slot==='weapon'?'Arma':slot==='armor'?'Armadura':'Botas';
          return <div key={slot} className="drop-slot" onDragOver={e=>e.preventDefault()} onDrop={e=>dropEquip(slot,e)}>
            <small>{label}</small><div className="big-icon">{item?.icon||'＋'}</div><strong>{item?.name||'Vazio'}</strong>{item&&<span>Lv.{item.level} · {item.stat}</span>}
          </div>;
        })}
      </div>
    </Card>
    <div className="cards-grid">{game.inventory.filter(i=>i.qty>0).map(item=><div key={item.id} draggable={['weapon','armor','boots'].includes(item.category)} onDragStart={e=>e.dataTransfer.setData('text/item-id',item.id)} className={['weapon','armor','boots'].includes(item.category)?'draggable-item':''}><Card className={rarityClass(item.rarity)}><div className="item-top"><div className="item-icon">{item.icon}</div><div><h3>{item.name}</h3><span>{item.rarity} · Lv.{item.level} · x{item.qty}</span></div></div><p className="item-stat">{item.stat}</p><div className="button-row">{['weapon','armor','boots'].includes(item.category)&&<><Button onClick={()=>equip(item)}>Equipar</Button><Button onClick={()=>upgrade(item)} kind="secondary">Upar</Button></>}{['pocao_p','pocao_m','pocao_g','elixir_supremo'].includes(item.id)&&<Button onClick={()=>usePlayerPotion(item)}>Usar {item.stat}</Button>}{item.id.startsWith('pocao_pet_')&&<Button onClick={healPet}>Curar pet</Button>}</div></Card></div>)}</div>
  </div>;

  const Business=()=> { const total=game.businesses.reduce((s,b)=>s+b.stored,0); return <div className="stack"><Card><div className="card-head"><h3>Negócios</h3><span>Disponível: R$ {fmt(total)}</span></div><Button onClick={collectBusinesses} disabled={total<=0}>💰 COLETAR TUDO</Button></Card><div className="cards-grid">{game.businesses.map(b=><Card key={b.id}><div className="item-top"><div className="item-icon">{b.icon}</div><div><h3>{b.name}</h3><span>Lv.{b.level}</span></div></div><div className="money-row"><div><small>Acumulado</small><strong>R$ {fmt(b.stored)}</strong></div><div><small>Produção</small><strong>R$ {fmt(b.rate)}/h</strong></div></div></Card>)}</div></div>; };

  const Jobs=()=> <div className="cards-grid">{[['💼','Trabalho','Renda comum'],['🚗','Uber','Exige carro'],['🛵','Ifood','Bike/moto']].map(([icon,name,desc])=><Card key={name}><div className="item-top"><div className="item-icon">{icon}</div><div><h3>{name}</h3><span>{desc}</span></div></div><p className="hint">TAXADE é cobrada sobre o ganho, como no bot.</p><Button onClick={()=>work(name)}>Executar</Button></Card>)}</div>;

  const Bank=()=> <div className="stack"><div className="two-col"><Card><small>Carteira</small><h2>R$ {fmt(p.cash)}</h2></Card><Card><small>Banco</small><h2>R$ {fmt(p.bank)}</h2></Card></div><Card><label className="field">Valor<input type="number" value={bankAmount} onChange={e=>setBankAmount(e.target.value)} min="1"/></label><div className="button-row"><Button onClick={()=>bank('deposit')}>Depositar</Button><Button onClick={()=>bank('withdraw')} kind="secondary">Sacar</Button><Button onClick={()=>setBankAmount(p.bank)} kind="ghost">Sacar tudo</Button></div></Card></div>;

  const Market=()=> <div className="stack">
    <Card>
      <div className="card-head"><h3>Loja Alpha</h3><span>Estoque permanente · compre quantas vezes quiser</span></div>
      <p className="hint">A compra usa primeiro a carteira e completa pelo banco se necessário.</p>
    </Card>

    <div className="cards-grid">
      {SHOP_ITEMS.map(item=>{
        const owned=Number(game.inventory.find(i=>i.id===item.id)?.qty||0);
        return <Card key={item.id} className={rarityClass(item.rarity)}>
          <div className="item-top">
            <div className="item-icon">{item.icon}</div>
            <div><h3>{item.name}</h3><span>{item.shopGroup} · {item.rarity}</span></div>
          </div>
          <p className="item-stat">{item.stat}</p>
          <div className="shop-meta">
            <span>Você tem: <b>x{owned}</b></span>
            <strong>R$ {fmt(item.price)}</strong>
          </div>
          <Button onClick={()=>buyShop(item)} disabled={p.cash+p.bank<item.price}>Comprar</Button>
        </Card>;
      })}
    </div>

    <Card>
      <div className="card-head"><h3>Mercado de Jogadores</h3><span>Anúncios únicos do protótipo</span></div>
    </Card>
    <div className="cards-grid">
      {game.market.map(m=><Card key={m.id} className={m.bought?'disabled-card':''}>
        <div className="item-top"><div className="item-icon">{m.icon}</div><div><h3>{m.item}</h3><span>Vendedor: {m.seller}</span></div></div>
        <div className="money-row"><div><small>Preço</small><strong>R$ {fmt(m.price)}</strong></div><div><small>Expira em</small><strong>{m.left}</strong></div></div>
        <Button onClick={()=>buyMarket(m)} disabled={m.bought}>{m.bought?'Comprado':'Comprar'}</Button>
      </Card>)}
    </div>
  </div>;

  const Missions=()=> <div className="stack">{game.missions.map(m=><Card key={m.id}><div className="card-head"><h3>{m.title}</h3><span>{Math.min(m.progress,m.target)}/{m.target}</span></div><Bar value={m.progress} max={m.target} tone="xp"/><p className="hint">Recompensa: {m.reward}</p><Button onClick={()=>claimMission(m)} disabled={m.claimed||m.progress<m.target}>{m.claimed?'Resgatada':m.progress>=m.target?'Resgatar':'Em progresso'}</Button></Card>)}</div>;

  useEffect(()=>{
    if(!autoRaid) return;
    if(game.raid.hp<=0){
      setAutoRaid(false);
      return;
    }
    const key=game.inventory.find(i=>i.id===('raid'+game.raid.level));
    if(!game.raid.started&&Number(key?.qty||0)<1){
      setAutoRaid(false);
      notify('Auto da Raid parado: sem chave.');
      return;
    }
    const timer=setTimeout(()=>attackRaid(raidUsePet,true),950);
    return ()=>clearTimeout(timer);
  },[
    autoRaid,raidUsePet,game.raid.hp,game.raid.started,game.raid.level,
    activePet.energy,activePet.hp
  ]);

  useEffect(()=>{
    if(!autoBoss) return;
    if(game.boss.hp<=0||p.hp<=0){setAutoBoss(false);return;}
    if(p.maxHp>0&&p.hp/p.maxHp<.20&&playerPotionQty<=0){
      setAutoBoss(false);
      notify('Auto pausado: HP baixo e sem poções.');
      return;
    }
    const timer=setTimeout(()=>attackBoss(bossUsePet,true),1100);
    return ()=>clearTimeout(timer);
  },[autoBoss,bossUsePet,game.boss.hp,p.hp,playerPotionQty,activePet.energy,activePet.hp,reservePet?.energy,reservePet?.hp]);

  useEffect(()=>{
    const battle=duelBattle.player;
    if(!autoDuel) return;
    if(!battle?.active){setAutoDuel(false);return;}
    const timer=setTimeout(()=>duelTurn(false,true),850);
    return ()=>clearTimeout(timer);
  },[autoDuel,duelBattle.player?.round,duelBattle.player?.active]);

  useEffect(()=>{
    const battle=duelBattle.pet;
    if(!autoPetDuel) return;
    if(!battle?.active||activePet.energy<2||activePet.hp<=0){setAutoPetDuel(false);return;}
    const timer=setTimeout(()=>duelTurn(true,true),850);
    return ()=>clearTimeout(timer);
  },[autoPetDuel,duelBattle.pet?.round,duelBattle.pet?.active,activePet.energy,activePet.hp]);

  const views={home:<Home/>,raid:<Raid/>,boss:<Boss/>,duel:<Duel/>,petduel:<Duel pet/>,pets:<Pets/>,items:<Items/>,business:<Business/>,jobs:<Jobs/>,bank:<Bank/>,market:<Market/>,missions:<Missions/>};

  const goTab=id=>{setTab(id);setMobileMenu(false)};

  return <main className={rewardReveal?.tone==='legendary'?'legendary-screen-shake':''}>
    {toast&&<div className="toast">{toast}</div>}
    <RewardOverlay/>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>ALPHA</strong><small>RPG WEB</small></div></div>
      <nav>{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>goTab(id)}><span>{icon}</span>{label}</button>)}</nav>
      <button className="reset" onClick={reset}>↻ Resetar protótipo</button>
    </aside>

    {mobileMenu&&<div className="mobile-backdrop" onClick={()=>setMobileMenu(false)}>
      <div className="mobile-drawer drawer-enter" onClick={e=>e.stopPropagation()}>
        <div className="drawer-head"><strong>Menu</strong><button onClick={()=>setMobileMenu(false)}>✕</button></div>
        <div className="drawer-grid">{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>goTab(id)}><span>{icon}</span><b>{label}</b></button>)}</div>
      </div>
    </div>}

    <section className="content">
      <header className="topbar"><div><div className="eyebrow">ALPHA RPG WEB</div><strong>{tabs.find(x=>x[0]===tab)?.[2]}</strong></div><div className="top-status"><span>❤️ {p.hp}/{p.maxHp}</span><span>💰 R$ {fmt(p.cash)}</span><span>⭐ Lv.{p.level}</span></div></header>
      <div key={tab} className="page view-enter">{views[tab]}</div>
    </section>

    <div className="mobile-nav">
      {tabs.filter(x=>['home','raid','boss','pets'].includes(x[0])).map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>goTab(id)}><span>{icon}</span><small>{label}</small></button>)}
      <button className={mobileMenu?'active':''} onClick={()=>setMobileMenu(true)}><span>☰</span><small>Mais</small></button>
    </div>
  </main>;
}
