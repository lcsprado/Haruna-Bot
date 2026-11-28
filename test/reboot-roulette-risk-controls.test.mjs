import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {V2_ROULETTE,assertV2RouletteBet} from '../src/neon/reboot-economy-policy.js'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function load(name,deps){
 const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}\n',start)
 assert.ok(start>=0&&end>start,name)
 return new Function(...Object.keys(deps),'return ('+source.slice(start,end+2)+')')(...Object.values(deps))
}
function fixture(v2=true){
 const games=new Map(),credits=[],stakes=[],balances={alice:100000,bob:100000}
 let clock=1_800_000_000_000,roll=0
 const math=Object.create(Math);math.random=()=>roll
 const d={V2_ROULETTE,Math:math,Date:{now:()=>clock},
  rebootEconomyEnabled:()=>v2,ensureUser:async()=>{},
  assertV2RouletteBet:(amount,choice)=>assertV2RouletteBet(amount,choice,{enabled:v2}),
  groupGamesEventMultiplier:async()=>1,lucky3xPlayerWins:()=>true,lucky3xMultiplier:()=>1}
 d.tx=async fn=>{
  const before=structuredClone({balances,games:[...games],credits,stakes})
  try{return await fn({query:async(sql,args)=>{
    if(sql.includes("'minigame_stake'"))stakes.push({jid:args[0],amount:args[1],kind:args[2]})
    return {rows:[]}
  }})}catch(err){
    Object.assign(balances,before.balances)
    games.clear();for(const [k,v] of before.games)games.set(k,v)
    credits.length=0;credits.push(...before.credits)
    stakes.length=0;stakes.push(...before.stakes)
    throw err
  }
 }
 d.loadGame=async(client,chat,type)=>structuredClone(games.get(chat+'|'+type)||null)
 d.saveGame=async(client,chat,type,state)=>{games.set(chat+'|'+type,structuredClone(state))}
 d.clearGame=async(client,chat,type)=>{games.delete(chat+'|'+type)}
 d.debit=async(client,jid,amount)=>{
  if(balances[jid]<amount)throw new Error('Saldo insuficiente.')
  balances[jid]-=amount
 }
 d.credit=async(client,jid,amount,note)=>{
  balances[jid]+=amount;credits.push({jid,amount,note})
 }
 for(const helper of ['consumeRouletteAttemptV2','debitRouletteV2','gameTxWithExpiry','refundExpiredGameV2'])
  d[helper]=load(helper,d)
 for(const method of ['roulette','createGroupRoulette','joinGroupRoulette','spinGroupRoulette'])
  d[method]=load(method,d)
 return {d,games,balances,stakes,credits,setClock:n=>clock=n,setRoll:n=>roll=n}
}

test('V2: apostas sem teto por cor, com saldo e precisão preservados',async()=>{
 assert.equal(V2_ROULETTE.maxRoundsPerHour,20)
 for(const color of ['vermelho','preto','verde']) {
  assert.equal(assertV2RouletteBet(1000000,color,{enabled:true}),true)
  assert.throws(()=>assertV2RouletteBet(Number.MAX_SAFE_INTEGER,color,{enabled:true}),/precisão/)
 }
 for(const amount of [0,9,10.5,NaN,Infinity,-100])assert.throws(()=>assertV2RouletteBet(amount,'preto',{enabled:true}),/inválida/)
 assert.throws(()=>assertV2RouletteBet(1000,'azul',{enabled:true}),/Cor inválida/)
 const f=fixture()
 await assert.rejects(f.d.roulette('alice',100001,'preto'),/Saldo insuficiente/)
 assert.equal(f.stakes.length,0)
 assert.equal(f.balances.alice,100000)
 f.setRoll(0)
 const green=await f.d.roulette('alice',10000,'verde')
 assert.equal(green.payout,360000)
 assert.equal(green.profit,350000)
 f.setRoll(1/37)
 const red=await f.d.roulette('alice',20000,'vermelho')
 assert.equal(red.payout,40000)
 assert.equal(red.profit,20000)
 f.setRoll(2/37)
 const black=await f.d.roulette('alice',30000,'preto')
 assert.equal(black.payout,60000)
 assert.deepEqual(f.stakes.map(x=>x.amount),[10000,20000,30000])
})

test('V2: 20 apostas por 60min compartilhadas entre roleta solo e coletiva',async()=>{
 const f=fixture()
 f.setRoll(0)
 for(let i=0;i<19;i++)await f.d.roulette('alice',10,'preto')
 await f.d.createGroupRoulette('one@g.us','alice',10,'vermelho')
 assert.equal(f.stakes.length,20)
 await assert.rejects(f.d.roulette('alice',10,'preto'),/20 apostas em 60 minutos/)
 await assert.rejects(f.d.createGroupRoulette('two@g.us','alice',10,'vermelho'),/20 apostas em 60 minutos/)
 assert.equal(f.stakes.length,20)
 await f.d.joinGroupRoulette('one@g.us','bob',10,'verde')
 assert.equal(f.stakes.length,21)
 f.setClock(1_800_003_600_001)
 await f.d.roulette('alice',10,'preto')
 assert.equal(f.stakes.length,22)
})

test('V2: coletiva reserva apostas, credita o vencedor e mantém rastro contábil',async()=>{
 const f=fixture()
 f.setRoll(0)
 await f.d.createGroupRoulette('g@g.us','alice',10000,'vermelho')
 await f.d.joinGroupRoulette('g@g.us','bob',2000,'verde')
 const result=await f.d.spinGroupRoulette('g@g.us','alice')
 assert.equal(result.color,'verde')
 assert.equal(result.results[0].payout,0)
 assert.equal(result.results[1].payout,72000)
 assert.equal(f.balances.alice,90000)
 assert.equal(f.balances.bob,170000)
 assert.deepEqual(f.stakes.map(x=>[x.jid,x.amount,x.kind]),
  [['alice',10000,'roleta-coletiva'],['bob',2000,'roleta-coletiva']])
 assert.deepEqual(f.credits,[{jid:'bob',amount:72000,note:'roleta-coletiva'}])
 await assert.rejects(f.d.spinGroupRoulette('g@g.us','alice'),/Não existe roleta/)
})

test('V1 permanece com apostas e multiplicadores originais',async()=>{
 const f=fixture(false)
 f.setRoll(0)
 const result=await f.d.roulette('alice',2000,'verde')
 assert.equal(result.payout,72000)
 assert.equal(f.stakes.length,0)
})
