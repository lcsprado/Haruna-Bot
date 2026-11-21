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

test('V2: teto de aposta limita o prêmio máximo sem manipular probabilidades',async()=>{
 assert.deepEqual({
  red:V2_ROULETTE.maxRedBlackBet,green:V2_ROULETTE.maxGreenBet,
  hourly:V2_ROULETTE.maxRoundsPerHour
 },{red:1000,green:100,hourly:20})
 const f=fixture()
 await assert.rejects(f.d.roulette('alice',1001,'vermelho'),/máxima/)
 await assert.rejects(f.d.roulette('alice',101,'verde'),/máxima/)
 await assert.rejects(f.d.createGroupRoulette('g@g.us','alice',1001,'preto'),/máxima/)
 await assert.rejects(f.d.joinGroupRoulette('g@g.us','alice',101,'verde'),/máxima/)
 assert.equal(f.stakes.length,0)
 assert.equal(f.balances.alice,100000)
 f.setRoll(0)
 const green=await f.d.roulette('alice',100,'verde')
 assert.equal(green.payout,3600)
 assert.equal(green.profit,3500)
 f.setRoll(1/37)
 const red=await f.d.roulette('alice',1000,'vermelho')
 assert.equal(red.payout,2000)
 assert.equal(red.profit,1000)
 assert.equal(f.stakes.length,2)
 assert.deepEqual(f.stakes.map(x=>x.amount),[100,1000])
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
 await f.d.createGroupRoulette('g@g.us','alice',1000,'vermelho')
 await f.d.joinGroupRoulette('g@g.us','bob',100,'verde')
 const result=await f.d.spinGroupRoulette('g@g.us','alice')
 assert.equal(result.color,'verde')
 assert.equal(result.results[0].payout,0)
 assert.equal(result.results[1].payout,3600)
 assert.equal(f.balances.alice,99000)
 assert.equal(f.balances.bob,103500)
 assert.deepEqual(f.stakes.map(x=>[x.jid,x.amount,x.kind]),
  [['alice',1000,'roleta-coletiva'],['bob',100,'roleta-coletiva']])
 assert.deepEqual(f.credits,[{jid:'bob',amount:3600,note:'roleta-coletiva'}])
 await assert.rejects(f.d.spinGroupRoulette('g@g.us','alice'),/Não existe roleta/)
})

test('V1 permanece com apostas e multiplicadores originais',async()=>{
 const f=fixture(false)
 f.setRoll(0)
 const result=await f.d.roulette('alice',2000,'verde')
 assert.equal(result.payout,72000)
 assert.equal(f.stakes.length,0)
})
