// Garagem Alpha — carros de corrida isolados dos veículos Uber, regras puras.
export const RACING_CARS=Object.freeze([
  {id:'gol',name:'Gol Quadrado',price:150000,stats:{speed:54,accel:54,grip:53,brake:53,durability:58}},
  {id:'uno',name:'Uno Mille',price:150000,stats:{speed:47,accel:65,grip:58,brake:48,durability:54}},
  {id:'corsa',name:'Corsa Wind',price:150000,stats:{speed:50,accel:49,grip:65,brake:62,durability:54}},
  {id:'palio',name:'Palio Fire',price:150000,stats:{speed:66,accel:48,grip:47,brake:50,durability:55}}
])
// Pinturas puramente visuais: não interferem na mecânica das corridas.
export const RACING_COLORS=Object.freeze([
  {id:'prata',name:'Prata',emoji:'🩶',hex:'#BFC4CC'},
  {id:'branco',name:'Branco',emoji:'⚪',hex:'#F3F4F6'},
  {id:'preto',name:'Preto',emoji:'⚫',hex:'#242A34'},
  {id:'cinza',name:'Cinza',emoji:'🔘',hex:'#777E8A'},
  {id:'vermelho',name:'Vermelho',emoji:'🔴',hex:'#D8333F'},
  {id:'azul',name:'Azul',emoji:'🔵',hex:'#2979D6'},
  {id:'verde',name:'Verde',emoji:'🟢',hex:'#3EAD6A'},
  {id:'amarelo',name:'Amarelo',emoji:'🟡',hex:'#E8BD32'},
  {id:'laranja',name:'Laranja',emoji:'🟠',hex:'#EF8732'},
  {id:'roxo',name:'Roxo',emoji:'🟣',hex:'#8650C9'},
  {id:'rosa',name:'Rosa',emoji:'🩷',hex:'#E888B7'},
  {id:'dourado',name:'Dourado',emoji:'🏅',hex:'#CBA63A'}
])
export const RACING_PARTS=Object.freeze([
  {id:'motor',name:'🔧 Motor',benefit:{speed:7,accel:2}},
  {id:'cambio',name:'⚙️ Câmbio',benefit:{accel:7,speed:1}},
  {id:'pneus',name:'🛞 Pneus',benefit:{grip:8}},
  {id:'suspensao',name:'🛠️ Suspensão',benefit:{grip:6,brake:2}},
  {id:'freios',name:'🛑 Freios',benefit:{brake:8}},
  {id:'turbo',name:'💨 Turbo',benefit:{speed:5,accel:5}}
])
export const RACING_UPGRADES=Object.freeze([
  {level:1,name:'Rua',price:15000,seconds:600},
  {level:2,name:'Preparado',price:40000,seconds:1800},
  {level:3,name:'Esportivo',price:100000,seconds:3600},
  {level:4,name:'Competição',price:250000,seconds:7200},
  {level:5,name:'Elite',price:550000,seconds:14400},
  {level:6,name:'Profissional',price:1100000,seconds:28800},
  {level:7,name:'Lendário',price:2200000,seconds:43200}
])
export const RACING_TRACKS=Object.freeze([
  {id:'reta',name:'🛣️ Reta Alpha',weights:{speed:.48,accel:.32,grip:.10,brake:.10}},
  {id:'cidade',name:'🌆 Circuito Urbano',weights:{speed:.20,accel:.25,grip:.29,brake:.26}},
  {id:'serra',name:'⛰️ Serra Fantasma',weights:{speed:.12,accel:.12,grip:.42,brake:.34}}
])
export const RACING_STRATEGIES=Object.freeze([
  {id:'equilibrada',name:'⚖️ Equilibrada',bonuses:{speed:1,accel:1,grip:1,brake:1},wear:9},
  {id:'agressiva',name:'🔥 Agressiva',bonuses:{speed:1.08,accel:1.08,grip:.93,brake:.91},wear:15},
  {id:'tecnica',name:'🎯 Técnica',bonuses:{speed:.94,accel:.96,grip:1.08,brake:1.08},wear:7}
])
export const RACING_TIERS=Object.freeze([
  {id:'rua',name:'Rua',minTuning:0,minDriver:1,npcPower:52,prize:3000,xp:95},
  {id:'bairro',name:'Bairro',minTuning:6,minDriver:4,npcPower:64,prize:4500,xp:150},
  {id:'cidade',name:'Cidade',minTuning:14,minDriver:10,npcPower:84,prize:6500,xp:215},
  {id:'estadual',name:'Estadual',minTuning:22,minDriver:19,npcPower:104,prize:8000,xp:280},
  {id:'elite',name:'Elite',minTuning:30,minDriver:29,npcPower:128,prize:10000,xp:340},
  {id:'lenda',name:'Lenda',minTuning:39,minDriver:40,npcPower:150,prize:12500,xp:410}
])
export const RACING_COOLDOWN_SECONDS=10*60
export const RACING_CHALLENGE_SECONDS=5*60
export const RACING_MIN_CONDITION=35
export const RACING_MAX_CARS=4
export const RACING_MAX_TUNING=RACING_PARTS.length*RACING_UPGRADES.length
export const RACING_TOTAL_UPGRADE_COST=RACING_PARTS.length*RACING_UPGRADES.reduce((s,l)=>s+l.price,0)
export function racingColor(input){
 const id=String(input||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 return RACING_COLORS.find(x=>x.id===id)||null
}
export function racingPart(input){return RACING_PARTS.find(x=>x.id===String(input||'').toLowerCase())||null}
export function racingModel(input){return RACING_CARS.find(x=>x.id===String(input||'').toLowerCase())||null}
export function racingTrack(input){return RACING_TRACKS.find(x=>x.id===String(input||'').toLowerCase())||null}
export function racingStrategy(input){return RACING_STRATEGIES.find(x=>x.id===String(input||'').toLowerCase())||null}
export function racingTier(input){return RACING_TIERS.find(x=>x.id===String(input||'').toLowerCase())||null}
export function racingTuning(upgrades={}){
 return RACING_PARTS.reduce((sum,part)=>sum+Math.max(0,Math.min(7,Number(upgrades?.[part.id])||0)),0)
}
export function racingStats(modelId,upgrades={}){
 const model=racingModel(modelId)
 if(!model)throw Error('Modelo de corrida inválido.')
 const out={...model.stats}
 for(const part of RACING_PARTS){
  const level=Math.max(0,Math.min(7,Number(upgrades?.[part.id])||0))
  for(const [stat,bonus] of Object.entries(part.benefit))out[stat]+=bonus*level
 }
 return out
}
export function racingDriverLevel(exp){
 const value=Math.max(0,Number(exp)||0)
 // Custo crescente: subir de nível exige participar, não apenas ter saldo.
 let remaining=value,level=1
 while(level<50&&remaining>=100+40*(level-1)){
  remaining-=100+40*(level-1);level++
 }
 return level
}
export function racingMaxTier(tuning,driverLevel){
 return [...RACING_TIERS].reverse().find(t=>t.minTuning<=tuning&&t.minDriver<=driverLevel)||RACING_TIERS[0]
}
export function racingPower({modelId,upgrades={},condition=100,driverLevel=1},trackId='cidade',strategyId='equilibrada'){
 const stats=racingStats(modelId,upgrades)
 const track=racingTrack(trackId)||RACING_TRACKS[1]
 const strategy=racingStrategy(strategyId)||RACING_STRATEGIES[0]
 const raw=Object.keys(track.weights).reduce((sum,stat)=>sum+stats[stat]*track.weights[stat]*strategy.bonuses[stat],0)
 const endurance=1-Math.max(0,100-Number(condition||0))*.0027
 const driver=1+Math.min(12,Math.max(0,Number(driverLevel||1)-1)*.30)/100
 return Math.round(raw*Math.max(.73,endurance)*driver*100)/100
}
export function racingDuel(a,b,trackId='cidade',random=Math.random){
 const aPower=racingPower(a,trackId,a.strategy||'equilibrada')
 const bPower=racingPower(b,trackId,b.strategy||'equilibrada')
 const aResult=aPower*(.97+Math.max(0,Math.min(1,random()))*.06)
 const bResult=bPower*(.97+Math.max(0,Math.min(1,random()))*.06)
 return {aPower,bPower,aResult:Math.round(aResult*100)/100,bResult:Math.round(bResult*100)/100,winner:aResult>=bResult?'a':'b'}
}
export function racingNpcDuel(car,tierId='rua',trackId='cidade',random=Math.random){
 const tier=racingTier(tierId)||RACING_TIERS[0]
 const yourPower=racingPower(car,trackId,car.strategy||'equilibrada')
 const yourResult=yourPower*(.97+Math.max(0,Math.min(1,random()))*.06)
 const npcResult=tier.npcPower*(.97+Math.max(0,Math.min(1,random()))*.06)
 return {yourPower,npcPower:tier.npcPower,yourResult:Math.round(yourResult*100)/100,npcResult:Math.round(npcResult*100)/100,won:yourResult>=npcResult}
}
export function racingRepairCost(modelId,upgrades,condition){
 const wear=Math.min(100,Math.max(0,100-Number(condition)))
 if(wear<=0)return 0
 const tuning=racingTuning(upgrades)
 return Math.max(200,Math.ceil(wear*(30+tuning*12)/100)*100)
}
export function racingCashPrize(tierId,won){const t=racingTier(tierId)||RACING_TIERS[0];return won?t.prize:Math.floor(t.prize*.18)}
export function racingXpPrize(tierId,won){const t=racingTier(tierId)||RACING_TIERS[0];return won?t.xp:Math.ceil(t.xp*.40)}
