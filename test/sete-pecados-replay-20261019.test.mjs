import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// Nenhum banco real é acessado: db.connect é substituído por uma transação fake.
process.env.DATABASE_URL ||= 'postgresql://test@127.0.0.1:1/no_network'
const {db}=await import('../src/neon/db.js')
const {openBox}=await import('../src/neon/sete-pecados-collab.js')

test('mesma mensagem de baú não consome essências nem gera prêmio novamente',async()=>{
  const state={essences:14,fragments:0,markers:new Map(),commits:0}
  const client={
    async query(sql,params=[]){
      const q=String(sql).trim()
      if(q==='BEGIN'||q==='ROLLBACK')return {rows:[],rowCount:0}
      if(q==='COMMIT'){state.commits++;return {rows:[],rowCount:0}}
      if(q.startsWith('SELECT jid FROM users'))return {rows:[{jid:params[0]}],rowCount:1}
      if(q.startsWith('INSERT INTO trevo_settings')){
        const key=params[0]
        if(state.markers.has(key))return {rows:[],rowCount:0}
        state.markers.set(key,JSON.parse(params[1]))
        return {rows:[{key}],rowCount:1}
      }
      if(q.startsWith('SELECT value FROM trevo_settings')){
        const value=state.markers.get(params[0])
        return {rows:value?[{value}]:[],rowCount:value?1:0}
      }
      if(q.startsWith('UPDATE trevo_settings SET value=')){
        state.markers.set(params[0],JSON.parse(params[1]))
        return {rows:[],rowCount:1}
      }
      if(q.startsWith('SELECT item_id,quantity FROM inventories')){
        const rows=state.essences?[{item_id:'essencia_pecado_preguica',quantity:state.essences}]:[]
        return {rows,rowCount:rows.length}
      }
      if(q.startsWith('UPDATE inventories SET quantity=quantity-')){
        state.essences-=params[0]
        return {rows:[],rowCount:1}
      }
      // Força personagem repetido para exercitar o crédito de fragmentos.
      if(q.startsWith('SELECT id FROM pet_collection'))return {rows:[{id:1}],rowCount:1}
      if(q.includes("'fragmento_universal_raid',50")){
        state.fragments+=50
        return {rows:[],rowCount:1}
      }
      throw Error('SQL não simulado: '+q.slice(0,160))
    },
    release(){}
  }
  const oldConnect=db.connect,oldRandom=Math.random
  db.connect=async()=>client
  Math.random=()=>0
  try{
    const first=await openBox('jogador-fake','grupo:mensagem-A')
    assert.equal(first.duplicate,true)
    assert.equal(first.ownedAfter,7)
    assert.equal(state.essences,7)
    assert.equal(state.fragments,50)

    const replay=await openBox('jogador-fake','grupo:mensagem-A')
    assert.equal(replay.replay,true)
    assert.equal(replay.reward,first.reward)
    assert.equal(state.essences,7)
    assert.equal(state.fragments,50)

    const another=await openBox('jogador-fake','grupo:mensagem-B')
    assert.equal(another.replay,undefined)
    assert.equal(state.essences,0)
    assert.equal(state.fragments,100)

    const insufficient=await openBox('jogador-fake','grupo:mensagem-C')
    assert.equal(insufficient.insufficient,true)
    const insufficientReplay=await openBox('jogador-fake','grupo:mensagem-C')
    assert.equal(insufficientReplay.insufficient,true)
    assert.equal(insufficientReplay.replay,true)
    assert.equal(state.markers.size,3)
    assert.equal(state.commits,5)
  }finally{
    db.connect=oldConnect
    Math.random=oldRandom
  }
})

test('timers dos eventos têm referências e limpeza na desconexão',()=>{
  const code=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(code,/setePecadosScheduler=setInterval/)
  assert.match(code,/clearInterval\(setePecadosScheduler\)/)
  assert.match(code,/clearInterval\(doubleRewardEventScheduler\)/)
  assert.match(code,/clearInterval\(luckyBoxEventScheduler\)/)
  assert.match(code,/eventSchedulerClosed=true/)
  assert.match(code,/messageId:msg\?\.key\?\.id/)
})
