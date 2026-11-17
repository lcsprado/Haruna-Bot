import test from 'node:test'
import assert from 'node:assert/strict'
import {pocoExpStart,pocoExpFloorMs,pocoExpDue,pocoExpResolve,pocoExpAdvance,pocoExpStop,POCO_EXPEDITION} from '../src/neon/poco-abismo-expedition.js'
import {readFileSync} from 'node:fs'
const start=(seed=123)=>pocoExpStart({seed,now:1})

test('30 andares com 10, 15 e 20 minutos; sem timers ou 120s',()=>{
 assert.equal(pocoExpFloorMs(1),600000)
 assert.equal(pocoExpFloorMs(10),600000)
 assert.equal(pocoExpFloorMs(11),900000)
 assert.equal(pocoExpFloorMs(20),900000)
 assert.equal(pocoExpFloorMs(21),1200000)
 assert.equal(pocoExpFloorMs(30),1200000)
 assert.throws(()=>pocoExpFloorMs(31),RangeError)
 assert.equal(Array.from({length:30},(_,i)=>pocoExpFloorMs(i+1)).reduce((a,b)=>a+b,0),27000000)
 const a=start()
 assert.equal(a.readyAt,600001)
 assert.equal(pocoExpDue(a,600000),false)
 assert.equal(pocoExpDue(a,600001),true)
 assert.equal(pocoExpResolve(a,{now:100}).ready,false)
 assert.equal(a.phase,'exploring')
})

test('todos começam exatamente iguais independente do personagem; melhorias não são compostas',()=>{
 const a=start(2),b=start(4567)
 assert.deepEqual(a.stats,b.stats)
 assert.deepEqual(a.stats,{hp:1000,maxHp:1000,atk:100,def:100,shield:100,maxShield:100})
 const v={...a,phase:'choose',last:{won:true},readyAt:null}
 const attack=pocoExpAdvance(v,2,{now:1000})
 assert.equal(attack.stats.atk,125)
 const attack2=pocoExpAdvance({...attack,phase:'choose'},2,{now:2000})
 assert.equal(attack2.stats.atk,150)
 const shield=pocoExpAdvance({...attack,phase:'choose'},4,{now:2000})
 assert.equal(shield.stats.maxShield,125)
 assert.equal(shield.stats.shield,125)
 assert.equal(v.stats.atk,100,'sem mutacao do estado original')
})

test('o combate é decidido uma única vez quando termina o horário do andar',()=>{
 const a=start(123)
 const r=pocoExpResolve(a,{now:a.readyAt})
 assert.equal(r.ready,true)
 assert.equal(r.state.floor,1)
 assert.equal(r.state.cleared,1)
 assert.equal(r.state.phase,'choose')
 assert.equal(r.state.last.won,true)
 assert.match(r.state.last.bossName,/andar 1/)
 assert.throws(()=>pocoExpResolve(r.state,{now:a.readyAt+1}),/exploracao ativa/)
 const again=pocoExpResolve(start(123),{now:a.readyAt})
 assert.deepEqual(r.state.stats,again.state.stats,'resultado deterministico por seed')
 assert.deepEqual(r.state.last,again.state.last)
})

test('30 chefes acessíveis com estratégia de melhorias, sem gerar mensagens por turno',()=>{
 let completions=0
 for(let seed=1;seed<=50;seed++){
  let s=start(seed)
  for(let floor=1;floor<=30&&s.phase==='exploring';floor++){
   const resolved=pocoExpResolve(s,{now:s.readyAt}).state
   assert.equal(resolved.floor,floor)
   s=resolved
   if(s.phase!=='choose')break
   const choice=s.stats.hp<450?1:floor%4===0?2:floor%4===1?3:floor%4===2?2:4
   s=pocoExpAdvance(s,choice,{now:floor*2000000})
  }
  if(s.phase==='completed'){assert.equal(s.cleared,30);completions++}
  else assert.ok(s.phase==='ended'&&s.cleared<30)
 }
 assert.ok(completions>=1,'ao menos uma construção deve conseguir completar todos os andares')
})

test('código mantém o piloto restrito ao beta e não altera regras oficiais',()=>{
 const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
 const controller=readFileSync(new URL('../src/neon/poco-abismo-expedition-controller.js',import.meta.url),'utf8')
 assert.match(preview,/if\(BETA_ONLY\)return handlePocoExpeditionCommand/)
 assert.match(preview,/if\(BETA_ONLY\)return\s*\n if\(!ENABLED\)return/)
 assert.match(controller,/if\(!betaAllowed\|\|/)
 assert.match(controller,/pocoClaimFloorInTx/)
 assert.match(controller,/pocoClaimExpeditionDropInTx/)
 assert.match(controller,/pocoRunPlayerTransaction/)
 assert.match(controller,/pocoExpDue/)
 assert.doesNotMatch(controller,/setInterval\(|setTimeout\(/)
})
