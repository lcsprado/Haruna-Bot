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

const raidHandler=wa.slice(wa.indexOf("} else if(['raid','raidstatus'].includes(cmd)){")+"} else if(['raid','raidstatus'].includes(cmd)){".length,wa.indexOf("} else if(['entrar','entrarraide'].includes(cmd)){"))

function quickFixture({room=null,startError=false,cmd='raid'}={}){
  const calls=[]
  const state={name:'Boss',level:50,status:'active',hp:100,maxHp:100,atk:5,host:'a',players:{a:{jid:'a'}}}
  const execute=vm.runInNewContext('(async(args)=>{'+raidHandler+'})',{
    cmd,isGroup:true,sender:'a',chat:'group',msg:{pushName:'A'},
    getRaidCatalog:()=>[{level:50}],collabRaidNumber:Number,
    normalizeItemText:x=>String(x).toLowerCase(),
    getRaidStatuses:async()=>room?[room]:[],
    createRaid:async(...args)=>{calls.push(['create',args[4].usePet]);return {...state,status:'lobby'}},
    startRaid:async(...args)=>{calls.push(['start',args[3].usePet]);if(startError)throw Error('Nível insuficiente');return state},
    progressDailyMission:async()=>{},
    announceStartedRaid:async()=>calls.push(['announce']),
    reply:async text=>calls.push(['reply',text]),
    runRaidCombat:()=>calls.push(['runner']),
    critResistancePercent:()=>0,raidBossCritResistance:()=>0
  })
  return {execute,calls}
}

test('quick start creates and starts exactly once with and without pets',async()=>{
  for(const [args,usePet] of [[['50','go'],true],[['50','go','sempet'],false],[['50','sempet','go'],false]]){
    const {execute,calls}=quickFixture()
    await execute(args)
    assert.equal(JSON.stringify(calls),JSON.stringify([['create',usePet],['start',usePet],['announce']]))
  }
})

test('quick start uses existing own lobby, rejects another host, reports failed start',async()=>{
  const lobby={level:50,status:'lobby',host:'a'}
  const own=quickFixture({room:lobby})
  await own.execute(['50','go'])
  assert.equal(JSON.stringify(own.calls),JSON.stringify([['start',true],['announce']]))
  const other=quickFixture({room:{...lobby,host:'b'}})
  await other.execute(['50','go'])
  assert.equal(other.calls.length,1)
  assert.match(other.calls[0][1],/Somente o host/)
  const fail=quickFixture({startError:true})
  await fail.execute(['50','go'])
  assert.equal(fail.calls.length,3)
  assert.match(fail.calls[2][1],/Sala aberta, mas não foi possível iniciar/)
})
