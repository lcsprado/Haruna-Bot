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
