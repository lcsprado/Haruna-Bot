import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
function load(name,deps){
  const start=source.indexOf('export async function '+name+'(')
  assert.ok(start>=0)
  const end=source.indexOf('\n}\n',start)
  assert.ok(end>start)
  const fn=source.slice(start,end+2).replace(/^export /,'')
  return new Function(...Object.keys(deps),'return ('+fn+')')(...Object.values(deps))
}
function fixture(reboot){
  const claimed=new Set(), cooldowns=new Set(), locks=[], paid=[],claimedEvents=new Map()
  const base={ensureUser:async()=>{},rebootEconomyEnabled:()=>reboot,getDoubleEventMultiplier:async()=>2,
    getGroupMissionLeaderboard:async chat=>({mission:{week_key:'2026-W47',completed:true,reward_cash:reboot?5000:50000},total:2,rows:[]}),
    claimCooldown:async(c,key,seconds)=>{
      assert.equal(seconds,86400)
      if(cooldowns.has(key))return {ok:false}
      cooldowns.add(key);return {ok:true}
    },
    pickWeightedGroupEventItem:()=>null,
    V2_GROUP_FLASH_LOCK:'v2:group-flash:all-groups',
    V2_GROUP_FLASH:{maxCash:1000,dailyCashCap:12000},
    v2GroupFlashBudget:async()=>({paid:paid.reduce((n,v)=>n+v,0),held:0})}
  let currentChat=''
  const query=async(sql,args)=>{
    if(sql.includes('SELECT * FROM group_mission_members'))return {rows:[{contribution:1,claimed:claimed.has(args[0]+'|'+args[2])}]}
    if(sql.includes('pg_advisory_xact_lock')){locks.push(args[0]);return {rows:[]}}
    if(sql.includes('SELECT 1 FROM group_mission_members'))return {rows:[...claimed].some(x=>x.endsWith('|'+args[1]))?[{}]:[]}
    if(sql.includes('SELECT * FROM group_events'))return {rows:[{event_type:'pix',reward_cash:reboot?800:20000,claimed_by:claimedEvents.get(args[0])||null,expires_at:Math.floor(Date.now()/1000)+60}]}
    if(sql.includes('UPDATE group_events SET claimed_by'))claimedEvents.set(args[1],args[0])
    if(sql.includes('UPDATE wallets'))paid.push(args[0])
    if(sql.includes('UPDATE group_mission_members'))claimed.add(args[0]+'|'+args[2])
    return {rows:[]}
  }
  const deps={...base,tx:async fn=>fn({query})}
  return {mission:load('claimGroupMission',deps),event:load('claimGroupEvent',deps),paid,locks,cooldowns}
}
test('V2: missões coletivas não pagam duas vezes ao mesmo jogador em grupos distintos',async()=>{
  const f=fixture(true)
  assert.equal((await f.mission('a@g.us','p')).share,2500)
  await assert.rejects(f.mission('b@g.us','p'),/outro grupo/)
  assert.deepEqual(f.paid,[2500])
  assert.deepEqual(f.locks,['v2:group-mission:2026-W47:p','v2:group-mission:2026-W47:p'])
  assert.equal((await f.mission('b@g.us','q')).share,2500)
})
test('V2: mesmo jogador pode pegar eventos em grupos diferentes; grupo só paga uma vez',async()=>{
  const f=fixture(true)
  assert.equal((await f.event('a@g.us','p')).reward_cash,800)
  assert.equal((await f.event('b@g.us','p')).reward_cash,800)
  await assert.rejects(f.event('a@g.us','q'),/Não há evento disponível/)
  assert.equal((await f.event('c@g.us','q')).reward_cash,800)
  assert.deepEqual(f.paid,[800,800,800])
  assert.deepEqual([...f.cooldowns],[])
  assert.deepEqual(f.locks,['v2:group-flash:all-groups','v2:group-flash:all-groups',
    'v2:group-flash:all-groups','v2:group-flash:all-groups'])
})
test('V1 preserva multiplicador coletivo e resgates por grupo',async()=>{
  const f=fixture(false)
  assert.equal((await f.mission('a@g.us','p')).share,50000)
  assert.equal((await f.mission('b@g.us','p')).share,50000)
  assert.equal((await f.event('a@g.us','p')).reward_cash,20000)
  assert.equal((await f.event('b@g.us','p')).reward_cash,20000)
  assert.equal(f.locks.length,0)
  assert.equal(f.cooldowns.size,0)
})
test('V2 aplica orçamento reduzido ao gerar os eventos e ao exibir missões',()=>{
  assert.match(source,/rebootEconomyEnabled\(\)\?\{\.\.\.base,reward:Math\.floor\(base\.reward\/10\)\}/)
  assert.match(source,/e\.reward=v2GroupFlashCash\(e\.type,budget\.remaining\)/)
})
