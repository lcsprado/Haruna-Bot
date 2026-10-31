import test from 'node:test'
import assert from 'node:assert/strict'
import {createRoubaRoubaEngine,ROUBA_KEY,ROUBA_GROUP_JID,ROUBA_TURNS,ROUBA_CAR,
 ROUBA_LOOT} from '../src/neon/rouba-rouba-alpha.js'

class FakeDB{
 constructor(){
  this.store=null
  this.wallets=new Map(['lucas','joao','kaique','diane','ban','arthur'].map(id=>[id,100000]))
  this.cars=new Map([...this.wallets.keys()].map(id=>[id,new Set()]))
  this.inventory=new Map()
  this.transactions=[]
  this.gate=Promise.resolve()
 }
 async connect(){let unlock=null,old=null
  return {query:async(sql,p=[])=>{
   if(sql==='BEGIN'){
    const previous=this.gate;this.gate=new Promise(r=>unlock=r);await previous
    old=structuredClone({store:this.store,wallets:[...this.wallets],cars:[...this.cars].map(([k,v])=>[k,[...v]]),inventory:[...this.inventory],transactions:this.transactions})
    return {rows:[],rowCount:0}
   }
   if(sql==='COMMIT'){unlock?.();return {rows:[],rowCount:0}}
   if(sql==='ROLLBACK'){
    this.store=old.store;this.wallets=new Map(old.wallets)
    this.cars=new Map(old.cars.map(([k,v])=>[k,new Set(v)]))
    this.inventory=new Map(old.inventory);this.transactions=old.transactions
    unlock?.();return {rows:[],rowCount:0}
   }
   return this.query(sql,p)
  },release:()=>{}}
 }
 async query(sql,p=[]){
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1}
  if(sql.startsWith('SELECT value FROM trevo_settings'))return {rows:this.store?[{value:structuredClone(this.store)}]:[],rowCount:this.store?1:0}
  if(sql.startsWith('INSERT INTO trevo_settings')){this.store=JSON.parse(p[1]);return {rows:[],rowCount:1}}
  if(sql.startsWith('SELECT cash FROM wallets')){const w=this.wallets.get(p[0]);return {rows:w===undefined?[]:[{cash:w}],rowCount:w===undefined?0:1}}
  if(sql.startsWith('SELECT car_id FROM user_cars')){const values=[...(this.cars.get(p[0])||[])];return {rows:values.map(car_id=>({car_id})),rowCount:values.length}}
  if(sql.startsWith('INSERT INTO user_cars')){
   const cars=this.cars.get(p[0]);if(cars.has(p[1]))return {rows:[],rowCount:0}
   cars.add(p[1]);return {rows:[{car_id:p[1]}],rowCount:1}
  }
  if(sql.startsWith('SELECT id FROM items')){return {rows:['pocao_g','elixir_supremo','caixa_rara'].includes(p[0])?[{id:p[0]}]:[],rowCount:1}}
  if(sql.startsWith('INSERT INTO inventories')){
   const key=p[0]+'/'+p[1];this.inventory.set(key,(this.inventory.get(key)||0)+p[2]);return {rows:[],rowCount:1}
  }
  if(sql.startsWith('UPDATE wallets SET cash=cash+$2')){
   this.wallets.set(p[0],this.wallets.get(p[0])+p[1]);return {rows:[],rowCount:1}
  }
  if(sql.startsWith('INSERT INTO transactions')){this.transactions.push({p});return {rows:[],rowCount:1}}
  throw Error('SQL nao simulado: '+sql.slice(0,110))
 }
}
function harness(){
 let now=1000000,num=0
 const db=new FakeDB(),messages=[]
 const engine=createRoubaRoubaEngine({db,clock:()=>now,logger:{error:e=>{throw Error(e)},warn:e=>{throw Error(e)}},
  sendMessage:async(chat,text)=>{messages.push({chat,text});return {key:{id:'msg-'+(++num)}}}})
 const tick=()=>engine.tick()
 const advance=n=>{now+=n}
 const join=id=>engine.join({chat:ROUBA_GROUP_JID,sender:id,name:id})
 const act=(id,action,target)=>engine.act({chat:ROUBA_GROUP_JID,sender:id,action,target})
 const turn=async()=>{await tick();advance(3501);await tick();assert.equal(db.store.phase,'turn-open')}
 const done=async()=>{
  await tick();advance(4001);await tick()
  if(db.store.status==='active'){advance(3501);await tick()}
 }
 const begin=async()=>{
  await engine.open();await tick()
  await join('lucas');await join('joao');await join('kaique')
  await turn()
 }
 return {engine,db,messages,advance,tick,join,act,turn,done,begin}
}
test('porsche unico, premios moderados e grupo AlphaBot exclusivo',()=>{
 assert.equal(ROUBA_CAR.id,'porsche_911')
 assert.equal(ROUBA_CAR.price,750000)
 assert.equal(ROUBA_TURNS,3)
 assert.ok(ROUBA_LOOT.filter(x=>x.type==='cash').every(x=>x.amount>=8000&&x.amount<=35000))
 assert.ok(ROUBA_LOOT.every(x=>x.type==='item'||x.type==='cash'))
 assert.equal(ROUBA_GROUP_JID,'120363410230588690@g.us')
})
test('inscricao obrigatoria: 3 por jogador, apenas um grupo, anuncio de entrada',async()=>{
 const a=harness();await a.engine.open();await a.tick()
 assert.equal((await a.join('lucas')).kind,'joined')
 assert.equal((await a.join('lucas')).kind,'already')
 assert.equal((await a.engine.join({chat:'120363429534634131@g.us',sender:'ban',name:'ban'})).kind,'other-group')
 assert.equal((await a.join('joao')).kind,'joined')
 await a.tick();assert.equal(a.db.store.status,'signup')
 await a.join('kaique');await a.turn()
 assert.equal(a.db.store.schedule.length,9)
 assert.deepEqual([...new Set(a.db.store.schedule.map(x=>x.jid))].sort(),['joao','kaique','lucas'])
 assert.equal(a.messages.every(x=>x.chat===ROUBA_GROUP_JID),true)
})
test('3 turnos por pessoa e um unico Porsche, pagamentos apenas ao final',async()=>{
 const a=harness();await a.begin()
 for(let i=0;i<9;i++){
  assert.equal(a.db.store.phase,'turn-open')
  const who=a.db.store.turn.jid
  assert.equal((await a.act(who,'open')).kind,'accepted')
  assert.equal((await a.act(who,'open')).kind,'not-open')
  if(i<8){
   assert.equal(a.db.transactions.length,0)
   assert.equal([...a.db.cars.values()].every(x=>x.size===0),true)
  }
  await a.done()
 }
 await a.tick()
 assert.equal(a.db.store.status,'completed')
 assert.equal(a.db.store.history.length,9)
 assert.equal(a.db.store.prizes.filter(p=>p.type==='car').length,1)
 for(const id of a.db.store.order)assert.equal(a.db.store.players[id].done,3)
 assert.equal([...a.db.cars.values()].reduce((n,x)=>n+x.size,0),1)
 assert.equal(a.db.store.paid,true)
 const before=structuredClone({balance:[...a.db.wallets],inventory:[...a.db.inventory],cars:[...a.db.cars].map(([k,v])=>[k,[...v]]),transactions:a.db.transactions.length})
 for(let i=0;i<5;i++)await a.tick()
 const after={balance:[...a.db.wallets],inventory:[...a.db.inventory],cars:[...a.db.cars].map(([k,v])=>[k,[...v]]),transactions:a.db.transactions.length}
 assert.deepEqual(after,before)
})
test('roubo transfere, substitui por bau, protege depois de dois roubos',async()=>{
 const a=harness();await a.begin()
 const first=a.db.store.turn.jid
 assert.equal((await a.act(first,'steal','#1')).kind,'bad-target')
 assert.equal((await a.act(first,'open')).kind,'accepted')
 await a.done()
 let second=a.db.store.turn.jid
 const firstPrize=a.db.store.prizes[0]
 assert.equal((await a.act(second,'steal','#1')).kind,'accepted')
 assert.equal(firstPrize.serial,1)
 assert.equal(a.db.store.prizes[0].owner,second)
 assert.equal(a.db.store.prizes[0].steals,1)
 assert.equal(a.db.store.prizes.length,2)
 assert.equal(a.db.store.prizes[1].owner,first)
 await a.done()
 const third=a.db.store.turn.jid
 assert.equal((await a.act(third,'steal','#1')).kind,'accepted')
 assert.equal(a.db.store.prizes[0].owner,third)
 assert.equal(a.db.store.prizes[0].steals,2)
 assert.equal(a.db.store.prizes.length,3)
 await a.done()
 assert.equal((await a.act(a.db.store.turn.jid,'steal','#1')).kind,'bad-target')
})
test('participante tardio entra com tres jogadas, turno atual nao muda',async()=>{
 const a=harness();await a.begin()
 const current=a.db.store.turn.jid
 const joined=await a.join('diane')
 assert.equal(joined.kind,'joined');assert.equal(joined.late,true)
 assert.equal(a.db.store.schedule.length,12)
 assert.equal(a.db.store.turn.jid,current)
 assert.equal(a.db.store.schedule[a.db.store.index].jid,current)
 for(let i=0;i<12;i++){
  const who=a.db.store.turn.jid
  assert.equal((await a.act(who,'open')).kind,'accepted')
  await a.done()
 }
 assert.equal(a.db.store.status,'completed')
 assert.equal(a.db.store.players.diane.done,3)
 for(const id of a.db.store.order)assert.equal(a.db.store.players[id].done,3)
})
test('timeout abre bau automaticamente e nao premia antecipadamente',async()=>{
 const a=harness();await a.begin()
 a.advance(40001);await a.tick()
 assert.equal(a.db.store.phase,'result')
 assert.equal(a.db.store.history.length,1)
 assert.equal(a.db.store.history[0].automatic,true)
 assert.equal(a.db.transactions.length,0)
})
test('cancelamento para a partida e nao cria creditos; idempotente',async()=>{
 const a=harness();await a.begin()
 assert.equal((await a.act(a.db.store.turn.jid,'open')).kind,'accepted')
 assert.equal(await a.engine.cancel(),true)
 await a.tick()
 assert.equal(a.db.store.status,'cancelled')
 assert.equal(a.messages.filter(x=>x.text.includes('CANCELADO')).length,1)
 assert.equal(a.db.transactions.length,0)
 assert.deepEqual([...a.db.wallets.values()],Array(6).fill(100000))
 assert.equal(await a.engine.cancel(),false)
 assert.equal((await a.join('diane')).kind,'closed')
})
test('ganhador com Porsche pré-existente recebe fallback limitado e nenhuma duplicata',async()=>{
 const a=harness();await a.begin()
 // Deixar cada jogador com Porsche: qualquer vencedor do unico carro recebera fallback.
 for(const x of a.db.cars.values())x.add('porsche_911')
 for(let i=0;i<9;i++){await a.act(a.db.store.turn.jid,'open');await a.done()}
 await a.tick()
 assert.equal(a.db.store.status,'completed')
 assert.equal(a.db.store.prizes.filter(x=>x.type==='car'&&x.replacementCash).length,1)
 assert.equal([...a.db.cars.values()].reduce((n,x)=>n+x.size,0),6)
 assert.equal(a.db.transactions.reduce((n,t)=>n+Number(t.p[2]),0)<=75000+35000*9,true)
})
