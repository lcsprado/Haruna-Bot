import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {V2_ROULETTE,assertV2RouletteBet} from '../src/neon/reboot-economy-policy.js'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function load(name,deps){
 const start=src.indexOf('async function '+name+'('),end=src.indexOf('\n}\n',start)
 assert.ok(start>=0&&end>start,name)
 return new Function(...Object.keys(deps),'return ('+src.slice(start,end+2)+')')(...Object.values(deps))
}
function fixture(reboot=true){
 let games={},balances={alice:100,bob:100,carol:100},history=[]
 const state=()=>({games,balances,history})
 const d={rebootEconomyEnabled:()=>reboot,ensureUser:async()=>{},Date:{now:()=>1000},Math:Object.create(Math)}
 d.Math.random=()=>0
 d.tx=async f=>{
  const snapshot=structuredClone(state())
  try{return await f({query:async()=>({rows:[{value:{startsAt:1,endsAt:2000,multiplier:15}}]})})}
  catch(e){({games,balances,history}=snapshot);throw e}
 }
 d.loadGame=async(c,chat,type)=>games[chat+'|'+type]||null
 d.clearGame=async(c,chat,type)=>{delete games[chat+'|'+type]}
 d.saveGame=async(c,chat,type,s)=>{games[chat+'|'+type]=s}
 d.credit=async(c,jid,amount,note)=>{balances[jid]+=amount;history.push({jid,amount,note})}
 d.debit=async(c,jid,amount)=>{if(balances[jid]<amount)throw Error('Saldo insuficiente');balances[jid]-=amount}
 d.lucky3xActive=()=>true;d.lucky3xMultiplier=()=>3;d.lucky3xPlayerWins=()=>true
 d.V2_ROULETTE=V2_ROULETTE
 d.assertV2RouletteBet=(amount,choice)=>assertV2RouletteBet(amount,choice,{enabled:reboot})
 d.consumeRouletteAttemptV2=load('consumeRouletteAttemptV2',d)
 d.debitRouletteV2=load('debitRouletteV2',d)
 for(const name of ['groupGamesEventMultiplier','gameTxWithExpiry','refundExpiredGameV2','roulette','coinFlip','createCoinDuel','acceptCoinDuel','createRpsDuel','acceptRpsDuel','createGroupRoulette','spinGroupRoulette','joinGroupRoulette','createTournament','joinTournament','startTournament'])d[name]=load(name,d)
 return {d,state,put:(type,s)=>games['g@g.us|'+type]=s}
}
test('V2 expired coin and RPS challenges refund once before reporting expiry',async()=>{
 for(const [kind,action,args] of [['coin_duel','acceptCoinDuel',[]],['rps_duel','acceptRpsDuel',['pedra']]]){
  const f=fixture()
  f.put(kind+':bob',{challenger:'alice',target:'bob',amount:50,choice:'pedra',expiresAt:999})
  await assert.rejects(f.d[action]('g@g.us','bob',...args),/devolvidos/)
  assert.equal(f.state().balances.alice,150)
  assert.equal(f.state().balances.bob,100)
  await assert.rejects(f.d[action]('g@g.us','bob',...args),/pendente/)
  assert.equal(f.state().history.length,1)
 }
})
test('V2 expired collective games return every reservation once without selecting winners',async()=>{
 for(const [kind,action,s] of [['roulette_group','spinGroupRoulette',{host:'alice',players:{alice:{amount:40},bob:{amount:50}}}],['tournament','startTournament',{host:'alice',players:['alice','bob'],amount:50}]]){
  const f=fixture()
  f.put(kind,{...s,expiresAt:999})
  await assert.rejects(f.d[action]('g@g.us','alice'),/devolvidos/)
  assert.equal(f.state().balances.alice,kind==='tournament'?150:140)
  assert.equal(f.state().balances.bob,150)
  await assert.rejects(f.d[action]('g@g.us','alice'),/Não existe/)
  assert.equal(f.state().history.length,2)
 }
})
test('V2 replacement refunds old escrow and reserves only the new stake',async()=>{
 const f=fixture()
 f.put('coin_duel:bob',{challenger:'alice',target:'bob',amount:50,expiresAt:999})
 await f.d.createCoinDuel('g@g.us','carol','bob',20,'cara')
 assert.equal(f.state().balances.alice,150)
 assert.equal(f.state().balances.carol,80)
 assert.equal(f.state().games['g@g.us|coin_duel:bob'].amount,20)
})
test('V2 refuses old group multiplier even when legacy setting exists; V1 preserves it',async()=>{
 for(const reboot of [true,false]){
  const f=fixture(reboot)
  const r=await f.d.roulette('alice',10,'verde','g@g.us')
  assert.equal(r.payout,reboot?360:15760)
  assert.equal(await f.d.groupGamesEventMultiplier({query:async()=>({rows:[{value:{startsAt:1,endsAt:2000,multiplier:15}}]})},'g@g.us'),reboot?1:15)
 }
})
