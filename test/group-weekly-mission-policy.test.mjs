import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GROUP_WEEKLY_CHOICES,groupWeeklyChoice} from '../src/neon/group-weekly-mission-policy.js'

test('quiz is never a group weekly objective',()=>{
 assert.deepEqual(GROUP_WEEKLY_CHOICES.map(x=>x.type).sort(),['battle','work'])
 for(const chat of ['alpha@g.us','entrosas@g.us']){
  for(let n=1;n<=53;n++){
   const m=groupWeeklyChoice(chat,'2026-W'+String(n).padStart(2,'0'))
   assert.notEqual(m.type,'quiz')
   assert.ok(m.target>0&&m.reward>0)
  }
 }
})

test('same group never receives the same objective in adjacent weeks',()=>{
 for(const chat of ['alpha@g.us','entrosas@g.us']){
  for(let n=1;n<53;n++){
   const current=groupWeeklyChoice(chat,'2026-W'+String(n).padStart(2,'0'))
   const next=groupWeeklyChoice(chat,'2026-W'+String(n+1).padStart(2,'0'))
   assert.notEqual(current.type,next.type)
   assert.deepEqual(groupWeeklyChoice(chat,'2026-W'+String(n).padStart(2,'0')),current)
  }
 }
})

test('invalid weekly keys fail closed',()=>{
 for(const key of ['','2026-W00','2026-W54','semana']){
  assert.throws(()=>groupWeeklyChoice('alpha@g.us',key))
 }
})

test('active quiz missions migrate without losing recorded contributions',()=>{
 const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
 assert.match(source,/groupWeeklyChoice\(chatJid,week\)/)
 assert.match(source,/group_missions\.mission_type='quiz'/)
 assert.match(source,/group_missions\.completed=FALSE/)
 assert.match(source,/GREATEST\(EXCLUDED\.target,group_missions\.progress\+1\)/)
 assert.match(source,/getGroupMissionLeaderboard/)
 assert.match(source,/claimGroupMission/)
})
