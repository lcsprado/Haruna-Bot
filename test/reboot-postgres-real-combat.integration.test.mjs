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
  const {db,initDatabase,initCommunityPack,ensureUser,grantExpInTransaction,claimCooldown,battle,dungeon,usePotion,getDoubleEventMultiplier,getPetXpEventMultiplier,getLuckyBoxMultiplier,getDoubleRewardEvent,startDoubleRewardEvent}=await import('../src/neon/db.js')
  const {setOwnerEvent,listOwnerEvents,getOwnerEventMultiplier}=await import('../src/neon/owner-event-center.js')
  const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
  const {initAwakening}=await import('../src/neon/awakening.js')
  const {initRelics}=await import('../src/neon/relics.js')
  const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
  const {initRaidLoteStore}=await import('../src/neon/raid-lote-store.js')
  const {initGames,getRaidCatalog,createRaid,joinRaid,startRaid,raidRound}=await import('../src/neon/games.js')
  async function transaction(fn){
    const c=await db.connect()
    try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value}
    catch(e){await c.query('ROLLBACK');throw e}
    finally{c.release()}
  }
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
    // Valid catalogue species with one unit of energy and two living allies.
    // These are synthetic test assets, never copied from production.
    const species=['cervo_aurora_viva','guardiao_nucleo_vital','quimera_rubra']
    for(let n=0;n<species.length;n++){
      const jid=jids[0],energy=n===0?1:2
      const r=await db.query('INSERT INTO pet_collection(jid,species,name,level,xp,hp,max_hp,energy,active) VALUES($1,$2,$2,90,0,400,400,$3,$4) RETURNING id',[jid,species[n],energy,n===0])
      await db.query('INSERT INTO pet_team(jid,slot,pet_id) VALUES($1,$2,$3)',[jid,n+1,r.rows[0].id])
      if(n===0)await db.query('INSERT INTO pets(jid,species,name,level,xp,hp,max_hp,energy) VALUES($1,$2,$2,90,0,400,400,$3)',[jid,species[n],energy])
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
    assert.equal(active.players[jids[0]].teamSynergy?.vitalPulse,.05)
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
      if(rounds===1||rounds===2){
        const saved=(await db.query("SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type='raid:10'",[chat])).rows[0].state.players[jids[0]]
        assert.equal(saved.pet.energy,0)
        assert.equal(saved.pet.turns,1)
        assert.equal(Number(saved.teamSynergy?.vitalPulse||0),rounds===1?.05:0)
      }
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
    // Active records from old seasons must not change V2 rewards or status.
    for(const key of ['double_reward_event','pet_care_event','lucky_box_event','owner_event_center:dinheiro','owner_event_center:pet']){
      await db.query("INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
        [key,JSON.stringify({startsAt:clock-1000,endsAt:clock+3600000,multiplier:10,moneyMultiplier:10,xpMultiplier:10})])
    }
    assert.equal(await getDoubleEventMultiplier(db,'money'),1)
    assert.equal(await getDoubleEventMultiplier(db,'xp'),1)
    assert.equal(await getPetXpEventMultiplier(db),1)
    assert.equal(await getLuckyBoxMultiplier(db),1)
    assert.equal((await getDoubleRewardEvent()).active,false)
    assert.equal(await getOwnerEventMultiplier(db,'dinheiro'),1)
    assert.ok((await listOwnerEvents()).every(e=>!e.active&&!e.scheduled))
    await assert.rejects(startDoubleRewardEvent(),/indisponível/)
    await assert.rejects(setOwnerEvent('xp'),/indisponíveis/)
    // Real PvP enforces bilateral rookie protection before charging cooldown.
    const novice='5511000000005@s.whatsapp.net'
    await ensureUser(novice,'Iniciante CI')
    await assert.rejects(battle(novice,jids[1]),/PROTEÇÃO DE INICIANTE/)
    await assert.rejects(battle(jids[1],novice),/PROTEÇÃO DE INICIANTE/)
    const duel=await battle(jids[1],jids[2])
    assert.equal(duel.ok,true)
    assert.equal(duel.eventMultiplier,1)
    assert.ok(duel.reward>=600&&duel.reward<=1200)
    assert.equal((await battle(jids[1],jids[2])).ok,false)
    await db.query('UPDATE stats SET hp=100 WHERE jid=$1',[jids[3]])
    await db.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'pocao_m',1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=1",[jids[3]])
    const heal=await usePotion(jids[3],'pocao_m')
    assert.equal(heal.itemId,'pocao_m')
    assert.equal(Number((await db.query("SELECT quantity FROM inventories WHERE jid=$1 AND item_id='pocao_m'",[jids[3]])).rows[0].quantity),0)
    assert.ok(Number((await db.query('SELECT hp FROM stats WHERE jid=$1',[jids[3]])).rows[0].hp)>100)
    await db.query('UPDATE stats SET hp=max_hp WHERE jid=$1',[jids[3]])
    const dungeonResult=await dungeon(jids[3])
    assert.equal(dungeonResult.ok,true)
    assert.equal(dungeonResult.eventMultiplier,1)
    assert.equal((await dungeon(jids[3])).ok,false)
    // A Raid70 lobby with a single player cannot consume its already purchased key.
    const highChat='v2-ci-raid70@g.us',high=catalog.find(r=>Number(r.level)===70)
    await db.query('UPDATE wallets SET cash=100000 WHERE jid=$1',[jids[1]])
    await createRaid(highChat,jids[1],'Solo',70)
    await assert.rejects(startRaid(highChat,jids[1],70),/3 jogadores/)
    assert.equal(Number((await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jids[1],high.keyId])).rows[0].quantity),1)
    console.log('ALPHA_V2_REAL_CI',JSON.stringify({rounds,participants:4,damage:active.maxHp,cashPool:9440,xpCap:quota.used,cooldownClaims:1,soloRaid70Blocked:true,legacyMultipliersBlocked:true,pvpBilateral:true,dungeon:true,potionConsumed:true,realPetEnergyAndVitalSynergy:true}))
  }finally{
    Date.now=realNow;Math.random=realRandom
    await db.end()
  }
})
