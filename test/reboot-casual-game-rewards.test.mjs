import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
function load(name,deps){
 const start=src.indexOf('export async function '+name+'('),end=src.indexOf('\n}\n',start)
 assert.ok(start>=0&&end>start)
 return new Function(...Object.keys(deps),'return ('+src.slice(start,end+2).replace(/^export /,'')+')')(...Object.values(deps))
}
function fixture(reboot){
 const claimed=new Set(),paid=[],keys=[],quotas=new Map()
 const deps={rebootEconomyEnabled:()=>reboot,ensureUser:async()=>{},tx:async f=>f({}),
  loadGame:async(c,chat,kind)=>kind==='quiz'?{c:2,a:['A','B'],started:Date.now()}:kind==='quiz-hourly-v2'?(quotas.get(chat)||null):{number:42,attempts:0,max:10},
  saveGame:async(c,chat,kind,state)=>{if(kind==='quiz-hourly-v2')quotas.set(chat,state)},clearGame:async()=>{},getDoubleEventMultiplier:async()=>2,groupGamesEventMultiplier:async()=>3,
  credit:async(c,jid,amount)=>paid.push([jid,amount]),claimCooldown:async(c,key,seconds)=>{
   assert.equal(seconds,1800);keys.push(key)
   if(claimed.has(key))return {ok:false}
   claimed.add(key);return {ok:true}
  }}
 const start=src.indexOf('async function consumeQuizAttempt('),end=src.indexOf('\n}\n',start)
 assert.ok(start>=0&&end>start)
 deps.consumeQuizAttempt=new Function(...Object.keys(deps),'return ('+src.slice(start,end+2)+')')(...Object.values(deps))
 return {quiz:load('answerQuiz',deps),quota:deps.consumeQuizAttempt,number:load('guessNumber',deps),keys,paid}
}
test('V2 quiz and number share a player-wide reward window across groups',async()=>{
 const f=fixture(true)
 assert.equal((await f.quiz('a@g.us','p',2)).reward,100)
 const result=await f.number('b@g.us','p',42)
 assert.equal(result.won,true);assert.equal(result.reward,0);assert.equal(result.rewardCooldown,true)
 assert.equal((await f.number('b@g.us','q',42)).reward,150)
 assert.deepEqual(f.paid,[['p',100],['q',150]])
 assert.deepEqual(f.keys,['v2:casual-game-reward:p','v2:casual-game-reward:p','v2:casual-game-reward:q'])
})
test('V2 incorrect answers do not consume a reward window',async()=>{
 const f=fixture(true)
 assert.equal((await f.quiz('a@g.us','p',1)).correct,false)
 assert.equal((await f.number('a@g.us','p',20)).won,false)
 assert.equal(f.keys.length,0)
 assert.equal((await f.number('a@g.us','p',42)).reward,150)
})
test('V1 keeps prior rewards and multipliers',async()=>{
 const f=fixture(false)
 assert.equal((await f.quiz('a@g.us','p',2)).reward,6000)
 assert.equal((await f.number('b@g.us','p',42)).reward,9000)
 assert.equal(f.keys.length,0)
})

test('V2 rolling quiz quota counts ten attempts globally and expires individually',async()=>{
 const f=fixture(true),now=1700000000000
 for(let i=0;i<10;i++)await f.quota({},'p',now+i*1000)
 await assert.rejects(f.quota({},'p',now+10000),/Limite de 10 perguntas/)
 await f.quota({},'q',now+10000)
 await f.quota({},'p',now+3600000)
 await assert.rejects(f.quota({},'p',now+3600000),/Limite de 10 perguntas/)
})
test('V2 quiz answers across rooms consume the same limit, even when incorrect',async()=>{
 const f=fixture(true)
 for(let i=0;i<10;i++)assert.equal((await f.quiz(i+'@g.us','p',1)).correct,false)
 await assert.rejects(f.quiz('other@g.us','p',2),/Limite de 10 perguntas/)
 assert.equal((await f.quiz('other@g.us','q',2)).reward,100)
 assert.deepEqual(f.paid,[['q',100]])
})
