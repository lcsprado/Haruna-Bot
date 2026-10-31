import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPokemonQuizEngine,POKEMON_QUIZ_GROUPS,POKEMON_QUIZ_QUESTIONS
} from '../src/neon/pokemon-quiz.js'

class FakeDB{
  constructor(){
    this.store=null;this.wallets=new Map([['alice',0],['bob',0],['carol',0]])
    this.ledger=[];this.gate=Promise.resolve()
  }
  async connect(){
    let release=null
    const c={query:async(sql,params=[])=>{
      if(sql==='BEGIN'){
        const prev=this.gate
        this.gate=new Promise(r=>{release=r})
        await prev
        return {rows:[],rowCount:0}
      }
      if(sql==='COMMIT'||sql==='ROLLBACK'){
        release?.();return {rows:[],rowCount:0}
      }
      return this.query(sql,params)
    },release:()=>{}}
    return c
  }
  async query(sql,p=[]){
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]}
    if(sql.includes('SELECT value FROM trevo_settings')){
      return {rows:this.store?[{value:structuredClone(this.store)}]:[],rowCount:this.store?1:0}
    }
    if(sql.includes('INSERT INTO trevo_settings')){
      this.store=JSON.parse(p[1]);return {rows:[],rowCount:1}
    }
    if(sql.startsWith('UPDATE wallets SET cash=cash+')){
      const previous=this.wallets.get(p[1])
      if(previous===undefined)return {rows:[],rowCount:0}
      this.wallets.set(p[1],previous+p[0])
      return {rows:[{cash:previous+p[0]}],rowCount:1}
    }
    if(sql.includes('INSERT INTO transactions')){
      this.ledger.push({jid:p[0],amount:p[1],note:p[2]})
      return {rows:[],rowCount:1}
    }
    throw new Error('SQL nao simulado: '+sql.slice(0,90))
  }
}
function make({send}={}){
  let now=1_000_000
  let sequence=0
  const db=new FakeDB(),delivered=[]
  const sendMessage=async(group,text)=>{
    if(send)await send(group,text)
    delivered.push({group,text})
    return {key:{id:'alpha-quiz-msg-'+(++sequence)}}
  }
  const engine=createPokemonQuizEngine({db,sendMessage,clock:()=>now,autoStart:true})
  const advance=ms=>{now+=ms}
  const quote=chat=>db.store?.notices?.find(n=>n.id==='question:'+db.store.round)?.sentMessageIds?.[chat]
  const answer=params=>engine.answer({...params,quotedMessageId:params.quotedMessageId??quote(params.chat)})
  const prepare=async()=>{await engine.tick();advance(6000);await engine.tick()}
  return {db,engine,delivered,advance,quote,answer,prepare}
}
test('15 perguntas, quatro alternativas validas, premios fixos totalizam 6,75 milhoes',()=>{
  assert.equal(POKEMON_QUIZ_QUESTIONS.length,15)
  assert.equal(POKEMON_QUIZ_GROUPS.length,2)
  assert.equal(POKEMON_QUIZ_QUESTIONS.reduce((n,q)=>n+q.prize,0),6750000)
  for(const [i,q] of POKEMON_QUIZ_QUESTIONS.entries()){
    assert.equal(q.a.length,4)
    assert.ok(q.c>=1&&q.c<=4)
    assert.equal(q.prize,i<5?200000:i<10?400000:750000)
  }
})
test('primeiro acerto em dois grupos recebe um unico pagamento',async()=>{
  const a=make()
  await a.prepare()
  assert.equal(a.db.store.phase,'answering')
  assert.equal(a.delivered.length,2)
  const q=POKEMON_QUIZ_QUESTIONS[0]
  const results=await Promise.all([
    a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'alice',name:'Alice',choice:q.c}),
    a.answer({chat:POKEMON_QUIZ_GROUPS[1],sender:'bob',name:'Bob',choice:q.c})
  ])
  assert.deepEqual(results.map(r=>r.kind).sort(),['not-open','winner'])
  assert.equal(a.db.ledger.length,1)
  assert.equal([...a.db.wallets.values()].reduce((n,x)=>n+x,0),200000)
  assert.equal(a.db.store.winners.length,1)
  await a.engine.tick()
  assert.equal(a.delivered.length,4)
})
test('erros nao fecham rodada e cada pessoa possui duas tentativas',async()=>{
  const a=make()
  await a.prepare()
  const q=POKEMON_QUIZ_QUESTIONS[0],wrong=q.c===1?2:1
  const ask=(sender,choice)=>a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender,name:sender,choice})
  assert.equal((await ask('alice',wrong)).kind,'wrong')
  assert.equal((await ask('alice',wrong)).kind,'wrong')
  assert.equal((await ask('alice',q.c)).kind,'limit')
  assert.equal(a.db.ledger.length,0)
  assert.equal((await ask('bob',q.c)).kind,'winner')
  assert.equal((await ask('bob',q.c)).kind,'not-open')
  assert.equal(a.db.ledger.length,1)
})
test('falha no segundo grupo impede abrir a pergunta ate ambos receberem',async()=>{
  let blocked=true
  const a=make({send:async group=>{
    if(group===POKEMON_QUIZ_GROUPS[1]&&blocked)throw Error('simulacao WhatsApp offline')
  }})
  await a.engine.tick()
  assert.equal(a.db.store.phase,'delivery')
  assert.equal((await a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'alice',choice:2})).kind,'not-open')
  blocked=false
  await a.engine.tick()
  assert.equal(a.db.store.phase,'delivery')
  a.advance(6000)
  await a.prepare()
  assert.equal(a.db.store.phase,'answering')
  assert.equal(a.delivered.length,2)
})
test('timeout, reinicio e fim do evento nao duplicam rodadas nem premiacoes',async()=>{
  const a=make()
  await a.prepare()
  a.advance(45001)
  await a.engine.tick()
  assert.equal(a.db.store.phase,'result')
  assert.equal(a.db.store.round,0)
  a.advance(8001)
  await a.engine.tick()
  assert.equal(a.db.store.round,1)
  // Nova instancia com o mesmo banco recupera o estado anterior.
  const restart=createPokemonQuizEngine({db:a.db,sendMessage:async()=>{},clock:()=>1_053_002})
  await restart.tick()
  assert.equal(a.db.store.round,1)
  // Completa as 14 rodadas restantes com timeout, sem credito.
  for(let i=1;i<15;i++){
    a.advance(6000);await a.engine.tick()
    a.advance(45001);await a.engine.tick()
    a.advance(8001);await a.engine.tick()
  }
  assert.equal(a.db.store.status,'completed')
  assert.equal(a.db.ledger.length,0)
  await a.engine.tick()
  assert.equal(a.db.store.status,'completed')
  assert.equal(a.db.store.round,14)
})
test('cancelamento preserva premios ja pagos e bloqueia novas respostas',async()=>{
  const a=make()
  await a.prepare()
  const ans=await a.answer({chat:POKEMON_QUIZ_GROUPS[1],sender:'alice',name:'Alice',choice:POKEMON_QUIZ_QUESTIONS[0].c})
  assert.equal(ans.kind,'winner')
  assert.equal(await a.engine.cancel(),true)
  assert.equal(a.db.store.status,'cancelled')
  assert.equal(a.db.ledger.length,1)
  const late=await a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'bob',name:'Bob',choice:2})
  assert.equal(late.kind,'not-open')
  assert.equal(a.db.ledger.length,1)
})

test('pausa de seguranca bloqueia resposta sem estornar premio ja pago; retoma rodada inteira',async()=>{
  const a=make()
  await a.prepare()
  const winning=await a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'alice',name:'Alice',choice:POKEMON_QUIZ_QUESTIONS[0].c})
  assert.equal(winning.kind,'winner')
  await a.engine.tick()
  assert.equal(await a.engine.pause(),true)
  assert.equal(a.db.store.status,'paused')
  assert.equal(a.db.store.winners.length,1)
  assert.equal(a.db.ledger.length,1)
  assert.equal((await a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'bob',choice:1})).kind,'not-open')
  assert.equal(await a.engine.resume(),true)
  assert.equal(a.db.store.status,'running')
  assert.equal(a.db.store.phase,'result')
  assert.equal(a.db.ledger.length,1)
  const replay=await a.answer({chat:POKEMON_QUIZ_GROUPS[1],sender:'bob',choice:POKEMON_QUIZ_QUESTIONS[0].c})
  assert.equal(replay.kind,'not-open')
  await a.engine.tick()
  assert.equal(a.db.ledger.length,1)
})
test('pausa antes de vencedor reinicia a pergunta com tentativas zeradas',async()=>{
  const a=make()
  await a.prepare()
  const wrong=POKEMON_QUIZ_QUESTIONS[0].c===1?2:1
  await a.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'alice',choice:wrong})
  assert.equal(await a.engine.pause(),true)
  assert.equal(await a.engine.resume(),true)
  assert.equal(a.db.store.phase,'delivery')
  assert.deepEqual(a.db.store.attempts,{})
  await a.prepare()
  assert.equal(a.db.store.phase,'answering')
})
test('sem autoStart nao cria uma nova competicao depois de falha',async()=>{
  const a=make()
  const freshDb=new FakeDB()
  const engine=createPokemonQuizEngine({db:freshDb,sendMessage:async()=>{},clock:()=>123,autoStart:false})
  await engine.tick()
  assert.equal(freshDb.store,null)
  await a.engine.tick()
  assert.equal(a.db.store.status,'running')
})

test('nao aceita chute sem ter visto e citado a pergunta; sem premio',async()=>{
  const a=make()
  await a.prepare()
  const chat=POKEMON_QUIZ_GROUPS[0],correct=POKEMON_QUIZ_QUESTIONS[0].c
  assert.equal((await a.engine.answer({chat,sender:'alice',choice:correct})).kind,'unquoted')
  assert.equal((await a.engine.answer({chat,sender:'alice',choice:correct,quotedMessageId:a.quote(POKEMON_QUIZ_GROUPS[1])})).kind,'unquoted')
  assert.equal(a.db.ledger.length,0)
  assert.deepEqual(a.db.store.attempts,{})
  assert.equal((await a.answer({chat,sender:'alice',choice:correct})).kind,'winner')
  assert.equal(a.db.ledger.length,1)
})

test('pergunta anunciada nao abre antes de 6 segundos de propagacao',async()=>{
  const a=make()
  await a.engine.tick()
  assert.equal(a.delivered.length,2)
  assert.equal(a.db.store.phase,'delivery')
  const chat=POKEMON_QUIZ_GROUPS[0]
  assert.equal((await a.answer({chat,sender:'alice',choice:POKEMON_QUIZ_QUESTIONS[0].c})).kind,'not-open')
  a.advance(5999);await a.engine.tick()
  assert.equal(a.db.store.phase,'delivery')
  a.advance(1);await a.engine.tick()
  assert.equal(a.db.store.phase,'answering')
})

test('falha ao obter ID da mensagem mantem perguntas bloqueadas, inclusive chutes',async()=>{
  const db=new FakeDB()
  let now=1_000_000
  const engine=createPokemonQuizEngine({db,clock:()=>now,sendMessage:async()=>undefined,logger:{warn:()=>{},error:()=>{}}})
  await engine.tick()
  now+=30000
  await engine.tick()
  assert.equal(db.store.phase,'delivery')
  assert.equal(db.store.winners.length,0)
  assert.equal(db.ledger.length,0)
  assert.equal((await engine.answer({chat:POKEMON_QUIZ_GROUPS[0],sender:'alice',choice:2})).kind,'not-open')
})
