import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {readRaidActiveHero,applyRaidHeroSnapshot,raidHeroPetSnapshot,raidHeroRoundHit,raidHeroDefend,settleRaidHeroHp,applyRaidKingAllyHeal} from '../src/neon/pve-raid-hero-bridge.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const region=name=>{
 const start=games.indexOf('export async function '+name+'(')
 const end=games.indexOf('\nexport ',start+25)
 assert.ok(start>=0,name+' deve existir')
 return games.slice(start,end<0?undefined:end)
}
const st={
 jid:'fake-a',hp:2600,max_hp:5200,atk:1150,def:900,spd:500,class_id:'samurai',
 class_applied:true,class_atk_bonus:40,class_def_bonus:80,class_hp_bonus:200,
 weapon_id:'test_weapon',armor_id:'test_armor',boot_id:'test_boot',helmet_id:'test_helm'
}
const gear={
 weapon:{atk:140,def:0,hp:0,crit:.45},
 armor:{atk:0,def:100,hp:110,crit:0},
 boot:{atk:0,def:0,hp:60,crit:0},
 helmet:{atk:0,def:70,hp:90,crit:0}
}
const ench={atk:20,def:15,attackPct:.03,crit:.05}
const gearHp=gear.armor.hp+gear.boot.hp+gear.helmet.hp

const dbFor=({id='pecado_ban',owned=true,level=100,stage=5}={})=>{
 const calls=[]
 return {calls,client:{async query(query,params=[]){
  const q=String(query)
  calls.push({q,params})
  if(q.includes('FROM player_hero_mode m'))return {rows:owned?[{hero_species:id}]:[]}
  if(q.includes('MAX(level)'))return {rows:[{level}]}
  if(q.includes('FROM player_hero_mastery_unlocks'))return {rows:[{stage}]}
  throw Error('unmocked readonly SQL '+q.slice(0,120))
 }}}
}

test('Raid: sem heroi selecionado mantem classe e sem consultas de maestria',async()=>{
 const x=dbFor({owned:false})
 const result=await readRaidActiveHero(x.client,'fake-a',st,gearHp)
 assert.equal(result,null)
 assert.equal(x.calls.length,1)
 const base=Object.freeze({classApplied:true,crit:.45,hp:2600})
 assert.equal(applyRaidHeroSnapshot(base,result,st,gear,ench,gearHp),base)
 assert.deepEqual(raidHeroPetSnapshot(null,{species:'pecado_ban'},{species:'fenix_alpha'},[{species:'pecado_ban'}]),{primary:{species:'pecado_ban'},reserve:{species:'fenix_alpha'},team:[{species:'pecado_ban'}]})
 assert.equal(raidHeroRoundHit(base,800),null)
})

test('Raid: Ban Lv100 maestria V utiliza personagem no lugar da classe',async()=>{
 const x=dbFor({id:'pecado_ban',level:100,stage:5})
 const hero=await readRaidActiveHero(x.client,'fake-a',st,gearHp)
 assert.equal(hero.heroId,'pecado_ban')
 assert.equal(hero.heroLevel,100)
 assert.equal(hero.heroMasteryStage,5)
 assert.equal(hero.heroGear.weapon,false)
 assert.ok(hero.heroStats.atk>0)
 const out=applyRaidHeroSnapshot({classId:'samurai',classApplied:true,crit:.40,damage:0},hero,st,gear,ench,gearHp)
 assert.equal(out.heroId,'pecado_ban')
 assert.equal(out.classApplied,false)
 assert.equal(out.awakeningStage,0)
 assert.equal(out.heroMasteryStage,5)
 assert.equal(out.heroCombatMaxHp,hero.heroStats.maxHp)
 assert.equal(out.heroPersistentMaxHp,st.max_hp+gearHp)
 assert.equal(out.maxHp,hero.heroStats.maxHp+gearHp)
 assert.equal(out.hp,hero.hp)
 assert.ok(out.crit>.45)
 assert.equal(out.atk,Math.round((hero.heroStats.atk+140+20)*1.03))
 assert.equal(out.def,hero.heroStats.def+100+70+15)
 assert.equal(x.calls.length,3)
 assert.ok(x.calls.every(x=>/SELECT/i.test(x.q)))
})

test('Raid: somente heroi possuido pode ser ativado e nivel/maestria sao limitados',async()=>{
 const missing=dbFor({owned:false})
 assert.equal(await readRaidActiveHero(missing.client,'fake-a',st,gearHp),null)
 const invalid=dbFor({id:'invalid-id'})
 assert.equal(await readRaidActiveHero(invalid.client,'fake-a',st,gearHp),null)
 const capped=dbFor({id:'pecado_diane',level:900,stage:40})
 const a=await readRaidActiveHero(capped.client,'fake-a',st,gearHp)
 assert.equal(a.heroLevel,100)
 assert.equal(a.heroMasteryStage,5)
})

test('Hero-only: heroi nao participa simultaneamente como pet',async()=>{
 const hero={heroId:'pecado_ban'}
 const selected=raidHeroPetSnapshot(hero,{species:'pecado_ban'},{species:'fenix_alpha'},
  [{species:'pecado_ban',slot:1},{species:'pecado_diane',slot:2},{species:'fenix_alpha',slot:3}])
 assert.equal(selected.primary?.species,'fenix_alpha')
 assert.equal(selected.reserve,null)
 assert.equal(selected.team.length,1)
 assert.equal(selected.team[0].species,'fenix_alpha')
})

test('Golpes: maestria usa contador do heroi; nao altera habilidades das classes',()=>{
 const p={heroId:'pecado_ban',heroMasteryStage:5,heroAttacks:7,
  hp:4000,maxHp:6000,heroState:{},heroGear:{weapon:false,armor:false}}
 const hit=raidHeroRoundHit(p,1800)
 assert.equal(hit.attackIndex,8)
 assert.ok(Number.isFinite(hit.damage))
 assert.ok(hit.damage>0)
 assert.ok(hit.state&&typeof hit.state==='object')
 assert.equal(p.heroAttacks,7,'funcao pura nao grava estado')
 const next=raidHeroRoundHit({...p,heroAttacks:24},1800)
 assert.equal(next.attackIndex,25)
 assert.ok(Number.isFinite(next.damage))
})

test('Heroi e classe seguem caminhos distintos no inicio, entrada tardia e turno',()=>{
 const enter=region('joinRaid'),start=region('startRaid'),round=region('raidRound')
 for(const block of [enter,start]){
  assert.match(block,/readRaidActiveHero\(c,jid,st,heroGearHp\)/)
  assert.match(block,/raidHeroPetSnapshot\(raidHero,combatPet,reservePet,/)
  assert.match(block,/applyRaidHeroSnapshot\(s\.players\[jid\]/)
  assert.match(block,/await saveGame\(/)
 }
 assert.match(round,/const heroHit=raidHeroRoundHit\(p,baseDmg\)/)
 assert.match(round,/const classHit=heroHit/)
 assert.match(round,/:classAttack\(/)
 assert.match(round,/p\.heroState=heroHit\.state/)
 assert.match(round,/p\.heroAttacks=heroHit\.attackIndex/)
 assert.match(round,/await saveGame\(/)
})


test('Raid: HP do heroi converte dano por delta entre rodadas e preserva restos fracionarios',()=>{
 const p={jid:'fake-a',heroId:'pecado_ban',hp:7000,maxHp:7000,heroStoredHp:2600,heroLastHp:7000,heroHpRemainder:0,heroPersistentMaxHp:5200}
 assert.equal(settleRaidHeroHp(p),2600)
 for(let i=0;i<10;i++){
  p.hp-=1
  settleRaidHeroHp(p)
 }
 assert.equal(p.heroStoredHp,2593,'10 de dano em escala 7000 -> 5200 devem custar 7 HP')
 assert.ok(Math.abs(p.heroHpRemainder)<1)
 p.hp=0
 assert.equal(settleRaidHeroHp(p),0)
 assert.equal(p.heroHpRemainder,0)
})


test('Raid: defesa do heroi usa estado proprio e a classe permanece separada',()=>{
 const p={jid:'fake-a',heroId:'pecado_diane',heroState:{heavyMetalCharges:1},heroGear:{defense:0}}
 const r=raidHeroDefend(p,1000)
 assert.ok(r.damage<1000)
 assert.ok(r.state&&typeof r.state==='object')
 assert.equal(raidHeroDefend({classId:'paladin'},1000),null)
 assert.equal(p.heroState.heavyMetalCharges,1,'helper nao deve modificar o estado da origem')
})
test('Raid: King cura somente o aliado vivo mais ferido, sem ultrapassar o maximo',()=>{
 const king={jid:'king',heroId:'pecado_king',hp:3000,maxHp:5000,alive:true}
 const ally={jid:'a',hp:1000,maxHp:5000,alive:true}
 const other={jid:'b',hp:4500,maxHp:5000,alive:true}
 const result=applyRaidKingAllyHeal({king,a:ally,b:other},king,700)
 assert.deepEqual(result,{target:'a',healed:700})
 assert.equal(ally.hp,1700)
 assert.equal(king.hp,3000)
 assert.equal(other.hp,4500)
 assert.equal(king.heroAllyHealing,700)
 assert.equal(applyRaidKingAllyHeal({king},king,1000),null)
 assert.equal(applyRaidKingAllyHeal({king,a:ally},{...king,heroId:null},200),null)
})

test.todo('Raid: premiar XP/maestria de herois uma vez no encerramento, sem alterar recompensas antigas')
test.todo('Boss Web: alinhar criacao de estado e golpes dos herois, preservando o motor atual de premios')

test('Raid real aplica defesa do heroi e grava HP persistente na derrota e vitoria',()=>{
 const r=region('raidRound')
 assert.match(r,/const heroDefenseHit=raidHeroDefend\(p,protectedDamage\)/)
 assert.match(r,/if\(heroDefenseHit\)p\.heroState=heroDefenseHit\.state/)
 assert.match(r,/const storedHp=p\.heroId\?settleRaidHeroHp\(p\):p\.hp/)
 assert.match(r,/const persistentHp=settleRaidHeroHp\(participant\)/)
 assert.match(r,/UPDATE stats SET hp=\$1 WHERE jid=\$2/)
 assert.match(r,/applyRaidKingAllyHeal\(s\.players,p,classHit\.allyHeal\)/)
})
