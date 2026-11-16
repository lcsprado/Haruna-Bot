import test from 'node:test'
import assert from 'node:assert/strict'
import {BLEACH_RAID_ID,BLEACH_KEY_ITEM,BLEACH_FRAGMENT_ITEM,
 bleachRaidDailyKey,raidSelection} from '../src/neon/named-collab-raids.js'

const safe=(()=>{
 try{const u=new URL(process.env.DATABASE_URL||'');
  return process.env.ALPHA_RAID_BLEACH_E2E==='1' &&
    ['localhost','127.0.0.1'].includes(u.hostname)&&
    u.pathname==='/alpha_bleach_raid_e2e'
 }catch{return false}
})();
test('actual Bleach and 75 raids run isolated on disposable PG16',{skip:!safe},async t=>{
 const {db,initDatabase,initCommunityPack,ensureUser}=await import('../src/neon/db.js')
 const {initGames,createRaid,joinRaid,startRaid,raidRound,getRaidStatuses,
  cancelRaid}=await import('../src/neon/games.js')
 const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
 const {initAwakening}=await import('../src/neon/awakening.js')
 const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
 const chat='__bleach_e2e_group__@g.us'
 const a='5511999911101@s.whatsapp.net',b='5511999911102@s.whatsapp.net'
 const c='5511999911103@s.whatsapp.net'
 async function user(jid,label){
  await ensureUser(jid,label)
  await db.query('UPDATE users SET level=120 WHERE jid=$1',[jid])
  await db.query('UPDATE wallets SET cash=5000000,bank=1000000 WHERE jid=$1',[jid])
  await db.query('UPDATE stats SET hp=50000,max_hp=50000,atk=4000,def=1800,spd=500 WHERE jid=$1',[jid])
 }
 async function fastForward(hp=null){
  const state=(await db.query("SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type='raid:76'",[chat])).rows[0]?.state
  assert.ok(state?.status==='active','Bleach room not active')
  const next={...state,lastRoundAt:0}
  if(hp!==null)next.hp=hp
  await db.query("UPDATE trevo_games SET state=$3::jsonb WHERE chat_jid=$1 AND game_type=$2",
   [chat,'raid:76',JSON.stringify(next)])
 }
 const getState=async(lvl=76)=>(await db.query(
  'SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',
  [chat,'raid:'+lvl])).rows[0]?.state
 try{
  await t.test('initialize genuine game tables and exclusive keys in a clean database',async()=>{
   await initDatabase()
   await initCommunityPack()
   await initPlayableHeroes()
   await initAwakening()
   await initEnchantments()
   await initGames()
   const items=(await db.query(
    "SELECT id,sellable,stackable FROM items WHERE id=ANY($1::text[])",
    [[BLEACH_KEY_ITEM,BLEACH_FRAGMENT_ITEM,'chave_raid_75',
       'fragmento_ascensao_pecados_20261024']])).rows
   assert.equal(items.length,4)
   assert.equal(items.find(i=>i.id===BLEACH_FRAGMENT_ITEM).sellable,false)
   assert.equal(items.find(i=>i.id===BLEACH_FRAGMENT_ITEM).stackable,true)
   await user(a,'Ichigo Tester')
   await user(b,'Rukia Tester')
   await user(c,'Pecados Tester')
  })
  await t.test('named Bleach creates a separate lobby and key economy',async()=>{
   const label=raidSelection('bleach',[
     {level:75,name:'Pecados'},{level:76,slug:'bleach'}])
   assert.equal(label,BLEACH_RAID_ID)
   const before=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[a])).rows[0].cash
   const created=await createRaid(chat,a,'Ichigo Tester',label)
   assert.equal(created.level,76)
   assert.equal(created.slug,'bleach')
   assert.equal(created.status,'lobby')
   assert.equal(created.autoKeyPurchased,true)
   assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[a])).rows[0].cash),
    Number(before)-480000)
   await assert.rejects(()=>createRaid(chat,a,'Ichigo Tester',76),/Já existe/)
   await assert.rejects(()=>createRaid('__bleach_other__@g.us',a,'Ichigo Tester',75),/RAID GLOBAL ATIVA/)
   const joined=await joinRaid(chat,b,'Rukia Tester',76)
   assert.equal(Object.keys(joined.players).length,2)
   assert.equal(joined.autoKeyPurchased,true)
   const pecados=await createRaid(chat,c,'Pecados Tester',75)
   assert.equal(pecados.level,75)
   assert.equal(pecados.slug,null)
   assert.equal(pecados.maxHp,1150000)
   const rooms=await getRaidStatuses(chat)
   assert.deepEqual(rooms.map(r=>Number(r.level)).sort((x,y)=>x-y),[75,76])
  })
  await t.test('start only by host, exactly one key per participant',async()=>{
   await assert.rejects(()=>startRaid(chat,b,76),/host|sala|Raid/i)
   const started=await startRaid(chat,a,76)
   assert.equal(started.status,'active')
   assert.equal(started.phaseIndex,1)
   assert.equal(started.durationMinutes,40)
   assert.equal(started.slug,'bleach')
   assert.equal(started.maxHp,Math.round(1350000*1.12))
   for(const jid of [a,b]){
    const key=(await db.query(
     'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',
     [jid,BLEACH_KEY_ITEM])).rows[0]
    assert.equal(Number(key?.quantity||0),0)
   }
   const pecados=(await getState(75))
   assert.equal(pecados.status,'lobby')
   const key=(await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',
    [c,'chave_raid_75'])).rows[0]
   assert.equal(Number(key?.quantity),1,'75 key not touched')
  })
  await t.test('Aizen progresses automatically through Hōgyoku phases',async()=>{
   const start=await getState()
   assert.equal(start.phaseIndex,1)
   await fastForward(Math.round(start.maxHp*.66)+100)
   const p2=await raidRound(chat,76)
   assert.equal(p2.phaseTransition?.index,2)
   assert.equal(p2.phase?.name,'Despertar do Hōgyoku')
   assert.equal((await getState()).phaseIndex,2)
   await fastForward(Math.round(start.maxHp*.33)+100)
   const p3=await raidRound(chat,76)
   assert.equal(p3.phaseTransition?.index,3)
   assert.equal(p3.phase?.name,'Transcendência de Aizen')
   assert.equal((await getState()).phaseIndex,3)
   await fastForward()
   const next=await raidRound(chat,76)
   assert.equal(next.phaseTransition,null,'phase not replayed after storage')
  })
  await t.test('winning rewards are isolated, bounded, finalization idempotent',async()=>{
   for(let i=0;i<4;i++){
    await fastForward()
    const tick=await raidRound(chat,76)
    assert.equal(tick.reason||'','')
    if(tick.victory)throw new Error('unexpected early victory')
   }
   const before=(await db.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',
    [chat,'raid:75'])).rows[0].state
   const bOriginal=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[b])).rows[0].cash
   const dailyKey=bleachRaidDailyKey(a)
   await db.query("INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
    [dailyKey,JSON.stringify({earned:47})])
   await fastForward(1)
   const finished=await raidRound(chat,76)
   assert.equal(finished.victory,true)
   assert.equal(finished.config.slug,'bleach')
   assert.equal(finished.rewards.length,2)
   const resA=finished.rewards.find(r=>r.jid===a)
   const resB=finished.rewards.find(r=>r.jid===b)
   assert.ok(resA.damage>=25000)
   assert.ok(resB.damage>=25000)
   assert.equal(resA.material.qty,1)
   assert.equal(resB.material.qty,8)
   const mats=(await db.query("SELECT jid,quantity FROM inventories WHERE jid=ANY($1::text[]) AND item_id=$2",
    [[a,b],BLEACH_FRAGMENT_ITEM])).rows
   assert.equal(Number(mats.find(x=>x.jid===a)?.quantity),1)
   assert.equal(Number(mats.find(x=>x.jid===b)?.quantity),8)
   assert.equal(Number((await db.query("SELECT (value->>'earned')::int AS n FROM trevo_settings WHERE key=$1",[dailyKey])).rows[0].n),48)
   assert.equal((await getState()).status,'completed')
   assert.deepEqual(await getState(75),before)
   const replay=await raidRound(chat,76)
   assert.equal(replay.reason,'inactive')
   const after=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[b])).rows[0].cash
   assert.equal(Number(after)-Number(bOriginal),resB.cash)
   const pecadosFragments=await db.query(
    "SELECT quantity FROM inventories WHERE jid=ANY($1::text[]) AND item_id='fragmento_ascensao_pecados_20261024'",
    [[a,b]])
   assert.equal(pecadosFragments.rowCount,0)
   const pecadosDaily=await db.query(
    "SELECT COUNT(*)::int AS n FROM trevo_settings WHERE key LIKE 'collab_raid_fragments_daily:%'")
   assert.equal(pecadosDaily.rows[0].n,0)
   const final75=await cancelRaid(chat,c,75)
   assert.equal(final75.level,75)
  })
 }finally{await db.end()}
})
