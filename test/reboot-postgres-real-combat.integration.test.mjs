import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'

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
  const {db,initDatabase,initCommunityPack,ensureUser,grantExpInTransaction,claimCooldown,battle,dungeon,usePotion,getDoubleEventMultiplier,getPetXpEventMultiplier,getLuckyBoxMultiplier,getDoubleRewardEvent,startDoubleRewardEvent,petMaxHp,petMaxEnergy,equipmentStatsAtLevel}=await import('../src/neon/db.js')
  const {setOwnerEvent,listOwnerEvents,getOwnerEventMultiplier}=await import('../src/neon/owner-event-center.js')
  const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
  const {initAwakening}=await import('../src/neon/awakening.js')
  const {initRelics}=await import('../src/neon/relics.js')
  const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
  const {initRaidLoteStore}=await import('../src/neon/raid-lote-store.js')
  const {initGames,getRaidCatalog,createRaid,joinRaid,startRaid,raidRound,cancelRaid}=await import('../src/neon/games.js')
  const {PLAYER_CLASSES}=await import('../src/neon/game-catalog.js')
  const {V2_CONSUMABLE_PRICES}=await import('../src/neon/reboot-progression-rewards.js')
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
    // Live SQL lifecycle at FULL Raid70 HP, not a pre-damaged room.
    // Endgame fixture injects legitimate catalogue gear and documented
    // level-100 / awakening-V stats directly: acquisition is not tested.
    await cancelRaid(highChat,jids[1],70)
    const highGroup='v2-ci-coop70@g.us',highJids=roles.map((_,n)=>'55110000000'+String(n+6).padStart(2,'0')+'@s.whatsapp.net')
    const gear=['foice_abismo','manto_abismo_eterno']
    const stock={elixir_supremo:60,pocao_pet_comum:30,pocao_pet_rara:30,pocao_pet_epica:30,pocao_pet_suprema:30,pocao_pet_full:10,energetico_pet:5}
    for(let n=0;n<highJids.length;n++){
      const jid=highJids[n],role=roles[n],cl=PLAYER_CLASSES[role]
      await ensureUser(jid,'Endgame '+role)
      await db.query('UPDATE users SET level=100,exp=0 WHERE jid=$1',[jid])
      await db.query('UPDATE wallets SET cash=100000 WHERE jid=$1',[jid])
      const max=100+99*8+cl.hp+215
      const gearHp=gear.reduce((sum,id)=>sum+equipmentStatsAtLevel(id,10,5).hp,0)
      await db.query('UPDATE stats SET hp=$2,max_hp=$3,atk=$4,def=$5,spd=$6,class_id=$7,class_applied=TRUE,weapon_id=$8,armor_id=$9 WHERE jid=$1',[jid,max+gearHp,max,10+99*2+cl.atk+43,5+99+cl.def+43,10+99+cl.spd,role,...gear])
      await db.query('INSERT INTO player_class_levels(jid,class_id,level,xp) VALUES($1,$2,100,0)',[jid,role])
      await db.query('INSERT INTO player_awakenings(jid,stage) VALUES($1,5)',[jid])
      for(const id of gear){
        await db.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)',[jid,id])
        await db.query('INSERT INTO equipment_upgrades(jid,item_id,level) VALUES($1,$2,10)',[jid,id])
        await db.query('INSERT INTO equipment_star_forges(jid,item_id,stars,level) VALUES($1,$2,5,10)',[jid,id])
      }
      for(const [id,qty] of Object.entries(stock))await db.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)',[jid,id,qty])
      const sp='serafim_vida_abissal',xp=9900,energy=petMaxEnergy(100,sp),hp=petMaxHp(100,xp,sp)
      await db.query('INSERT INTO pets(jid,species,name,level,xp,hp,max_hp,energy) VALUES($1,$2,$2,100,$3,$4,$4,$5)',[jid,sp,xp,hp,energy])
      const petId=(await db.query('INSERT INTO pet_collection(jid,species,name,level,xp,hp,max_hp,energy,active) VALUES($1,$2,$2,100,$3,$4,$4,$5,TRUE) RETURNING id',[jid,sp,xp,hp,energy])).rows[0].id
      await db.query('INSERT INTO pet_team(jid,slot,pet_id) VALUES($1,1,$2)',[jid,petId])
    }
    let seed=721190
    Math.random=()=>{seed=(seed+0x6d2b79f5)>>>0;let y=Math.imul(seed^(seed>>>15),1|seed);y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296}
    await createRaid(highGroup,highJids[0],'Paladino',70)
    await assert.rejects(joinRaid(highGroup,novice,'Iniciante',70),/nível 90/)
    for(const jid of highJids.slice(1))await joinRaid(highGroup,jid,'CI endgame',70)
    const highStart=await startRaid(highGroup,highJids[0],70)
    assert.equal(highStart.maxHp,2176000)
    assert.equal(highStart.durationMinutes,50)
    assert.equal(highStart.hp,highStart.maxHp)
    let highOutcome,highRounds=0
    for(let n=0;n<=375;n++){
      clock+=8000
      highOutcome=await raidRound(highGroup,70)
      if(highOutcome.victory||highOutcome.failed)break
      highRounds++
    }
    const highState=(await db.query("SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type='raid:70'",[highGroup])).rows[0].state
    const spentRows=(await db.query('SELECT jid,item_id,quantity FROM inventories WHERE jid=ANY($1::text[]) AND item_id=ANY($2::text[])',[highJids,Object.keys(stock)])).rows
    const consumableCost=spentRows.reduce((sum,row)=>sum+Math.max(0,stock[row.item_id]-Number(row.quantity))*V2_CONSUMABLE_PRICES[row.item_id],0)
    console.log('ALPHA_V2_RAID70_FULL',JSON.stringify({victory:!!highOutcome?.victory,reason:highOutcome?.reason,rounds:highState.round,hp:highState.hp,maxHp:highState.maxHp,consumableCost,damage:Object.values(highState.players).map(p=>({class:p.classId,damage:p.damage,healing:p.classHealing,petTurns:p.pet?.turns,protection:p.alliedProtection||0,curse:p.curseTeamDamage||0}))}))
    assert.equal(highOutcome?.victory,true,'Endgame fixture should win the full Raid70 within its duration')
    assert.ok(highState.round>1&&highState.round<=375)
    assert.equal(highOutcome.rewards.length,4)
    assert.equal(highOutcome.rewards.reduce((sum,r)=>sum+r.damage,0),highStart.maxHp)
    assert.equal(highOutcome.rewards.reduce((sum,r)=>sum+r.cash,0),264000)
    for(const reward of highOutcome.rewards){
      assert.ok(reward.damage>=highStart.maxHp*.05)
      assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[reward.jid])).rows[0].cash),40000+reward.cash)
      assert.equal(Number((await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='minigame' AND note='raid_70'",[reward.jid])).rows[0].n),1)
    }
    clock+=8000
    assert.equal((await raidRound(highGroup,70)).reason,'inactive')
    // Adversarial fixture: three entrants but one attack kills the full boss.
    // Deliberately impossible ATK tests settlement eligibility, not balance.
    const carry='v2-ci-carry70@g.us',carryJids=highJids.slice(0,3)
    for(const jid of carryJids){
      await db.query('UPDATE wallets SET cash=100000,bank=0 WHERE jid=$1',[jid])
      await db.query('UPDATE stats SET hp=max_hp,atk=$2 WHERE jid=$1',[jid,jid===carryJids[0]?2000000:1])
      await db.query('UPDATE inventories SET quantity=0 WHERE jid=$1 AND item_id=$2',[jid,high.keyId])
    }
    await createRaid(carry,carryJids[0],'Carrier',70)
    for(const jid of carryJids.slice(1))await joinRaid(carry,jid,'Carry fixture',70)
    await startRaid(carry,carryJids[0],70)
    clock+=8000
    const denied=await raidRound(carry,70)
    assert.equal(denied.reason,'insufficient_cooperation')
    for(const jid of carryJids){
      assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash),40000)
      assert.equal(Number((await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE to_jid=$1 AND type='minigame' AND note='raid_70'",[jid])).rows[0].n),1)
    }
    console.log('ALPHA_V2_RAID70_COOP_OK',JSON.stringify({rounds:highState.round,cash:264000,netBeforeConsumables:24000,consumableCost,netAfterConsumables:24000-consumableCost,carryDenied:true}))
    // Invoke the real Web HTTP handler with in-process requests, no listener,
    // no real WhatsApp connection, no external HTTP or credentials.
    const {handleWebApi,createWebLinkCode}=await import('../src/neon/web-api.js')
    const {webTokenHash}=await import('../src/neon/web-password-auth.js')
    async function request(method,path,body,token,origin){
      const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))])
      Object.assign(req,{method,url:path,headers:{...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{})},socket:{remoteAddress:'127.0.0.1'}})
      let status,raw='',headers={}
      const res={setHeader(k,v){headers[k.toLowerCase()]=v},writeHead(n,h={}){status=n;headers={...headers,...h}},end(v){raw=v===undefined?'':String(v)}}
      assert.equal(await handleWebApi(req,res),true)
      return {status,headers,body:raw?JSON.parse(raw):null}
    }
    const root='/api/v1',passwordA='CITest-Alpha-A-2026!',passwordB='CITest-Alpha-B-2026!',passwordNew='CITest-Alpha-New-2026!'
    const phoneA=jids[0].split('@')[0],phoneB=jids[1].split('@')[0]
    await db.query('UPDATE wallets SET cash=5000,bank=0 WHERE jid=ANY($1::text[])',[jids.slice(0,2)])
    assert.equal((await request('GET',root+'/health')).status,200)
    const catalogResponse=await request('GET',root+'/catalog')
    assert.equal(catalogResponse.status,200)
    assert.deepEqual(catalogResponse.body.data.classes.map(c=>c.id).sort(),roles.slice().sort())
    assert.ok(!catalogResponse.body.data.raids.some(r=>Number(r.level)===75))
    assert.equal((await request('GET',root+'/me/event-center')).status,401)
    const codeA=await createWebLinkCode(jids[0]),codeB=await createWebLinkCode(jids[1])
    assert.equal((await request('POST',root+'/auth/exchange',{code:codeA.code})).status,410)
    const statusA=await request('POST',root+'/auth/code/status',{code:codeA.code})
    assert.equal(statusA.body.mode,'register')
    // An adversarial body cannot bind someone else's identity.
    const registeredA=await request('POST',root+'/auth/register',{code:codeA.code,password:passwordA,phone:phoneB,jid:jids[1]})
    assert.equal(registeredA.status,200)
    assert.equal(registeredA.body.phone,phoneA)
    assert.equal((await request('POST',root+'/auth/register',{code:codeA.code,password:passwordA})).status,400)
    assert.equal((await request('POST',root+'/auth/register',{code:codeB.code,password:passwordB})).status,200)
    assert.equal((await request('POST',root+'/auth/login',{phone:phoneB,password:passwordA})).status,400)
    const login=await request('POST',root+'/auth/login',{phone:phoneA,password:passwordA,jid:jids[1]})
    assert.equal(login.status,200)
    const token=login.body.token
    const session=(await db.query('SELECT jid,auth_method FROM web_sessions WHERE token_hash=$1',[webTokenHash(token)])).rows[0]
    assert.equal(session.jid,jids[0])
    assert.equal(session.auth_method,'password')
    assert.equal((await request('GET',root+'/me/event-center',undefined,token)).status,200)
    // Legacy tokens must no longer grant access even with a password account.
    const legacy='ci-legacy-token-only'
    await db.query("INSERT INTO web_sessions(token_hash,jid,expires_at,created_at,last_seen_at,auth_method) VALUES($1,$2,$3,$4,$4,'legacy')",[webTokenHash(legacy),jids[0],clock+60000,clock])
    assert.equal((await request('GET',root+'/me/event-center',undefined,legacy)).status,401)
    const deposited=await request('POST',root+'/action/deposit',{amount:1000,jid:jids[1],phone:phoneB},token)
    assert.equal(deposited.status,200)
    const wallets=(await db.query('SELECT jid,cash,bank FROM wallets WHERE jid=ANY($1::text[]) ORDER BY jid',[jids.slice(0,2)])).rows
    assert.deepEqual(wallets.map(w=>[Number(w.cash),Number(w.bank)]),[[4000,1000],[5000,0]])
    const hiddenPet=(await db.query('SELECT id FROM pet_collection WHERE jid=$1 LIMIT 1',[highJids[0]])).rows[0].id
    assert.equal((await request('GET',root+'/me/pet-team-preview?ids='+hiddenPet,undefined,token)).status,400)
    assert.notEqual((await request('POST',root+'/action/hero.select',{heroId:'pecado_ban'},token)).status,200)
    assert.notEqual((await request('POST',root+'/action/raid.create',{level:75},token)).status,200)
    const recover=await createWebLinkCode(jids[0])
    assert.equal((await request('POST',root+'/auth/code/status',{code:recover.code})).body.mode,'recover')
    const recovered=await request('POST',root+'/auth/recover',{code:recover.code,password:passwordNew})
    assert.equal(recovered.status,200)
    assert.equal((await request('GET',root+'/me/event-center',undefined,token)).status,401)
    assert.equal((await request('POST',root+'/auth/login',{phone:phoneA,password:passwordA})).status,400)
    const fresh=await request('POST',root+'/auth/login',{phone:phoneA,password:passwordNew})
    assert.equal(fresh.status,200)
    assert.equal((await request('POST',root+'/auth/logout',{},fresh.body.token)).status,200)
    assert.equal((await request('GET',root+'/me/event-center',undefined,fresh.body.token)).status,401)
    // No secret, token, phone or password is included in the marker.
    console.log('ALPHA_V2_WEB_HTTP_OK',JSON.stringify({passwordRequired:true,codeSingleUse:true,sessionIsolation:true,legacyTokenDenied:true,foreignPetDenied:true,recoveryRevokes:true,logoutRevokes:true,catalogFourClasses:true}))
    if(process.env.ALPHA_V2_BROWSER_CI==='1'){
      const {initProgression}=await import('../src/neon/progression.js')
      const {initLoans}=await import('../src/neon/loans.js')
      await initProgression()
      await initLoans()
      const {validateDailyV2Formulas,runDailyV2SmokeTest,getDailyMissionsV2}=await import('../src/neon/daily-v2.js')
      assert.equal(validateDailyV2Formulas().mode,'classes_only')
      assert.equal((await runDailyV2SmokeTest()).status,'pass')
      assert.equal((await getDailyMissionsV2(jids[0])).missions.length,6)
      // Earlier raid joins intentionally update display names. Set explicit fixture names.
      await db.query('UPDATE users SET push_name=$2 WHERE jid=$1',[jids[0],'CI paladin'])
      await db.query('UPDATE users SET push_name=$2 WHERE jid=$1',[jids[1],'CI samurai'])
      // Real Chromium + actual static frontend + actual API and disposable DB.
      const {chromium}=await import('playwright')
      const {createServer}=await import('node:http')
      const {readFile}=await import('node:fs/promises')
      const {resolve,extname,sep}=await import('node:path')
      const {fileURLToPath}=await import('node:url')
      const webRoot=fileURLToPath(new URL('../web/',import.meta.url))
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}
      const failures=[]
      const server=createServer(async(req,res)=>{
        try{
          if(await handleWebApi(req,res))return
          const path=new URL(req.url,'http://localhost').pathname
          const file=resolve(webRoot,path==='/'||path==='/rpg'?'index.html':'.'+decodeURIComponent(path))
          if(!file.startsWith(resolve(webRoot)+sep)){res.writeHead(403);res.end();return}
          const data=await readFile(file)
          res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'})
          res.end(data)
        }catch(error){
          const missing=error.code==='ENOENT'
          if(!missing)failures.push(String(error.message))
          if(!res.headersSent)res.writeHead(missing?404:500)
          res.end()
        }
      })
      let browser
      try{
        await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)})
        const origin='http://127.0.0.1:'+server.address().port
        browser=await chromium.launch({headless:true})
        const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'})
        await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
        const page=await context.newPage()
        const jsErrors=[]
        page.on('pageerror',err=>jsErrors.push(err.message))
        await page.goto(origin+'/rpg')
        await page.locator('#passwordLoginForm').waitFor({state:'visible'})
        assert.equal(await page.locator('#app').isVisible(),false)
        await page.locator('#loginPhone').fill(phoneA)
        await page.locator('#loginPassword').fill(passwordNew)
        await page.locator('#passwordLoginForm button[type=submit]').click()
        await page.locator('#app').waitFor({state:'visible',timeout:15000})
        await page.locator('#miniProfile').getByText('CI paladin',{exact:true}).waitFor({timeout:15000})
        await page.locator('#nav [data-page=character]').click()
        await page.getByRole('heading',{name:'Seu personagem'}).waitFor()
        const classes=await page.locator('#content [data-character-select]').evaluateAll(buttons=>buttons.map(x=>x.dataset.characterSelect).sort())
        assert.deepEqual(classes,roles.slice().sort())
        assert.equal(await page.locator('#content .collab-hero-card').count(),0)
        // No group linked means no group raid buttons.
        await page.locator('#nav [data-page=raids]').click()
        await page.getByText('Esta sessão foi vinculada no privado.',{exact:false}).waitFor()
        // New code for B must clear A from the same browser before any password.
        const switchCode=await createWebLinkCode(jids[1])
        await page.evaluate(code=>{location.hash='code='+code},switchCode.code)
        await page.locator('#recoverForm').waitFor({state:'visible'})
        assert.equal(await page.locator('#app').isVisible(),false)
        assert.equal(await page.evaluate(()=>localStorage.getItem('alphaWebTokenV1')),null)
        await page.reload()
        await page.locator('#recoverForm').waitFor({state:'visible'})
        assert.equal(await page.locator('#app').isVisible(),false)
        await page.locator('#backToPasswordBtn').click()
        await page.locator('#loginPhone').fill(phoneB)
        await page.locator('#loginPassword').fill(passwordB)
        await page.locator('#passwordLoginForm button[type=submit]').click()
        await page.locator('#miniProfile').getByText('CI samurai',{exact:true}).waitFor({timeout:15000})
        await page.setViewportSize({width:390,height:844})
        await page.locator('#menuBtn').click()
        await page.locator('#nav [data-page=character]').click()
        await page.getByRole('heading',{name:'Seu personagem'}).waitFor()
        assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false)
        assert.equal(await page.locator('#content [data-character-select]').count(),4)
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'mobile horizontal overflow')
        await page.locator('#menuBtn').click()
        await page.locator('#logoutBtn').click()
        await page.locator('#loginOverlay').waitFor({state:'visible'})
        assert.equal(await page.locator('#app').isVisible(),false)
        assert.equal(await page.evaluate(()=>localStorage.getItem('alphaWebTokenV1')),null)
        assert.deepEqual(jsErrors,[])
        assert.deepEqual(failures,[])
        console.log('ALPHA_V2_CHROMIUM_OK',JSON.stringify({desktop:true,mobile390:true,fourClasses:true,oldAccountClearedOnCode:true,reloadRequiresPassword:true,accountSwitch:true,logout:true}))
        await context.close()
        // A separate browser context allows the real service worker to install.
        // Seed a deliberately obsolete cache before loading the current shell.
        const pwa=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'})
        await pwa.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
        const installed=await pwa.newPage()
        await installed.goto(origin+'/version.json')
        await installed.evaluate(async()=>{
          const old=await caches.open('alpha-rpg-pwa-20261116-no-npcs-v1')
          await old.put('/app.js',new Response('obsolete-test-placeholder',{headers:{'content-type':'text/javascript'}}))
        })
        await installed.goto(origin+'/rpg')
        await installed.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),{},{timeout:20000})
        const cacheInfo=await installed.evaluate(async()=>{
          const names=await caches.keys()
          const active=await caches.open('alpha-rpg-pwa-20261119-identity-v2')
          const entries=(await active.keys()).map(req=>new URL(req.url).pathname)
          const js=await (await active.match('/app.js')).text()
          return {names,entries,current:js.includes('alpha-web-reboot-20261119-identity-v2')&&js.includes("window.addEventListener('hashchange'")}
        })
        assert.ok(!cacheInfo.names.includes('alpha-rpg-pwa-20261116-no-npcs-v1'))
        assert.ok(cacheInfo.names.includes('alpha-rpg-pwa-20261119-identity-v2'))
        assert.ok(cacheInfo.current)
        for(const path of ['/rpg','/app.js','/styles.css','/manifest.webmanifest','/racing-ui.js','/clan-siege-ui.js'])assert.ok(cacheInfo.entries.includes(path),'missing PWA shell '+path)
        await installed.reload()
        await installed.locator('#loginPhone').fill(phoneB)
        await installed.locator('#loginPassword').fill(passwordB)
        await installed.locator('#passwordLoginForm button[type=submit]').click()
        await installed.locator('#miniProfile').getByText('CI samurai',{exact:true}).waitFor({timeout:15000})
        assert.deepEqual(await installed.evaluate(async()=>{
          const matches=[]
          for(const name of await caches.keys()){
            for(const entry of await (await caches.open(name)).keys())if(new URL(entry.url).pathname.startsWith('/api/'))matches.push('API')
          }
          return matches
        }),[],'Authenticated API must never be cached by PWA')
        await pwa.setOffline(true)
        const apiOffline=await installed.evaluate(async()=>{
          try{await fetch('/api/v1/me/bootstrap',{headers:{authorization:'Bearer '+localStorage.getItem('alphaWebTokenV1')}});return false}catch{return true}
        })
        assert.equal(apiOffline,true,'Service worker must not serve authenticated profile while offline')
        await pwa.setOffline(false)
        await installed.locator('#menuBtn').click()
        await installed.locator('#logoutBtn').click()
        await installed.locator('#loginOverlay').waitFor({state:'visible'})
        assert.equal(await installed.evaluate(()=>localStorage.getItem('alphaWebTokenV1')),null)
        await installed.reload()
        await installed.locator('#passwordLoginForm').waitFor({state:'visible'})
        assert.equal(await installed.locator('#app').isVisible(),false)
        await pwa.close()
        console.log('ALPHA_V2_PWA_OK',JSON.stringify({workerActivated:true,oldCachePurged:true,currentAssets:true,apiNotCached:true,offlineApiDenied:true,logoutPersists:true}))
      }finally{
        if(browser)await browser.close()
        await new Promise(ok=>server.close(ok))
      }
    }
    console.log('ALPHA_V2_REAL_CI',JSON.stringify({rounds,participants:4,damage:active.maxHp,cashPool:9440,xpCap:quota.used,cooldownClaims:1,soloRaid70Blocked:true,legacyMultipliersBlocked:true,pvpBilateral:true,dungeon:true,potionConsumed:true,realPetEnergyAndVitalSynergy:true}))
  }finally{
    Date.now=realNow;Math.random=realRandom
    await db.end()
  }
})
