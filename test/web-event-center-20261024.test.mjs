import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {
  MIMIC_WEB_EVENT,SATURDAY_WEB_EVENT,
  eventPhase,normalizeMimicSnapshot,getWebEventCenter
} from '../src/neon/web-event-center.js'

test('Event schedules follow the real WhatsApp rules of 24 October',()=>{
  assert.equal(MIMIC_WEB_EVENT.startsAt,Date.parse('2026-10-24T15:00:00-03:00'))
  assert.equal(MIMIC_WEB_EVENT.endsAt,Date.parse('2026-10-24T17:00:00-03:00'))
  assert.equal(eventPhase(MIMIC_WEB_EVENT,MIMIC_WEB_EVENT.startsAt-1),'upcoming')
  assert.equal(eventPhase(MIMIC_WEB_EVENT,MIMIC_WEB_EVENT.startsAt+1),'active')
  assert.equal(eventPhase(MIMIC_WEB_EVENT,MIMIC_WEB_EVENT.endsAt),'finished')
  assert.deepEqual(SATURDAY_WEB_EVENT.levels,[50,60,65,70])
  assert.equal(SATURDAY_WEB_EVENT.xpMultiplier,1.5)
})

test('Personal Mimic state, safe leaderboard and prizes are read-only projections',()=>{
  const raw={mine:{hunts:12,points:195,fragments:9,cash:35000,xp:700},
    position:2,leaders:[{position:1,name:'<b>Suspeito</b>',points:200,hunts:10}]}
  const projected=normalizeMimicSnapshot(raw,MIMIC_WEB_EVENT.startsAt+1000)
  assert.equal(projected.progress.hunts,12)
  assert.equal(projected.progress.rank,2)
  assert.equal(projected.leaderboard.length,1)
  assert.doesNotMatch(projected.leaderboard[0].name,/[<>]/)
  assert.equal(projected.milestones[0].hunts,10)
  assert.equal(projected.prizes[0],300000)
  assert.ok(!JSON.stringify(projected).includes('jid'))
})

test('Event center does not touch DB before Mimics start and uses one read query after',async()=>{
  let calls=0
  const db={query:async(sql,params)=>{
    calls++
    assert.match(sql,/WITH ranked AS/)
    assert.match(sql,/FROM mimic_hunt_sessions/)
    assert.doesNotMatch(sql,/\\b(?:INSERT|UPDATE|DELETE|DROP)\\b/i)
    assert.deepEqual(params.slice(0,2),[MIMIC_WEB_EVENT.id,'test_player'])
    return {rows:[{mine:{hunts:3,points:35},position:1,leaders:[]}]}
  }}
  const before=await getWebEventCenter(db,'test_player',MIMIC_WEB_EVENT.startsAt-1)
  assert.equal(calls,0)
  assert.equal(before.mimic.phase,'upcoming')
  const during=await getWebEventCenter(db,'test_player',MIMIC_WEB_EVENT.startsAt+1)
  assert.equal(calls,1)
  assert.equal(during.mimic.progress.points,35)
  assert.equal(during.saturdayRaid.phase,'upcoming')
})

test('DB error does not fabricate empty confirmed leaderboard',async()=>{
  const original=console.warn
  console.warn=()=>{}
  try{
    const result=await getWebEventCenter({
      query:async()=>{throw Object.assign(new Error('query failed'),{code:'42P01'})}
    },'test_player',MIMIC_WEB_EVENT.startsAt+1)
    assert.equal(result.mimic.unavailable,true)
    assert.deepEqual(result.mimic.leaderboard,[])
  }finally{console.warn=original}
})

test('Web event endpoint is behind authentication and no event gameplay is exposed',async()=>{
  const file=await readFile(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.ok(file.indexOf("url.pathname==='/api/v1/me/event-center'")>file.indexOf('const session=await authSession(req)'))
  assert.match(file,/getWebEventCenter\(db,session\.jid\)/)
  assert.doesNotMatch(file,/case 'mimic\./)
})

test('Event navigation, progress, ranking and refresh controls are present',async()=>{
  const file=await readFile(new URL('../web/app.js',import.meta.url),'utf8')
  new Function(file)
  assert.match(file,/\['events','🎉','Eventos'\]/)
  assert.match(file,/events:renderEvents/)
  assert.match(file,/eventCenterMimicCard/)
  assert.match(file,/data-event-center-refresh/)
  assert.match(file,/data-event-copy/)
  assert.match(file,/data-go-page="raids"/)
  assert.match(file,/loadEventCenter\(true\)/)
  assert.match(file,/Client-only clock; does not query Render or Aiven in the background/)
})
