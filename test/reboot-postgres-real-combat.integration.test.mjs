import test from 'node:test'
import assert from 'node:assert/strict'

// Only a disposable local PostgreSQL made for this CI job; never remote DSNs.
const dsn=process.env.ALPHA_V2_TEST_DATABASE_URL
test('V2 manual combat: real schema, equipment, keys, rounds, cash, XP and concurrent settlement',async t=>{
  if(!dsn){t.skip('requires disposable V2 PostgreSQL');return}
  const url=new URL(dsn)
  assert.ok(['postgres:','postgresql:'].includes(url.protocol))
  assert.equal(url.hostname,'127.0.0.1')
  assert.equal(url.port,'5432')
  assert.equal(url.pathname,'/alpha_reboot_ci')
  assert.equal(url.search,'')
  assert.equal(process.env.DATABASE_URL,dsn)
  assert.equal(process.env.ALPHA_REBOOT_MODE,'classes_only')
  assert.equal(process.env.ALPHA_REBOOT_DB_CONFIRMED,'isolated-v2')
  assert.notEqual(process.env.ALPHA_REBOOT_ALLOW_WHATSAPP,'cutover-approved')
  const {db,initDatabase,initCommunityPack,ensureUser,transaction,grantExpInTransaction,claimCooldown}=await import('../src/neon/db.js')
  const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
  const {initAwakening}=await import('../src/neon/awakening.js')
  const {initRelics}=await import('../src/neon/relics.js')
  const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
  const {initRaidLoteStore}=await import('../src/neon/raid-lote-store.js')
  const {initGames,getRaidCatalog,createRaid,joinRaid,startRaid,raidRound}=await import('../src/neon/games.js')
  const realNow=Date.now,realRandom=Math.random
  const jids=['5511000000001','5511000000002','5511000000003','5511000000004'].map(x=>x+'@s.whatsapp.net')
  const roles=['paladin','samurai','berserker','necromancer']
  const chat='v2-ci-raid10@g.us'
  try{
    try{await initDatabase()}catch(error){
      if(!/relation ["']?(pets|pet_collection)["']? does not exist/i.test(String(error.message||'')))throw error
    }
    await initCommunityPack()
    await initDatabase()
    await initPlayableHeroes()
    await initAwakening()
    await initRelics()
    await initEnchantments()
    await initGames()
    await initRaidLoteStore(db)
    const catalog=getRaidCatalog(),cfg=catalog.find(r=>Number(r.level)===10)
    assert.equal(cfg.keyPrice,2000)
    assert.equal(Number(cfg.hp),9500)
    assert.ok(!catalog.some(r=>Number(r.level)===75))
    for(let n=0;n<jids.length;n++){
      const jid=jids[n],role=roles[n]
      await ensureUser(jid,'CI '+role)
      assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash),0)
      await db.query('UPDATE users SET level=90,exp=0 WHERE jid=$1',[jid])
      await db.query('UPDATE wallets SET cash=100000 WHERE jid=$1',[jid])
      await db.query('UPDATE stats SET hp=812,max_hp=812,atk=188,def=94,spd=99,class_id=$2,class_applied=TRUE,weapon_id=$3,armor_id=$4 WHERE jid=$1',[jid,role,'espada_ferro','armadura_couro'])
      await db.query('INSERT INTO player_class_levels(jid,class_id,level,xp) VALUES($1,$2,90,0) ON CONFLICT(jid,class_id) DO UPDATE SET level=90,xp=0',[jid,role])
      await db.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'espada_ferro',1),($1,'armadura_couro',1)",[jid])
    }
    let clock=realNow()+10000
    Date.now=()=>clock
    Math.random=()=>.75
    assert.equal((await createRaid(chat,jids[0],'Paladino',10)).autoKeyPurchased,true)
    for(const jid of jids.slice(1))await joinRaid(chat,jid,'CI',10)
    const active=await startRaid(chat,jids[0],10)
    assert.equal(active.status,'active')
    assert.equal(Object.keys(active.players).length,4)
    assert.equal(active.maxHp,Math.round(cfg.hp*1.36))
    for(const jid of jids){
      assert.equal(Number((await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,cfg.keyId])).rows[0].quantity),0)
      assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash),98000)
      assert.equal(Boolean(active.players[jid].heroId),false)
    }
    let outcome,rounds=0
    while(rounds<40){
      clock+=9000
      // Two calls for the same room: only one advances/settles.
      const pair=await Promise.all([raidRound(chat,10),raidRound(chat,10)])
      const progressed=pair.filter(x=>!['cooldown','inactive'].includes(x.reason))
      assert.equal(progressed.length,1)
      outcome=progressed[0]
      rounds++
      if(outcome.victory||outcome.failed)break
    }
    assert.equal(outcome?.victory,true)
    assert.ok(rounds>1)
    assert.equal(outcome.rewards.length,4)
    assert.equal(outcome.rewards.reduce((sum,p)=>sum+p.damage,0),active.maxHp)
    assert.equal(outcome.rewards.reduce((sum,p)=>sum+p.cash,0),4*cfg.keyPrice+1440)
    for(const reward of outcome.rewards){
      const wallet=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[reward.jid])).rows[0]
      assert.equal(Number(wallet.cash),98000+reward.cash)
      assert.ok(reward.awardedExp>0)
      const qty=(await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='minigame' AND note='raid_10'",[reward.jid])).rows[0].n
      assert.equal(qty,1)
    }
    clock+=9000
    assert.equal((await raidRound(chat,10)).reason,'inactive')
    // Same player, three concurrent XP credits: real row locks and same daily cap.
    const credits=await Promise.all(Array.from({length:3},()=>transaction(c=>grantExpInTransaction(c,jids[0],100000))))
    const quota=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',['reboot_xp_daily:'+jids[0]])).rows[0].value
    assert.equal(Number(quota.used),12000)
    assert.ok(credits.reduce((sum,r)=>sum+Number(r.awardedGain||0),0)<=12000)
    const cd=await Promise.all(Array.from({length:3},()=>transaction(c=>claimCooldown(c,'v2-ci:global:'+jids[0],1800))))
    assert.equal(cd.filter(x=>x.ok).length,1)
    // A Raid70 lobby with a single player cannot consume its already purchased key.
    const highChat='v2-ci-raid70@g.us',high=catalog.find(r=>Number(r.level)===70)
    await db.query('UPDATE wallets SET cash=100000 WHERE jid=$1',[jids[1]])
    await createRaid(highChat,jids[1],'Solo',70)
    await assert.rejects(startRaid(highChat,jids[1],70),/3 jogadores/)
    assert.equal(Number((await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jids[1],high.keyId])).rows[0].quantity),1)
    console.log('ALPHA_V2_REAL_CI',JSON.stringify({rounds,participants:4,damage:active.maxHp,cashPool:9440,xpCap:quota.used,cooldownClaims:1,soloRaid70Blocked:true}))
  }finally{
    Date.now=realNow;Math.random=realRandom
    await db.end()
  }
})
