import test from 'node:test'
import assert from 'node:assert/strict'
import {isNaturalBossEndError,bossSettlementSnapshot,weeklyBossResultMessages} from '../src/neon/boss-final-results.js'

test('encerramento normal não é falha de combate',()=>{
  assert.equal(isNaturalBossEndError(new Error('Não há Boss ativo. Use !boss para iniciar um.')),true)
  assert.equal(isNaturalBossEndError(new Error('O Superboss semanal encerrou.')),true)
  assert.equal(isNaturalBossEndError(new Error('Falha ao debitar poção')),false)
})

test('snapshot preserva prêmios sem efetuar novas entregas',()=>{
  const result=bossSettlementSnapshot({name:'Golem',maxHp:8000000},[
    {jid:'123',name:'Jogador',position:1,damage:8000000,cash:1000000,exp:12000,drops:[{name:'Caixa Lendária ×3'}]}
  ])
  assert.equal(result.rewards[0].cash,1000000)
  assert.equal(result.rewards[0].drops[0].name,'Caixa Lendária ×3')
  assert.equal(result.maxHp,8000000)
})

test('ranking publicado inclui colocação, XP, dinheiro e drops',()=>{
  const s={mode:'completed',weeklyCompleted:true,name:'Golem',maxHp:8000000,
    result:bossSettlementSnapshot({name:'Golem',maxHp:8000000},[
      {name:'Líder',position:1,damage:5000000,cash:1000000,exp:12000,drops:[{name:'Caixa Lendária ×3'}]},
      {name:'Segundo',position:2,damage:3000000,cash:750000,exp:9000,drops:[]}
    ])}
  const messages=weeklyBossResultMessages(s)
  assert.match(messages[0],/1º Líder/)
  assert.match(messages[0],/2º Segundo/)
  assert.match(messages[0],/Caixa Lendária/)
  assert.match(messages[0],/1.000.000/)
  assert.match(messages[0],/12.000/)
  assert.match(messages.at(-1),/não distribui recompensas novamente/)
})

test('mensagens extensas são divididas sem perder posições',()=>{
  const players=Array.from({length:28},(_,i)=>({
    position:i+1,name:'Participante '+(i+1),damage:30000-i*100,cash:1000,exp:100,petXp:20,drops:[{name:'Caixa Épica'}]
  }))
  const s={mode:'completed',weeklyCompleted:true,result:{bossName:'Golem',maxHp:8000000,rewards:players}}
  const chunks=weeklyBossResultMessages(s,900)
  assert.ok(chunks.length>1)
  assert.ok(chunks.every(c=>c.length<1000))
  for(let i=1;i<=28;i++) assert.match(chunks.join('\n'),new RegExp('\\b'+i+'º Participante '+i+'\\b'))
  assert.deepEqual(weeklyBossResultMessages({mode:'weekly',weeklyCompleted:false}),[])
})
