import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/neon/sete-pecados-collab.js',import.meta.url),'utf8')
const code=source.split('export async function claimCollabGearFragmentRefund(')[1]?.split('export async function handleSetePecadosCollabCommand(')[0]
assert.ok(code,'reembolso deve ser exportado e protegido')

function makeHarness(spent=24,uses=2){
  const marks=new Map()
  let balance=3,credits=0,logs=0
  const client={
    async query(sql,args=[]){
      if(sql.startsWith('SELECT jid FROM users'))return {rowCount:1,rows:[{jid:args[0]}]}
      if(sql.startsWith('SELECT value FROM trevo_settings')){
        const saved=marks.get(args[0])
        return {rows:saved?[{value:saved}]:[],rowCount:saved?1:0}
      }
      if(sql.includes('COALESCE(SUM(amount)'))return {rows:[{spent,uses}]}
      if(sql.startsWith('INSERT INTO trevo_settings')){
        if(marks.has(args[0]))return {rowCount:0}
        marks.set(args[0],JSON.parse(args[1]))
        return {rowCount:1}
      }
      if(sql.startsWith('INSERT INTO inventories')){
        balance+=Number(args[2]);credits++
        return {rowCount:1}
      }
      if(sql.startsWith('INSERT INTO transactions')){logs++;return{rowCount:1}}
      if(sql.startsWith('SELECT quantity FROM inventories'))return {rows:[{quantity:balance}]}
      throw new Error('Unexpected SQL: '+sql)
    }
  }
  const inTransaction=async fn=>fn(client)
  const factory=new Function('inTransaction','COLLAB_FRAGMENT_ITEM',
    'return async function claimCollabGearFragmentRefund('+code)
  const claim=factory(inTransaction,'fragmento_ascensao_pecados_20261024')
  return {claim,state:()=>({balance,credits,logs,markers:marks.size})}
}

test('reembolso comprovado devolve fragmentos uma unica vez sem reverter upgrades',async()=>{
  const run=makeHarness()
  const first=await run.claim('player@test')
  assert.equal(first.refunded,24)
  assert.equal(first.remaining,27)
  assert.equal(first.uses,2)
  const replay=await run.claim('player@test')
  assert.equal(replay.already,true)
  assert.equal(replay.refunded,0)
  assert.equal(replay.previous,24)
  assert.deepEqual(run.state(),{balance:27,credits:1,logs:1,markers:1})
})

test('jogador sem gastos comprovados nao recebe itens nem marca compensacao',async()=>{
  const run=makeHarness(0,0)
  const result=await run.claim('player@safe')
  assert.equal(result.refunded,0)
  assert.deepEqual(run.state(),{balance:3,credits:0,logs:0,markers:0})
})
