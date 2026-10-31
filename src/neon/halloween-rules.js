// Halloween 26–31/10 e caçada extra em 01/11 das 13h às 23h59; loja original encerra ao meio-dia.
export const HALLOWEEN_ID='halloween-alpha-20261026'
export const HALLOWEEN_START=Date.parse('2026-10-26T13:00:00-03:00')
export const HALLOWEEN_END=Date.parse('2026-11-02T00:00:00-03:00')
export const HALLOWEEN_SHOP_END=Date.parse('2026-11-01T12:00:00-03:00')
export const HALLOWEEN_SOUL_ID='alma_amaldicoada_20261026'
export const HALLOWEEN_CORCEL='corcel_espectral_halloween'
export const HALLOWEEN_CORCEL_COST=100
export const HALLOWEEN_BOSSES=Object.freeze([
  {day:'2026-10-26',name:'👻 A Noiva da Névoa',hp:6500000,atk:255,mechanic:'Ilusões e esquiva espectral'},
  {day:'2026-10-27',name:'🌾 O Espantalho Maldito',hp:7500000,atk:280,mechanic:'Maldições que aumentam a defesa'},
  {day:'2026-10-28',name:'🐺 O Lobisomem Escarlate',hp:8500000,atk:310,mechanic:'Fúria crescente abaixo de 50% HP'},
  {day:'2026-10-29',name:'⚰️ O Guardião das Criptas',hp:9500000,atk:330,mechanic:'Armadura de ossos e contra-ataques'},
  {day:'2026-10-30',name:'🎃 O Rei das Abóboras',hp:11000000,atk:355,mechanic:'Servos explosivos e maldição flamejante'},
  {day:'2026-10-31',name:'🐎 O Cavaleiro Sem Cabeça',hp:13500000,atk:390,mechanic:'3 fases; Corcel Espectral e chamas do apocalipse'},
  {day:'2026-11-01',name:'💀 O Imperador das Almas Renascidas',hp:15000000,atk:400,mechanic:'Caçada final com Almas em dobro; abre às 13h'}
])
export const HALLOWEEN_GEAR=Object.freeze([
  {id:'halloween_elmo_abobora_20261026',name:'🎃 Cabeça do Rei Abóbora',category:'helmet',def:116,hp:280,crit:.025,dropDay:'normal',chance:.01},
  {id:'halloween_botas_nevoa_20261026',name:'👻 Botas da Névoa',category:'boots',spd:15,hp:70,crit:.025,dropDay:'normal',chance:.01},
  {id:'halloween_elmo_almas_20261026',name:'💀 Elmo do Soberano das Almas',category:'helmet',def:120,hp:290,crit:.025,dropDay:'final',chance:.015},
  {id:'halloween_botas_cavaleiro_20261026',name:'🔥 Botas do Cavaleiro Fantasma',category:'boots',spd:16,hp:90,crit:.03,dropDay:'final',chance:.015}
])
export function halloweenLocalDay(now=Date.now()){return new Date(now-3*3600000).toISOString().slice(0,10)}
export const HALLOWEEN_EXTRA_START=Date.parse('2026-11-01T13:00:00-03:00')
export function halloweenActive(now=Date.now()){
 return now>=HALLOWEEN_START&&now<HALLOWEEN_END&&!(now>=Date.parse('2026-11-01T00:00:00-03:00')&&now<HALLOWEEN_EXTRA_START)
}
export function halloweenSoulMultiplier(now=Date.now()){
 // Bônus antecipado por decisão do organizador: desde 31/10, enquanto houver Boss de Halloween ativo.
 return halloweenActive(now)&&now>=Date.parse('2026-10-31T00:00:00-03:00')?2:1
}
export function halloweenBoss(now=Date.now()){if(!halloweenActive(now))return null;return HALLOWEEN_BOSSES.find(b=>b.day===halloweenLocalDay(now))||null}
export function halloweenDropCatalog(now=Date.now()){return HALLOWEEN_GEAR.filter(g=>g.dropDay===(halloweenLocalDay(now)>='2026-10-31'?'final':'normal'))}
export function halloweenMinimumDamage(maxHp){return Math.max(15000,Math.ceil(maxHp*.006))}
export function halloweenPhases(hp,maxHp){return hp<=maxHp/3?3:hp<=maxHp*2/3?2:1}
// Um elmo com 3 pets Místicos diferentes concede apenas sustentação no Boss/Raid.
// NUNCA conta como um pet, nem altera a sinergia ofensiva dos 7 Pecados.
export function halloweenMysticHelmetReduction({helmetId,teamStyle,teamCount}={}){
 return helmetId==='halloween_elmo_almas_20261026'&&teamStyle==='mistico'&&teamCount===3?.015:0
}
