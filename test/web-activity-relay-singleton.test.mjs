import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {startWebActionConsumer} from '../src/neon/web-activity-relay.js'

const nextTick=()=>new Promise(resolve=>setImmediate(resolve))
const opts={
  sendMessage:async()=>true,
  startRaidRun:async()=>true,
  isConnected:()=>false,
  pollMs:60000,
  log:{warn(){}}
}

function fakePool(){
  const clients=[]
  const db={
    async query(){return {rows:[]}},
    async connect(){
      const client=new EventEmitter()
      client.releases=0
      client.query=async()=>({rows:[]})
      client.release=()=>{client.releases++}
      clients.push(client)
      return client
    }
  }
  return {db,clients}
}

test('reconexoes concorrentes reutilizam um unico Web Relay LISTEN por pool',async()=>{
  const {db,clients}=fakePool()
  const initial=startWebActionConsumer(db,opts)
  assert.strictEqual(startWebActionConsumer(db,opts),initial)
  const consumer=await initial
  await nextTick()
  assert.equal(clients.length,1,'apenas uma conexao dedicada ao LISTEN')
  await Promise.all(Array.from({length:15},()=>startWebActionConsumer(db,opts)))
  await nextTick()
  assert.equal(clients.length,1,'nao cria novos listeners apos reconexoes')
  consumer.close()
  await nextTick()
  assert.equal(clients[0].releases,1,'libera o cliente quando o consumidor fecha')
  const afterClose=await startWebActionConsumer(db,opts)
  await nextTick()
  assert.equal(clients.length,2,'novo consumidor so e permitido apos close')
  afterClose.close()
  await nextTick()
  assert.equal(clients[1].releases,1)
})

test('erro durante a inicializacao nao bloqueia uma nova tentativa',async()=>{
  const {db,clients}=fakePool()
  const regularQuery=db.query
  let failOnce=true
  db.query=async(...args)=>{
    if(failOnce){failOnce=false;throw new Error('falha de banco simulada')}
    return regularQuery(...args)
  }
  await assert.rejects(startWebActionConsumer(db,opts),/falha de banco simulada/)
  await nextTick()
  const consumer=await startWebActionConsumer(db,opts)
  await nextTick()
  assert.equal(clients.length,1,'a segunda tentativa abre um listener funcional')
  consumer.close()
  await nextTick()
  assert.equal(clients[0].releases,1)
})
