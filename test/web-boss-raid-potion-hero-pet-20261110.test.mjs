import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PLAYER_POTIONS,playerPotionHealAmount} from '../src/neon/player-potions.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const begin=games.indexOf('function raidPotion(rows,maxHp)')
const end=games.indexOf('function raidCombatPetState(',begin)
assert.ok(begin>=0&&end>begin)
const code=games.slice(begin,end)
const raidPotion=new Function('playerPotionHealAmount',code+'\nreturn raidPotion')(playerPotionHealAmount)
function bossBlock(){
 const at=games.indexOf('export async function attackBoss(')
 assert.ok(at>0)
 const end=games.indexOf('\nexport ',at+20)
 return games.slice(at,end<0?undefined:end)
}
function raidBlock(){
 const at=games.indexOf('export async function raidRound(')
 assert.ok(at>0)
 const end=games.indexOf('\nexport ',at+20)
 return games.slice(at,end<0?undefined:end)
}
const boss=bossBlock(),raid=raidBlock()

test('AB-01: doses de HP na Web coincidem com percentual do WhatsApp e mínimo histórico',()=>{
 assert.deepEqual(Object.keys(PLAYER_POTIONS),['pocao_p','pocao_m','pocao_g','elixir_supremo'])
 for(const hp of [10,100,600,4700,8000,10000]){
  assert.equal(playerPotionHealAmount('pocao_p',hp),Math.max(35,Math.ceil(hp*.1)))
  assert.equal(playerPotionHealAmount('pocao_m',hp),Math.max(80,Math.ceil(hp*.2)))
  assert.equal(playerPotionHealAmount('pocao_g',hp),Math.max(160,Math.ceil(hp*.4)))
  assert.equal(playerPotionHealAmount('elixir_supremo',hp),hp)
 }
 assert.equal(playerPotionHealAmount('pocao_inexistente',8000),0)
 assert.equal(playerPotionHealAmount('pocao_p',-1),0)
})

test('AB-01: Raid escolhe cura proporcional sem dar poção de graça nem reduzir quantidade',()=>{
 const potions=[{item_id:'pocao_p',quantity:1},{item_id:'pocao_m',quantity:1},
                 {item_id:'pocao_g',quantity:0},{item_id:'elixir_supremo',quantity:1}]
 const selected=raidPotion(potions,8000)
 assert.equal(selected.item_id,'elixir_supremo')
 assert.equal(selected.heal,8000)
 assert.equal(raidPotion([{item_id:'pocao_m',quantity:2}],6500).heal,1300)
 assert.equal(raidPotion([{item_id:'pocao_p',quantity:0}],8000),null)
 assert.equal(potions[0].quantity,1)
 assert.doesNotMatch(code,/pocao_p:35|pocao_m:80|pocao_g:160/)
})

test('AB-01: Boss Web utiliza a mesma regra na cura automática',()=>{
 assert.match(games,/import \{playerPotionHealAmount\} from '\.\/player-potions\.js'/)
 assert.match(boss,/const available=inv\.map\(x=>\(\{\.\.\.x,heal:playerPotionHealAmount\(x\.item_id,effectiveMaxHp\)\}\)\)/)
 assert.doesNotMatch(boss,/const heals=\{pocao_p:35/)
 assert.match(boss,/UPDATE inventories SET quantity=quantity-1 WHERE jid=\$1 AND item_id=\$2/)
 assert.match(boss,/await c\.query\('UPDATE stats SET hp=\$1 WHERE jid=\$2'/)
})

test('AB-01: Boss não escala o herói jogável para reserva após desmaio',()=>{
 assert.match(boss,/if\(reserve&&reserve\.species!==activeHeroId&&Number\(reserve\.hp\)>0/)
 assert.match(boss,/if\(reserve&&reserve\.species!==heroId&&Number\(reserve\.hp\)>0/)
 assert.match(boss,/reserve\?\.species!==activeHeroId/)
})

test('AB-01: Raid remove todos os Pecados de snapshots pet antigos antes de calcular sinergia',()=>{
 assert.match(games,/import \{[^}]*PECADOS_HERO_IDS[^}]*\} from '\.\/sete-pecados-catalog\.js'/)
 const at=raid.indexOf('for(const p of alive){')
 const until=raid.indexOf('let pb={damage:0,crit:0}',at)
 assert.ok(at>=0&&until>at)
 const snippet=raid.slice(at+'for(const p of alive){'.length,until)
 const fn=new Function('p','PECADOS_HERO_IDS',snippet+";return {team:p.teamPassives,primary:p.pet,reserve:p.reservePet}")
 const heroes=['pecado_ban','pecado_meliodas','pecado_king','pecado_diane']
 const original={
   pet:{species:'pecado_ban'},reservePet:{species:'pecado_king'},
   teamPassives:[{species:'pecado_meliodas'},{species:'dragao_solar'}]
 }
 const output=fn(structuredClone(original),heroes)
 assert.equal(output.primary,null)
 assert.equal(output.reserve,null)
 assert.deepEqual(output.team,[{species:'dragao_solar'}])
 assert.equal(original.pet.species,'pecado_ban','test inputs not mutated')
})

test('AB-01: Raid não troca pet do slot 3 por Pecado do slot 1',()=>{
 assert.match(raid,/if\(primary&&!PECADOS_HERO_IDS\.includes\(String\(primary\.species\|\|''\)\)&&primary\.species!==p\.heroId&&Number\(primary\.hp\)>0/)
 assert.match(raid,/await persistRaidCombatPet\(c,p\.jid,p\.pet\)/)
 assert.match(raid,/p\.pet=primary/)
})
