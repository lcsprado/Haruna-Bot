import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

const begin=db.indexOf('export async function cancelAllPetExpeditions(jid){')
const end=db.indexOf('// Retirada voluntária antes do fim:',begin)
const bulk=begin>=0&&end>begin?db.slice(begin,end):''
const cmdBegin=bot.indexOf("if(cmd==='expedicaopetsair'){")
const cmdEnd=bot.indexOf("if(cmd==='expedicoespet'){",cmdBegin)
const command=cmdBegin>=0&&cmdEnd>cmdBegin?bot.slice(cmdBegin,cmdEnd):''

test('bulk withdrawal is registered without dropping single-pet flow',()=>{
  assert.ok(bulk.length>0)
  assert.match(bot,/cancelPetExpedition, cancelAllPetExpeditions,/)
  assert.match(command,/if\(requested\.toLowerCase\(\)==='todos'\)/)
  assert.match(command,/cancelAllPetExpeditions\(sender\)/)
  assert.match(command,/clearQuickFlow\(chat,sender\)/)
  assert.match(command,/cancelPetExpedition\(sender,Number\(requested\)\)/)
  assert.match(command,/\!expedicao(?:pet)?sair todos/)
})

test('bulk cancellation scopes to the requesting player and only unfinished trips',()=>{
  assert.match(bulk,/UPDATE pet_expeditions AS e/)
  assert.match(bulk,/FROM pet_collection AS p/)
  assert.match(bulk,/e\.pet_id=p\.id AND e\.jid=p\.jid AND e\.jid=\$1/)
  assert.match(bulk,/e\.resolved=FALSE AND e\.ends_at>\$2/)
  assert.match(bulk,/SET resolved=TRUE,cancelled_at=\$2/)
  assert.match(bulk,/SELECT jid FROM users WHERE jid=\$1 FOR UPDATE/)
  assert.match(bulk,/WHERE jid=\$1 AND resolved=FALSE AND ends_at<=\$2/)
  assert.doesNotMatch(bulk,/DELETE FROM pet_expeditions|UPDATE wallets|UPDATE pet_collection|INSERT INTO inventories/)
})

test('one atomic transaction returns cancelled pets and preserves completed trips',async()=>{
  const calls=[]
  const clients=[]
  const transaction=async fn=>{
    const client={query:async (sql,params)=>{
      calls.push({sql,params})
      if(sql.includes('UPDATE pet_expeditions'))return {rows:[{pet_id:16,pet_name:'Fênix do Eclipse'},{pet_id:8,pet_name:'Grifo Celestial'}]}
      if(sql.includes('COUNT(*) AS n'))return {rows:[{n:'1'}]}
      return {rows:[{jid:'owner-a'}]}
    }}
    clients.push(client)
    return fn(client)
  }
  let ownerChecked=null
  const ensureUser=async jid=>{ownerChecked=jid}
  const load=new Function('ensureUser','transaction',bulk.replace('export async function','async function')+'\nreturn cancelAllPetExpeditions')
  const cancelAll=load(ensureUser,transaction)
  const result=await cancelAll('owner-a')
  assert.equal(ownerChecked,'owner-a')
  assert.equal(clients.length,1)
  assert.deepEqual(result.cancelled,[{petId:16,petName:'Fênix do Eclipse'},{petId:8,petName:'Grifo Celestial'}])
  assert.equal(result.completedPending,1)
  assert.deepEqual(calls.map(x=>x.params[0]),['owner-a','owner-a','owner-a'])
  assert.equal(calls[1].params[1],calls[2].params[1])
  assert.equal(calls.filter(x=>x.sql.includes('UPDATE pet_expeditions')).length,1)
})

test('zero running expeditions is harmless and reports completed trips separately',async()=>{
  const transaction=async fn=>fn({query:async sql=>
    sql.includes('UPDATE pet_expeditions')?{rows:[]}:sql.includes('COUNT(*) AS n')?{rows:[{n:'2'}]}:{rows:[]}
  })
  const load=new Function('ensureUser','transaction',bulk.replace('export async function','async function')+'\nreturn cancelAllPetExpeditions')
  const result=await load(async()=>{},transaction)('owner-b')
  assert.deepEqual(result,{cancelled:[],completedPending:2})
})

test('help text shows bulk command and warns cancelled journeys have no payout',()=>{
  assert.match(bot,/\*\!expedicaopetsair todos\* — retirar todos os pets/)
  assert.match(command,/Canceladas sem XP, dinheiro ou itens/)
  assert.match(command,/expedição\(ões\) já concluída\(s\)\* preservadas/)
})
