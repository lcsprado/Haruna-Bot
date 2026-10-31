import test from 'node:test'
import assert from 'node:assert/strict'
import {createApostaEngine,APOSTA_GROUP_JID,APOSTA_QUESTIONS,
 APOSTA_QUESTIONS_PER_PLAYER,APOSTA_PRIZE,APOSTA_RISK} from '../src/neon/aposto-consegue.js'
class FakeDB{
 constructor(){this.store=null;this.wallets=new Map([
  ['alice',{cash:100000,bank:100000}],['bob',{cash:100000,bank:100000}],
  ['carol',{cash:100000,bank:100000}],['dave',{cash:20000,bank:100000}]])
  this.ledger=[];this.gate=Promise.resolve()
 }
 async connect(){let unlock=null,snapshot=null
  return {query:async(sql,p=[])=>{
   if(sql==='BEGIN'){const prev=this.gate;this.gate=new Promise(r=>unlock=r);await prev
    snapshot={store:structuredClone(this.store),wallets:structuredClone([...this.wallets]),ledger:structuredClone(this.ledger)}
    return {rows:[],rowCount:0}}
   if(sql==='COMMIT'){unlock?.();return {rows:[],rowCount:0}}
   if(sql==='ROLLBACK'){
    this.store=snapshot.store;this.wallets=new Map(snapshot.wallets);this.ledger=snapshot.ledger
    unlock?.();return {rows:[],rowCount:0}}
   return this.query(sql,p)
  },release:()=>{}}
 }
 async query(sql,p=[]){
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1}
  if(sql.startsWith('SELECT value FROM trevo_settings'))return {rows:this.store?[{value:structuredClone(this.store)}]:[],rowCount:this.store?1:0}
  if(sql.startsWith('INSERT INTO trevo_settings')){this.store=JSON.parse(p[1]);return {rows:[],rowCount:1}}
  if(sql.startsWith('SELECT cash,bank FROM wallets')){const w=this.wallets.get(p[0]);return {rows:w?[structuredClone(w)]:[],rowCount:w?1:0}}
  if(sql.startsWith('UPDATE wallets SET cash=cash-$2')){const w=this.wallets.get(p[0]);if(!w||w.cash<p[1]||w.bank<p[2])return {rows:[],rowCount:0}
   w.cash-=p[1];w.bank-=p[2];return {rows:[{jid:p[0]}],rowCount:1}}
  if(sql.startsWith('UPDATE wallets SET cash=cash+$2')){const w=this.wallets.get(p[0]);if(!w)return {rows:[],rowCount:0}
   w.cash+=p[1];w.bank+=p[2];return {rows:[{jid:p[0]}],rowCount:1}}
  if(sql.startsWith('INSERT INTO transactions')){this.ledger.push({p});return {rows:[],rowCount:1}}
  throw Error('SQL nao simulado: '+sql.slice(0,100))
 }
}
function harness({send,balances}={}){
 let now=1_000_000,seq=0
 const db=new FakeDB()
 if(balances)for(const [id,b] of Object.entries(balances))db.wallets.set(id,structuredClone(b))
 const delivered=[]
 const sendMessage=async(chat,text)=>{if(send)await send(chat,text);delivered.push({chat,text})
  return {key:{id:'aposto-msg-'+(++seq)}}}
 const engine=createApostaEngine({db,sendMessage,clock:()=>now,logger:{warn:()=>{},error:(...a)=>{throw Error(a.join(' '))}}})
 const advance=ms=>{now+=ms}
 const join=id=>engine.join({chat:APOSTA_GROUP_JID,sender:id,name:id})
 const vote=(id,choice)=>engine.vote({chat:APOSTA_GROUP_JID,sender:id,choice})
 const answer=(id,answer)=>engine.answer({chat:APOSTA_GROUP_JID,sender:id,answer})
 async function start(){
  await engine.open();await engine.tick()
  await join('alice');await join('bob');await join('carol')
  await engine.tick()
  assert.equal(db.store.phase,'betting')
 }
 async function question(){
  advance(35001);await engine.tick()
  assert.equal(db.store.phase,'question-delivery')
  advance(4501);await engine.tick()
  assert.equal(db.store.phase,'answering')
 }
 async function next(){
  advance(6501);await engine.tick()
 }
 return {db,engine,delivered,advance,join,vote,answer,start,question,next}
}
test('banco tem 24 perguntas medias e 24 dificeis, com respostas objetivas',()=>{
 assert.equal(APOSTA_QUESTIONS_PER_PLAYER,4)
 assert.equal(APOSTA_PRIZE,100000)
 assert.equal(APOSTA_RISK,50000)
 assert.equal(APOSTA_QUESTIONS.medio.length,24)
 assert.equal(APOSTA_QUESTIONS.dificil.length,24)
 for(const q of [...APOSTA_QUESTIONS.medio,...APOSTA_QUESTIONS.dificil]){
  assert.equal(q.length,3);assert.ok(q.every(Boolean))}
})
test('cada inscrito exige !participar; quem entra tarde ganha quatro perguntas completas',async()=>{
 const a=harness();await a.start()
 assert.equal(a.db.store.order.length,3)
 assert.equal(a.db.store.current.eligible.length,2)
 assert.equal((await a.vote('dave','confio')).kind,'not-eligible')
 await a.question()
 const q=APOSTA_QUESTIONS[a.db.store.current.difficulty][a.db.store.current.questionIndex]
 assert.equal((await a.answer('alice',q[1])).kind,'answered')
 assert.equal((await a.join('dave')).kind,'joined')
 assert.equal(a.db.store.order.length,4)
 assert.equal(a.db.store.history.length,1)
 for(let i=1;i<16;i++){
  await a.next()
  if(a.db.store.status==='completed')break
  assert.equal(a.db.store.phase,'betting')
  await a.question()
  const r=a.db.store.current
  // Uma tentativa errada encerra exatamente a rodada do desafiado.
  const real=APOSTA_QUESTIONS[r.difficulty][r.questionIndex][1]
  assert.equal((await a.answer(r.challenger,'resposta deliberadamente incorreta')).kind,'answered')
  assert.notEqual(real,'resposta deliberadamente incorreta')
 }
 await a.next()
 assert.equal(a.db.store.status,'completed')
 assert.equal(a.db.store.history.length,16)
 for(const id of a.db.store.order)assert.equal(a.db.store.players[id].done,4)
 for(const id of a.db.store.order)assert.deepEqual(a.db.store.history.filter(r=>r.challenger===id).map(r=>r.difficulty),['medio','medio','dificil','dificil'])
 assert.equal((await a.join('dave')).kind,'closed')
})
test('acerto paga 100 mil divididos para desafiado e confiante, duvidador perde 50 mil',async()=>{
 const a=harness();await a.start()
 assert.equal((await a.vote('bob','duvido')).kind,'voted')
 assert.equal((await a.vote('bob','confio')).kind,'already')
 assert.equal((await a.vote('carol','confio')).kind,'voted')
 await a.engine.tick()
 a.advance(4501);await a.engine.tick()
 assert.equal(a.db.store.phase,'answering')
 const r=a.db.store.current,q=APOSTA_QUESTIONS[r.difficulty][r.questionIndex][1]
 assert.equal((await a.answer('alice',q)).correct,true)
 assert.deepEqual(a.db.wallets.get('alice'),{cash:150000,bank:100000})
 assert.deepEqual(a.db.wallets.get('bob'),{cash:50000,bank:100000})
 assert.deepEqual(a.db.wallets.get('carol'),{cash:150000,bank:100000})
 assert.equal(a.db.store.players.bob.net,-50000)
 assert.equal((await a.answer('alice',q)).kind,'not-open')
 assert.equal(a.db.store.history.length,1)
})
test('erro devolve reserva a duvidador e paga premio; confiante recebe zero',async()=>{
 const a=harness({balances:{bob:{cash:20000,bank:100000}}});await a.start()
 assert.equal((await a.vote('bob','duvido')).kind,'voted')
 assert.deepEqual(a.db.wallets.get('bob'),{cash:0,bank:70000})
 assert.equal((await a.vote('carol','confio')).kind,'voted')
 await a.engine.tick();a.advance(4501);await a.engine.tick()
 assert.equal((await a.answer('alice','resposta errada')).correct,false)
 assert.deepEqual(a.db.wallets.get('bob'),{cash:120000,bank:100000})
 assert.equal(a.db.store.players.bob.net,100000)
 assert.equal(a.db.store.players.carol.net,0)
 assert.equal(a.db.store.history[0].correct,false)
})
test('duvido so e aceito com saldo total de 50 mil; reserva nao e cobrada duas vezes',async()=>{
 const a=harness({balances:{bob:{cash:15000,bank:34000}}});await a.start()
 assert.equal((await a.vote('bob','duvido')).kind,'insufficient')
 assert.deepEqual(a.db.wallets.get('bob'),{cash:15000,bank:34000})
 assert.equal((await a.vote('carol','duvido')).kind,'voted')
 assert.equal((await a.vote('carol','duvido')).kind,'already')
 assert.deepEqual(a.db.wallets.get('carol'),{cash:50000,bank:100000})
 assert.equal(a.db.ledger.filter(x=>x.p[3]==='event_bet_hold').length,1)
})
test('cancelamento devolve apostas em aberto e bloqueia novos pagamentos',async()=>{
 const a=harness({balances:{bob:{cash:20000,bank:100000}}});await a.start()
 assert.equal((await a.vote('bob','duvido')).kind,'voted')
 assert.equal(await a.engine.cancel(),true)
 assert.deepEqual(a.db.wallets.get('bob'),{cash:20000,bank:100000})
 assert.equal((await a.vote('bob','duvido')).kind,'not-open')
 assert.equal(a.db.store.status,'cancelled')
 assert.equal(await a.engine.cancel(),false)
})
test('nao abre a pergunta quando falha envio; resposta nao pode premiar',async()=>{
 let fail=false
 const a=harness({send:async(_chat,text)=>{if(text.includes('PERGUNTA PARA')&&fail)throw Error('offline')}})
 await a.start();fail=true;a.advance(35001);await a.engine.tick()
 assert.equal(a.db.store.phase,'question-delivery')
 assert.equal((await a.answer('alice','Ottawa')).kind,'not-open')
 fail=false;await a.engine.tick();a.advance(4501);await a.engine.tick()
 assert.equal(a.db.store.phase,'answering')
})
test('estado recuperado em reinicio nao duplica inscricao nem distribuicao',async()=>{
 const a=harness();await a.start()
 const second=createApostaEngine({db:a.db,sendMessage:async()=>({key:{id:'restarted'}}),clock:()=>1000000})
 assert.equal(await second.open(),true)
 assert.equal((await second.join({chat:APOSTA_GROUP_JID,sender:'alice',name:'Alice'})).kind,'already')
 assert.equal(a.db.store.order.length,3)
})
