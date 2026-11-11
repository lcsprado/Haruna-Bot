import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 COFRE_DESTINO_START,COFRE_DESTINO_END,COFRE_DESTINO_ROOMS,COFRE_DESTINO_DOORS,
 COFRE_DESTINO_CASH_CAP,COFRE_DESTINO_XP_CAP,COFRE_DESTINO_PRIZES,
 cofreDestinoResolveChoice,cofreDestinoDebit,rankCofreDestino,isCofreDestinoCheckpoint
} from '../src/neon/cofre-destino-policy.js'

const input=(door,roll,extra={})=>({door,roll,availableBalance:2_000_000,earnedCash:0,earnedXp:0,maxHp:1000,hp:1000,...extra})
test('Somente cinco salas, com tres opcoes transparentes e 20h-22h em Sao Paulo',()=>{
 assert.equal(COFRE_DESTINO_ROOMS,5)
 assert.equal(COFRE_DESTINO_DOORS.length,3)
 assert.deepEqual(COFRE_DESTINO_DOORS.map(x=>x.chance),[100,40,10])
 assert.equal(COFRE_DESTINO_END-COFRE_DESTINO_START,2*60*60*1000)
 assert.equal(new Date(COFRE_DESTINO_START).toISOString(),'2026-11-11T23:00:00.000Z')
 assert.equal(COFRE_DESTINO_CASH_CAP,4_000_000)
 assert.equal(COFRE_DESTINO_XP_CAP,12_000)
})
test('Porta segura nunca perde dinheiro e cura em vez de causar dano',()=>{
 const r=cofreDestinoResolveChoice(input(1,99,{hp:500}))
 assert.equal(r.success,true);assert.equal(r.cash,30000);assert.equal(r.loss,0)
 assert.equal(r.hpNext,700)
})
test('Porta intermediaria tem 40% de vitoria, 60% de derrota',()=>{
 const a=cofreDestinoResolveChoice(input(2,39))
 const b=cofreDestinoResolveChoice(input(2,40))
 assert.equal(a.success,true);assert.equal(a.cash,350000);assert.equal(a.loss,0)
 assert.equal(b.success,false);assert.equal(b.cash,0);assert.equal(b.loss,100000);assert.equal(b.hpNext,770)
})
test('Porta proibida tem jackpot raro, derrota retira saldo e pode matar',()=>{
 const a=cofreDestinoResolveChoice(input(3,9))
 const b=cofreDestinoResolveChoice(input(3,10,{hp:400}))
 assert.equal(a.cash,2000000)
 assert.equal(b.loss,250000)
 assert.equal(b.hpNext,0)
})
test('Nao pode apostar sem saldo para cobrir pior perda',()=>{
 assert.throws(()=>cofreDestinoResolveChoice(input(2,0,{availableBalance:99999})),/insuficiente/)
 assert.throws(()=>cofreDestinoResolveChoice(input(3,0,{availableBalance:249999})),/insuficiente/)
 assert.equal(cofreDestinoResolveChoice(input(1,99,{availableBalance:0})).loss,0)
})
test('Debito usa carteira antes do banco, nunca saldo negativo',()=>{
 assert.deepEqual(cofreDestinoDebit(50000,200000,100000),{cash:0,bank:150000})
 assert.deepEqual(cofreDestinoDebit(200000,300000,100000),{cash:100000,bank:300000})
 assert.throws(()=>cofreDestinoDebit(0,99999,100000),/insuficiente/)
})
test('Pagamento de jackpot respeita teto e nao excede XP bruto',()=>{
 const r=cofreDestinoResolveChoice(input(3,0,{earnedCash:3000000,earnedXp:11000}))
 assert.equal(r.cash,1000000)
 assert.equal(r.xp,1000)
 const x=cofreDestinoResolveChoice(input(1,50,{earnedCash:4000000,earnedXp:12000}))
 assert.equal(x.cash,0);assert.equal(x.xp,0)
})
test('Somente checkpoints nas salas dois, quatro e cinco',()=>{
 assert.deepEqual([1,2,3,4,5].filter(isCofreDestinoCheckpoint),[2,4,5])
})
test('Ranking inclui somente finalistas vivos, ordena lucro liquido e HP',()=>{
 const mk=(id,round,phase,earned,lost,hp,finishedAt=1)=>({jid:id,name:id,state:{round,phase,earnedCash:earned,lostCash:lost,hp,finishedAt}})
 const r=rankCofreDestino([
  mk('r1',5,'finished',500000,0,500),mk('r2',5,'finished',600000,200000,900),
  mk('r3',5,'finished',400000,0,800),mk('r4',4,'left',4000000,0,900),
  mk('r5',5,'dead',5000000,0,0)])
 assert.deepEqual(r.map(x=>x.jid),['r1','r2','r3'])
 assert.equal(r[0].net,500000)
})
test('Premiacao adicional de podium limitada a tres finalistas',()=>{
 assert.deepEqual(COFRE_DESTINO_PRIZES.map(x=>[x.cash,x.fragments]),[
  [2000000,15],[1000000,10],[500000,5]
 ])
})
test('Implementacao integra scheduler, impede reconexao dupla e inclui auditoria',()=>{
 const src=readFileSync(new URL('../src/neon/cofre-destino-20261111.js',import.meta.url),'utf8')
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(src,/pg_advisory_xact_lock/)
 assert.match(src,/FOR UPDATE/)
 assert.match(src,/ON CONFLICT\(key\) DO NOTHING/)
 assert.match(src,/randomInt\(100\)/)
 assert.match(src,/isCofreDestinoCheckpoint\(round\)/)
 assert.match(src,/if\(timer\)return/)
 assert.match(index,/startCofreDestinoScheduler\(sock\)/)
 assert.ok(index.indexOf('if(await handleCofreDestinoCommand')<index.indexOf('if(await handleCofreCommand'))
})
