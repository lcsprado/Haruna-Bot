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
  {level:10,name:'Guardião de Pedra',icon:'🪨',hp:13000,atk:15,keyPrice:10000,cashPool:20000,xpPool:1200,petXpPool:120,duration:12,minPlayers:1},
  {level:15,name:'Dragão Vulcânico',icon:'🐲',hp:24000,atk:23,keyPrice:16000,cashPool:35000,xpPool:1800,petXpPool:180,duration:15,minPlayers:2},
  {level:20,name:'Devorador Abissal',icon:'👁️',hp:39000,atk:33,keyPrice:25000,cashPool:55000,xpPool:2600,petXpPool:260,duration:18,minPlayers:2},
  {level:25,name:'Titã de Ferro',icon:'🦾',hp:63000,atk:43,keyPrice:40000,cashPool:80000,xpPool:3600,petXpPool:360,duration:22,minPlayers:2},
  {level:30,name:'Rei Abissal',icon:'👹',hp:98000,atk:55,keyPrice:60000,cashPool:120000,xpPool:5000,petXpPool:500,duration:30,minPlayers:2},
  {level:40,name:'Serafim Caído',icon:'🪽',hp:170000,atk:77,keyPrice:100000,cashPool:200000,xpPool:7500,petXpPool:750,duration:40,minPlayers:2},
  {level:50,name:'Alpha Corrompido',icon:'☠️',hp:290000,atk:108,keyPrice:160000,cashPool:350000,xpPool:11000,petXpPool:1100,duration:50,minPlayers:2}
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

  function selectRaid(level){
    const raid=RAIDS.find(x=>x.level===level);
    if(!raid) return;
    setGame(g=>({...g,raid:{level:raid.level,name:raid.name,icon:raid.icon,hp:raid.hp,maxHp:raid.hp,atk:raid.atk,myDamage:0,started:false}}));
    notify('Raid Lv.'+level+' selecionada.');
  }

  function attackRaid(){
    if(game.raid.hp<=0) return notify('A Raid já foi concluída.');
    const keyId='raid'+game.raid.level;
    const key=game.inventory.find(i=>i.id===keyId);
    if(!game.raid.started && (!key || key.qty<1)) return notify('Você não possui a chave desta Raid.');
    const crit=Math.random()<p.crit/100;
    const petActive=activePet.energy>0 && activePet.hp>0;
    const dmg=Math.round(p.atk*(7.5+Math.random()*3)*(petActive?1.075:1)*(crit?1.85:1));
    setGame(g=>{
      const nextHp=Math.max(0,g.raid.hp-dmg);
      let out={
        ...g,
        raid:{...g.raid,hp:nextHp,myDamage:g.raid.myDamage+dmg,started:true},
        inventory:g.raid.started ? g.inventory : g.inventory.map(i=>i.id===('raid'+g.raid.level)?{...i,qty:Math.max(0,i.qty-1)}:i),
        pets:g.pets.map(x=>x.id===g.petTeam[0]&&x.energy>0?{...x,energy:Math.max(0,x.energy-2)}:x),
        missions:g.missions.map(m=>m.id===2?{...m,progress:Math.min(m.target,m.progress+dmg)}:m)
      };
      if(nextHp===0){
        const reward=RAIDS.find(x=>x.level===g.raid.level)||RAIDS[0];
        const contributionShare=1;
        const cash=Math.floor(reward.keyPrice*1.08)+Math.floor(reward.cashPool*(.04+.12*contributionShare));
        const exp=Math.floor(reward.xpPool*(.10+.90*contributionShare));
        out.profile={...out.profile,cash:out.profile.cash+cash,xp:out.profile.xp+exp};
        out.missions=out.missions.map(m=>m.id===3?{...m,progress:1}:m);
        return withLog(out,'🏆 Raid Lv.'+g.raid.level+' concluída: +R$ '+fmt(cash)+' e +'+fmt(exp)+' XP.');
      }
      return withLog(out,(crit?'💥 CRÍTICO! ':'⚔️ ')+fmt(dmg)+' de dano na Raid.');
    });
    notify((crit?'CRÍTICO — ':'')+fmt(dmg)+' de dano');
  }

  function attackBoss(){
    if(game.boss.hp<=0) return notify('Boss já derrotado.');
    if(p.hp<=0) return notify('Você está sem HP. Cure-se antes de atacar.');

    const petActive=bossPet&&bossPet.energy>=2&&bossPet.hp>0;
    const critChance=p.crit+(petActive&&bossPet.species==='kitsune'?7.5:0);
    const crit=Math.random()<critChance/100;
    const rawBase=Math.max(5,Math.floor(p.atk*(.85+Math.random()*.45)));
    const dmg=Math.max(5,Math.floor(rawBase*(petActive?1.075:1)*(crit?1.5:1)));

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

        if(profile.hp<=0){
          const pot=inventory.find(i=>i.id==='pocao_p'&&i.qty>0);
          if(pot){
            profile.hp=Math.min(profile.maxHp,35);
            inventory=inventory.map(i=>i.id==='pocao_p'?{...i,qty:i.qty-1}:i);
            playerEvent+=' · Poção Pequena automática: '+profile.hp+'/'+profile.maxHp+' HP';
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
      if(nextBossHp===0){
        out.profile={...out.profile,cash:out.profile.cash+24000,xp:out.profile.xp+600};
        return withLog(out,'🏆 Boss derrotado: +R$ 24.000 e +600 XP.');
      }
      return withLog(out,(crit?'💥 CRÍTICO! ':'🗿 ')+fmt(dmg)+' de dano no Boss'+playerEvent+petEvent+'.');
    });
    notify(fmt(dmg)+' de dano no Boss');
  }

  function duel(pet=false){
    const power=pet ? activePet.level*8+activePet.hp/12+activePet.energy/4 : p.atk+p.def+p.spd+p.crit;
    const enemy=pet ? 250+Math.random()*180 : 220+Math.random()*120;
    const win=power*(.82+Math.random()*.4)>enemy;
    const xp=win?65:20;
    setGame(g=>withLog({
      ...g,
      profile:{...g.profile,wins:g.profile.wins+(win?1:0),losses:g.profile.losses+(win?0:1),xp:g.profile.xp+xp},
      pets:pet?g.pets.map(x=>x.id===g.petTeam[0]?{...x,energy:Math.max(0,x.energy-5)}:x):g.pets
    },(pet?'🐾 ':'⚔️ ')+(win?'Vitória':'Derrota')+' no '+(pet?'Duelo Pet':'Duelo')+'.'));
    notify(win?'Vitória! +'+xp+' XP':'Derrota. +'+xp+' XP');
  }

  function usePotion(){
    const item=game.inventory.find(i=>i.id==='pocao_p');
    if(!item?.qty) return notify('Sem Poção Pequena.');
    if(p.hp>=p.maxHp) return notify('Seu HP já está cheio.');
    setGame(g=>({...g,profile:{...g.profile,hp:Math.min(g.profile.maxHp,g.profile.hp+35)},inventory:g.inventory.map(i=>i.id==='pocao_p'?{...i,qty:i.qty-1}:i)}));
    notify('+35 HP');
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
    notify('+'+item.heal+' HP no pet');
  }

  function restPet(){
    setGame(g=>({...g,pets:g.pets.map(x=>x.id===g.petTeam[0]?{...x,energy:Math.min(x.maxEnergy,x.energy+30)}:x)}));
    notify('+30 energia');
  }

  function equip(item){
    if(!['weapon','armor','boots'].includes(item.category)) return;
    setGame(g=>({...g,equipment:{...g.equipment,[item.category]:{...item}}}));
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
    notify('Recompensa resgatada.');
  }

  function reset(){
    if(!confirm('Resetar apenas os dados deste protótipo?')) return;
    localStorage.removeItem('alpha-web-rpg-v1');
    setGame(INITIAL);setTab('home');notify('Protótipo resetado.');
  }

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
    <Card className="battle-card"><div className="monster">{game.raid.icon}</div><div className="eyebrow">RAID LV.{game.raid.level}</div><h2>{game.raid.name}</h2>
      <div className="hp-line"><b>{fmt(game.raid.hp)} / {fmt(game.raid.maxHp)} HP</b><span>{Math.round(pct(game.raid.hp,game.raid.maxHp))}%</span></div><Bar value={game.raid.hp} max={game.raid.maxHp}/>
      <div className="battle-info"><span>Seu dano: <b>{fmt(game.raid.myDamage)}</b></span><span>Pet: <b>{activePet.icon} {activePet.name}</b></span><span>Energia: <b>{activePet.energy}/{activePet.maxEnergy}</b></span></div>
      <Button onClick={attackRaid} disabled={game.raid.hp<=0}>⚔️ ATACAR</Button>
    </Card>
    <Card><div className="card-head"><h3>Raids disponíveis</h3><span>A chave é consumida no primeiro ataque</span></div><div className="raid-levels">{RAIDS.map(r=><button onClick={()=>selectRaid(r.level)} className={r.level===game.raid.level?'active':''} key={r.level}><b>Lv.{r.level}</b><small>{r.name}</small><small>{fmt(r.hp)} HP · {r.duration} min</small></button>)}</div></Card>
  </div>;

  const Boss=()=> <Card className="battle-card event">
    <div className="monster">{game.boss.icon}</div><div className="eyebrow">BOSS DE EVENTO</div><h2>{game.boss.name}</h2>
    <div className="hp-line"><b>{fmt(game.boss.hp)} / {fmt(game.boss.maxHp)} HP</b><span>{Math.round(pct(game.boss.hp,game.boss.maxHp))}%</span></div><Bar value={game.boss.hp} max={game.boss.maxHp}/>
    <div className="pet-inline"><div className="pet-art">{activePet.icon}</div><div><strong>{activePet.name}</strong><small>{activePet.style} · {activePet.bonus}</small></div><div className="pet-bars"><Bar value={activePet.hp} max={activePet.maxHp}/><Bar value={activePet.energy} max={activePet.maxEnergy} tone="energy"/></div></div>
    <div className="button-row"><Button onClick={attackBoss} disabled={game.boss.hp<=0}>⚔️ ATACAR</Button><Button onClick={healPet} kind="secondary">💙 Curar pet</Button><Button onClick={restPet} kind="ghost">⚡ Descansar</Button></div>
    <p className="hint">Sem energia, o ataque continua; apenas o bônus do pet deixa de entrar.</p>
  </Card>;

  const Duel=({pet=false})=> <Card className="battle-card">
    <div className="monster">{pet?'🐾':'⚔️'}</div><div className="eyebrow">{pet?'DUELO PET':'DUELO RPG'}</div><h2>{pet?'Seu pet contra outro jogador':'Desafie outro jogador'}</h2>
    <p className="subtle">{pet?'HP, nível e energia do pet entram no cálculo.':'ATK, DEF, SPD e crítico entram no confronto.'}</p>
    {pet&&<div className="pet-inline"><div className="pet-art">{activePet.icon}</div><div><strong>{activePet.name}</strong><small>Lv.{activePet.level} · {activePet.style}</small></div><div className="pet-bars"><Bar value={activePet.hp} max={activePet.maxHp}/><Bar value={activePet.energy} max={activePet.maxEnergy} tone="energy"/></div></div>}
    <Button onClick={()=>duel(pet)}>{pet?'🐾 LUTAR COM PET':'⚔️ DESAFIAR'}</Button>
  </Card>;

  const Pets=()=> <div className="stack">
    <Card><div className="card-head"><h3>Time Pet</h3><span>{synergy}</span></div><div className="pet-team">{['Principal','Suporte','Reserva'].map((label,slot)=>{
      const pet=game.pets.find(x=>x.id===game.petTeam[slot]);
      return <div className="team-slot" key={label}><small>{slot+1}. {label}</small><div className="pet-art">{pet?.icon||'＋'}</div><strong>{pet?.name||'Vazio'}</strong><select value={pet?.id||''} onChange={e=>setPetSlot(slot,Number(e.target.value))}>{game.pets.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></div>;
    })}</div></Card>
    <div className="cards-grid">{game.pets.map(pet=><Card key={pet.id} className={game.petTeam.includes(pet.id)?'selected':''}><div className="item-top"><div className="item-icon">{pet.icon}</div><div><h3>{pet.name}</h3><span>Lv.{pet.level} · {pet.style}</span></div></div><small>{pet.bonus}</small><div className="line-label"><span>HP</span><b>{pet.hp}/{pet.maxHp}</b></div><Bar value={pet.hp} max={pet.maxHp}/><div className="line-label"><span>Energia</span><b>{pet.energy}/{pet.maxEnergy}</b></div><Bar value={pet.energy} max={pet.maxEnergy} tone="energy"/></Card>)}</div>
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
    <div className="cards-grid">{game.inventory.filter(i=>i.qty>0).map(item=><div key={item.id} draggable={['weapon','armor','boots'].includes(item.category)} onDragStart={e=>e.dataTransfer.setData('text/item-id',item.id)} className={['weapon','armor','boots'].includes(item.category)?'draggable-item':''}><Card><div className="item-top"><div className="item-icon">{item.icon}</div><div><h3>{item.name}</h3><span>{item.rarity} · Lv.{item.level} · x{item.qty}</span></div></div><p className="item-stat">{item.stat}</p><div className="button-row">{['weapon','armor','boots'].includes(item.category)&&<><Button onClick={()=>equip(item)}>Equipar</Button><Button onClick={()=>upgrade(item)} kind="secondary">Upar</Button></>}{item.id==='pocao_p'&&<Button onClick={usePotion}>Usar +35 HP</Button>}{item.id.startsWith('pocao_pet_')&&<Button onClick={healPet}>Curar pet</Button>}</div></Card></div>)}</div>
  </div>;

  const Business=()=> { const total=game.businesses.reduce((s,b)=>s+b.stored,0); return <div className="stack"><Card><div className="card-head"><h3>Negócios</h3><span>Disponível: R$ {fmt(total)}</span></div><Button onClick={collectBusinesses} disabled={total<=0}>💰 COLETAR TUDO</Button></Card><div className="cards-grid">{game.businesses.map(b=><Card key={b.id}><div className="item-top"><div className="item-icon">{b.icon}</div><div><h3>{b.name}</h3><span>Lv.{b.level}</span></div></div><div className="money-row"><div><small>Acumulado</small><strong>R$ {fmt(b.stored)}</strong></div><div><small>Produção</small><strong>R$ {fmt(b.rate)}/h</strong></div></div></Card>)}</div></div>; };

  const Jobs=()=> <div className="cards-grid">{[['💼','Trabalho','Renda comum'],['🚗','Uber','Exige carro'],['🛵','Ifood','Bike/moto']].map(([icon,name,desc])=><Card key={name}><div className="item-top"><div className="item-icon">{icon}</div><div><h3>{name}</h3><span>{desc}</span></div></div><p className="hint">TAXADE é cobrada sobre o ganho, como no bot.</p><Button onClick={()=>work(name)}>Executar</Button></Card>)}</div>;

  const Bank=()=> <div className="stack"><div className="two-col"><Card><small>Carteira</small><h2>R$ {fmt(p.cash)}</h2></Card><Card><small>Banco</small><h2>R$ {fmt(p.bank)}</h2></Card></div><Card><label className="field">Valor<input type="number" value={bankAmount} onChange={e=>setBankAmount(e.target.value)} min="1"/></label><div className="button-row"><Button onClick={()=>bank('deposit')}>Depositar</Button><Button onClick={()=>bank('withdraw')} kind="secondary">Sacar</Button><Button onClick={()=>setBankAmount(p.bank)} kind="ghost">Sacar tudo</Button></div></Card></div>;

  const Market=()=> <div className="stack">{game.market.map(m=><Card key={m.id} className={m.bought?'disabled-card':''}><div className="item-top"><div className="item-icon">{m.icon}</div><div><h3>{m.item}</h3><span>Vendedor: {m.seller}</span></div></div><div className="money-row"><div><small>Preço</small><strong>R$ {fmt(m.price)}</strong></div><div><small>Expira em</small><strong>{m.left}</strong></div></div><Button onClick={()=>buyMarket(m)} disabled={m.bought}>{m.bought?'Comprado':'Comprar'}</Button></Card>)}</div>;

  const Missions=()=> <div className="stack">{game.missions.map(m=><Card key={m.id}><div className="card-head"><h3>{m.title}</h3><span>{Math.min(m.progress,m.target)}/{m.target}</span></div><Bar value={m.progress} max={m.target} tone="xp"/><p className="hint">Recompensa: {m.reward}</p><Button onClick={()=>claimMission(m)} disabled={m.claimed||m.progress<m.target}>{m.claimed?'Resgatada':m.progress>=m.target?'Resgatar':'Em progresso'}</Button></Card>)}</div>;

  const views={home:<Home/>,raid:<Raid/>,boss:<Boss/>,duel:<Duel/>,petduel:<Duel pet/>,pets:<Pets/>,items:<Items/>,business:<Business/>,jobs:<Jobs/>,bank:<Bank/>,market:<Market/>,missions:<Missions/>};

  return <main>
    {toast&&<div className="toast">{toast}</div>}
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>ALPHA</strong><small>RPG WEB</small></div></div>
      <nav>{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
      <button className="reset" onClick={reset}>↻ Resetar protótipo</button>
    </aside>
    <section className="content">
      <header className="topbar"><div><div className="eyebrow">ALPHA RPG WEB</div><strong>{tabs.find(x=>x[0]===tab)?.[2]}</strong></div><div className="top-status"><span>❤️ {p.hp}/{p.maxHp}</span><span>💰 R$ {fmt(p.cash)}</span><span>⭐ Lv.{p.level}</span></div></header>
      <div className="page">{views[tab]}</div>
    </section>
  </main>;
}
