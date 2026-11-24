import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const joinSource=games.slice(games.indexOf('export async function joinRaid('),games.indexOf('export async function cancelRaid(')).replace('export async','async')

function joinedFixture(status='lobby'){
  const room={status,level:30,gameType:'raid:30',players:{a:{jid:'a'},b:{jid:'b'}}}
  const writes=[]
  const join=vm.runInNewContext(joinSource+'\njoinRaid',{
    classesOnlyRebootEnabled:()=>false,ensureUser:async()=>{},
    tx:async fn=>fn({query:async()=>({rows:[]})}),assertNoActiveRaidLote:async()=>{},
    resolveRaidRoom:async()=>[room],
    saveGame:async(...args)=>writes.push(args)
  })
  return {join,room,writes}
}

test('existing lobby participant opts out individually without purchasing another key',async()=>{
  const {join,room,writes}=joinedFixture()
  await join('group','a','A',30,{usePet:false})
  assert.equal(room.players.a.usePet,false)
  assert.equal(room.players.b.usePet,undefined)
  assert.equal(writes.length,1)
})

test('normal rejoin does not change pet mode; active participant cannot change mid-fight',async()=>{
  const {join,room,writes}=joinedFixture('active')
  await join('group','a','A',30)
  assert.equal(room.players.a.usePet,undefined)
  await assert.rejects(join('group','a','A',30,{usePet:false}),/Raid já iniciou/)
  assert.equal(writes.length,0)
})

test('start mode preserves default, individual selection and Raidlote',()=>{
  const expression=games.match(/const usePet=(loteAttemptId\|\|!.*)/)?.[1]
  assert.ok(expression)
  const check=(loteAttemptId,host,jid,players,options={})=>Boolean(vm.runInNewContext(expression,{loteAttemptId,host,jid,s:{players},options}))
  assert.equal(check(null,'a','a',{a:{}}),true)
  assert.equal(check(null,'a','a',{a:{usePet:false}}),false)
  assert.equal(check(null,'a','b',{b:{}},{usePet:false}),true)
  assert.equal(check(null,'a','a',{a:{}},{usePet:false}),false)
  assert.equal(check(null,'a','b',{b:{usePet:false}}),false)
  assert.equal(check('attempt','a','a',{a:{usePet:false}},{usePet:false}),true)
})

test('WhatsApp passes individual option and both snapshots exclude reserve and passive pets',()=>{
  for(const call of ['createRaid(chat,sender','joinRaid(chat,sender','startRaid(chat,sender']){
    const line=wa.split('\n').find(x=>x.includes('await '+call)&&x.includes('{usePet}'))
    assert.ok(line,call)
  }
  assert.equal((games.match(/let reservePet=usePet\?await raidReservePet\(c,jid\):null/g)||[]).length,2)
  assert.match(games,/const teamPassives=usePet\?excludeActiveHeroPet/)
  assert.match(games,/const teamPets=usePet\?excludeActiveHeroPet/)
  assert.match(games,/baseRaidPetXp=p\.pet&&Number\(p\.pet\.turns\|\|0\)>0/)
})
