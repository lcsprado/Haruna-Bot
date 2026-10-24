import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {enqueueWebAction,deliverWebActionsOnce} from '../src/neon/web-activity-relay.js'

function fakeDatabase(){
  let nextId=1
  const rows=[]
  let schema=0
  const db={
    async query(sql,values=[]){
      if(/CREATE TABLE|CREATE INDEX/.test(sql)){schema++;return {rows:[]}}
      if(/WITH event AS/.test(sql)){
        const row={id:nextId++,chat_jid:values[0],kind:values[1],payload:JSON.parse(values[2]),attempts:0,state:'pending'}
        rows.push(row)
        return {rows:[{id:row.id}]}
      }
      if(/WITH reserved AS/.test(sql)){
        const selected=rows.filter(r=>r.state==='pending'&&r.attempts<4).slice(0,8)
        for(const r of selected){r.state='sending';r.attempts++}
        return {rows:selected.map(r=>({...r}))}
      }
      if(/SET state='sent'/.test(sql)){
        rows.find(r=>r.id===values[0]).state='sent'
        return {rows:[]}
      }
      if(/SET state=CASE/.test(sql)){
        const r=rows.find(r=>r.id===values[0])
        r.state=r.attempts>=4?'failed':'pending'
        return {rows:[]}
      }
      throw new Error('Unexpected SQL query in stub')
    }
  }
  return {db,rows,get schema(){return schema}}
}

test('Web activity and Raid auto start are persisted then delivered on the WhatsApp side',async()=>{
  const {db,rows}=fakeDatabase()
  await enqueueWebAction(db,{chat:'test@g.us',kind:'message',payload:{text:'Raid aberta',mentions:[]}})
  await enqueueWebAction(db,{chat:'test@g.us',kind:'raid_auto',payload:{level:70}})
  const emitted=[]
  const summary=await deliverWebActionsOnce(db,{
    sendMessage:async(chat,text)=>{emitted.push('message:'+text);return true},
    startRaidRun:async(chat,level)=>{emitted.push('raid:'+level);return true}
  })
  assert.deepEqual(emitted,['message:Raid aberta','raid:70'])
  assert.equal(summary.delivered,2)
  assert.deepEqual(rows.map(r=>r.state),['sent','sent'])
})

test('Delivery failure remains pending, with bounded attempts',async()=>{
  const {db,rows}=fakeDatabase()
  await enqueueWebAction(db,{chat:'test@g.us',kind:'message',payload:{text:'Aviso',mentions:[]}})
  await deliverWebActionsOnce(db,{
    sendMessage:async()=>false,startRaidRun:async()=>false,log:{warn(){}}
  })
  assert.equal(rows[0].state,'pending')
  assert.equal(rows[0].attempts,1)
})

test('No activity can be routed to an arbitrary private conversation',async()=>{
  const {db,rows}=fakeDatabase()
  await assert.rejects(enqueueWebAction(db,{chat:'private@s.whatsapp.net',kind:'message',payload:{text:'Oi'}}),/Grupo inválido/)
  assert.equal(rows.length,0)
})

test('Web Raid validation derives its maximum from the Raid catalog instead of hardcoding 50',async()=>{
  const text=await readFile(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.match(text,/WEB_RAID_MAX_LEVEL=Math\.max\(\.\.\.getRaidCatalog\(\)/)
  for(const action of ['raid.create','raid.join','raid.cancel','raid.start','raid.auto','raid.round'])
    assert.match(text,new RegExp("case '"+action.replace('.','\\.')+"'"))
  assert.doesNotMatch(text,/positiveInt\(body\.level,'Nível',50\)/)
})
