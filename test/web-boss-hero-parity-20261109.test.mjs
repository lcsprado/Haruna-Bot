import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {readBossCombatHero,bossHeroAttack,bossHeroDefense,settleBossHeroHp} from '../src/neon/pve-boss-hero-bridge.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const segment=games.split('export async function attackBoss(')[1]?.split('\nexport ')[0]
const st={jid:'fake',hp:5200,max_hp:5200,atk:1300,def:900,spd:500,
 class_atk_bonus:150,class_def_bonus:110,class_hp_bonus:300,class_spd_bonus:0,
 weapon_id:'test_weapon',armor_id:'test_armor'}
function fixture(species='pecado_ban',level=100,stage=5){
 const queries=[],f={async query(q,params=[]){
  queries.push(String(q))
  if(String(q).includes('FROM player_hero_mode'))return {rows:[{hero_species:species}]}
  if(String(q).includes('MAX(level)'))return {rows:[{level}]}
  if(String(q).includes('FROM player_hero_mastery_unlocks'))return {rows:[{stage}]}
  throw Error('unexpected SQL: '+String(q).slice(0,100))
 }}
 return {client:f,queries}
}
test('Boss usa heroi do jogador na primeira participacao e preserva maestria V',async()=>{
 const {client,queries}=fixture()
 const hero=await readBossCombatHero(client,'fake',st,{},0)
 assert.equal(hero.heroId,'pecado_ban')
 assert.equal(hero.heroMasteryStage,5)
 assert.equal(hero.heroLevel,100)
 assert.ok(hero.heroStats.maxHp>0)
 assert.ok(hero.maxHp>0)
 assert.ok(hero.heroStoredHp>0)
 assert.equal(queries.length,3)
})
test('Boss nao permite troca de personagem no mesmo Boss, nem hero sem posse',async()=>{
 const f=fixture('pecado_meliodas')
 const hero=await readBossCombatHero(f.client,'fake',st,{heroId:'pecado_diane',heroMasteryStage:4},0)
 assert.equal(hero.heroId,'pecado_diane')
 assert.equal(hero.heroMasteryStage,4)
 assert.equal(f.queries.length,1,'modo e maestria devem ser fixados pelo primeiro ataque')
 const noHero=await readBossCombatHero(f.client,'fake',st,{heroId:null},0)
 assert.equal(noHero,null)
 assert.equal(f.queries.length,1)
 const none=fixture(null,0)
 assert.equal(await readBossCombatHero(none.client,'fake',st,{},0),null)
})
test('Boss reusa HP de combate quando fonte persistida corresponde, sem arredondar duas vezes',async()=>{
 const f=fixture()
 const first=await readBossCombatHero(f.client,'fake',st,{},0)
 const prior={heroId:'pecado_ban',heroMasteryStage:5,heroStoredHp:st.hp,
 heroPersistentMaxHp:first.heroPersistentMaxHp,heroCombatMaxHp:first.heroStats.maxHp,
 heroLastHp:first.hp-13,heroHpRemainder:-.3,heroState:{snatchCharges:1}}
 const next=await readBossCombatHero(f.client,'fake',st,prior,0)
 assert.equal(next.hp,first.hp-13)
 assert.equal(next.heroHpRemainder,-.3)
 assert.equal(next.heroState.snatchCharges,1)
 const updated=settleBossHeroHp(next,prior,next.hp-2)
 assert.ok(updated<st.hp)
 assert.equal(prior.heroStoredHp,updated)
 assert.equal(prior.heroLastHp,next.hp-2)
})
test('Boss ativa habilidade do heroi e defesa sem alterar os valores de classe',async()=>{
 const f=fixture('pecado_diane')
 const hero=await readBossCombatHero(f.client,'fake',st,{},0)
 assert.equal(bossHeroAttack(null,500,1),null)
 assert.equal(bossHeroDefense(null,500,{}),null)
 const attack=bossHeroAttack(hero,500,8)
 assert.ok(attack.damage>0)
 assert.ok(attack.state&&typeof attack.state==='object')
 const shield=bossHeroDefense(hero,300,attack.state)
 assert.ok(shield.damage<=300)
})
test('Boss Web integra heroi e conserva rollback na transacao de origem',()=>{
 assert.ok(segment)
 assert.match(segment,/const activeHeroId=pinnedHero/)
 assert.match(segment,/const hero=await readBossCombatHero\(c,jid,st,/)
 assert.match(segment,/const heroHit=bossHeroAttack\(hero,baseDamage/)
 assert.match(segment,/const heroDefenseHit=bossHeroDefense\(hero,bossRawDamage/)
 assert.match(segment,/const storedHp=hero\?settleBossHeroHp\(hero,s\.participants\[jid\],php\):php/)
 assert.match(segment,/if\(s\.hp<=0&&hero\)/)
 assert.match(segment,/return retryBossDeadlock\(\(\)=>tx\(async c=>\{/)
})
