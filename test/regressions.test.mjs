import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {renderProfileCard} from '../src/neon/profile-card.js'

test('card de perfil renderiza os sistemas atuais',async()=>{
  const png=await renderProfileCard({
    name:'Jogador',title:'Veterano',badge:'Fundador',level:42,exp:2100,
    hp:90,maxHp:120,atk:55,def:40,spd:30,wins:12,losses:3,
    combatRank:2,economyRank:4,players:100,balance:50000,patrimony:250000,
    streak:8,bestStreak:20,weapon:'Espada',armor:'Armadura',clan:'Trevo',
    home:'Mansão',cars:5,motorcycles:6,businesses:3,career:'Gerente',
    pet:'Alpha (dragao, nv. 10)',achievements:['⚔️ LUTADOR']
  })
  assert.ok(Buffer.isBuffer(png))
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10])
  assert.ok(png.length>10000)
})

test('aliases documentados da roleta coletiva possuem dispatch',async()=>{
  const source=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/\['roleta','roletagrupo'\]/)
  assert.match(source,/\['apostar','entrarroleta'\]/)
  assert.match(source,/\['girar','girarroleta'\]/)
})

test('statuspet é documentado e usa o mesmo status de meupet',async()=>{
  const source=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/\*!meupet\* \/ \*!statuspet\*/)
  assert.match(source,/cmd==='meupet'\|\|cmd==='statuspet'/)
})

test('energia do pet possui descanso e custo transacional no Boss',async()=>{
  const dbSource=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const gamesSource=await readFile(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const indexSource=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(dbSource,/descansar:\{hunger:-5,hygiene:0,energy:30,xp:0,rest:true\}/)
  assert.match(dbSource,/last_rest BIGINT NOT NULL DEFAULT 0/)
  assert.match(gamesSource,/Number\(pet\.energy\)<2/)
  assert.match(gamesSource,/UPDATE pets SET energy=\$1 WHERE jid=\$2/)
  assert.match(indexSource,/\*!descansar\* — recupera 30 de energia/)
})

test('Boss distribui dinheiro, XP e drops por colocação na mesma transação',async()=>{
  const dbSource=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const gamesSource=await readFile(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(dbSource,/armadura_golem.*Armadura do Golem Ancestral/)
  assert.match(dbSource,/martelo_golem.*Martelo do Golem Ancestral/)
  assert.match(gamesSource,/const BOSS_PLACEMENT=/)
  assert.match(gamesSource,/150000\*share/)
  assert.match(gamesSource,/grantExpInTransaction\(c,p\.jid,exp\)/)
  assert.match(gamesSource,/caixa_epica/)
  assert.match(gamesSource,/giveBossDrops\(c,p\.jid,position,pb\.drop\)/)
})

test('Boss permite preservar o pet e petaventura consome toda a energia',async()=>{
  const dbSource=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const gamesSource=await readFile(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const indexSource=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(gamesSource,/attackBoss\(chat,jid,name,usePet=true\)/)
  assert.match(indexSource,/atacar sempet/)
  assert.match(indexSource,/normalizeItemText\(args\[0\]\|\|''\)/)
  assert.doesNotMatch(indexSource,/\bnormalize\(args\[0\]/)
  assert.match(gamesSource,/if\(petUnavailable\) pet=null/)
  assert.doesNotMatch(gamesSource,/pet\.energy\)<2\) throw new Error/)
  assert.match(indexSource,/continuará atacando sozinho, sem o bônus dele/)
  assert.match(indexSource,/petAdventure\(sender\)/)
  assert.match(dbSource,/export async function petAdventure\(jid\)/)
  assert.match(dbSource,/UPDATE pets SET energy=0/)
  assert.match(dbSource,/pet_adventure/)
})

test('rendas de trabalho, frotas e negócios descontam imposto de 10%',async()=>{
  const dbSource=await readFile(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const progression=await readFile(new URL('../src/neon/progression.js',import.meta.url),'utf8')
  const indexSource=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(dbSource,/const tax=Math\.floor\(gross\*\.10\)/)
  assert.match(dbSource,/income_tax.*TAXADE te pegou 10% \| trabalho/)
  assert.equal((progression.match(/const tax=Math\.floor\(gross\*\.10\)/g)||[]).length,2)
  assert.match(progression,/TAXADE te pegou 10% \| iFood/)
  assert.match(progression,/TAXADE te pegou 10% \| Uber/)
  assert.match(progression,/TAXADE te pegou 10% \| negócios/)
  assert.match(indexSource,/TAXADE te pegou/)
})
test('regressões conhecidas de escopo não reaparecem',async()=>{
  const source=await readFile(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(source,/const text=fixed\[cmd\][\s\S]{0,160}mentions:\[target\]/)
  assert.match(source,/handleQuickGameFlow\(\{chat,sender,body,reply,msg,isOwner,isGroup\}\)/)
  assert.ok(
    source.indexOf('function petStatusBonus') < source.indexOf('async function start()'),
    'petStatusBonus precisa estar no escopo do dispatcher principal'
  )
  assert.match(source,/async function showMainMenu\(chat,sender,reply\)/)
  assert.doesNotMatch(source,/await mainMenu\(\)/)
})
