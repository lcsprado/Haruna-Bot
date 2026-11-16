import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const uri=process.env.DATABASE_URL||'';
let safe=false;
try {
 const u=new URL(uri);
 safe=['127.0.0.1','localhost'].includes(u.hostname)&&
  u.pathname==='/alpha_pvp_auto_e2e'&&process.env.ALPHA_PVP_AUTO_E2E==='1';
}catch{}
if(!safe){
 test('never test on production',()=>{throw new Error('Requires explicit localhost/alpha_pvp_auto_e2e')});
}else{
 test('full real battle() against disposable database and two synthetic players',async t=>{
 const {db,initDatabase,initCommunityPack,ensureUser,battle,
  configureAutoBattleStrategy,getAutoBattleStrategy}=await import('../src/neon/db.js');
 const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js');
 const {initAwakening}=await import('../src/neon/awakening.js');
 const {initEnchantments}=await import('../src/neon/enchantments-alpha.js');
 const {formatPvpBattleReport}=await import('../src/neon/pvp-report.js');
 const users=[];
 function random(seed){
  let x=seed>>>0;
  return ()=>{x=(x+0x6d2b79f5)>>>0;let y=Math.imul(x^(x>>>15),1|x);
   y^=y+Math.imul(y^(y>>>7),61|y);return ((y^(y>>>14))>>>0)/4294967296};
 }
 async function seededBattle(a,b,seed){
  const saved=Math.random;Math.random=random(seed);
  try{return await battle(a,b)}finally{Math.random=saved}
 }
 async function player(suffix,role,{hero=null,pet=true}={}){
  const jid='synthetic-pvp-'+suffix+'@s.whatsapp.net';
  users.push(jid);
  await ensureUser(jid,'Teste '+suffix);
  await db.query('UPDATE users SET level=120,exp=0 WHERE jid=$1',[jid]);
  await db.query('UPDATE wallets SET cash=250000,bank=100000 WHERE jid=$1',[jid]);
  await db.query("UPDATE stats SET hp=6500,max_hp=6500,atk=1500,def=1100,spd=550,class_id=$2,class_applied=TRUE,weapon_id='katana_divina',armor_id='armadura_divina',shield_id='escudo_runico' WHERE jid=$1",[jid,role]);
  await db.query('INSERT INTO player_class_levels(jid,class_id,level,xp) VALUES($1,$2,100,0) ON CONFLICT(jid,class_id) DO UPDATE SET level=100',[jid,role]);
  await db.query('INSERT INTO player_awakenings(jid,stage) VALUES($1,5) ON CONFLICT(jid) DO UPDATE SET stage=5',[jid]);
  for(const item of ['katana_divina','armadura_divina','escudo_runico']){
   await db.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=1',[jid,item]);
   await db.query('INSERT INTO equipment_upgrades(jid,item_id,level) VALUES($1,$2,10) ON CONFLICT(jid,item_id) DO UPDATE SET level=10',[jid,item]);
   await db.query('INSERT INTO equipment_star_forges(jid,item_id,stars,level) VALUES($1,$2,5,10) ON CONFLICT(jid,item_id) DO UPDATE SET stars=5,level=10',[jid,item]);
  }
  await db.query("INSERT INTO equipment_enchantments(jid,item_id,stone_id,quantity) VALUES($1,'katana_divina','pedra_furia_alpha',2) ON CONFLICT(jid,item_id,stone_id) DO UPDATE SET quantity=2",[jid]);
  if(pet)await db.query("INSERT INTO pets(jid,species,name,level,hp,max_hp,energy) VALUES($1,'fenix_celestial','Pet de Teste',100,1600,1600,100)",[jid]);
  if(hero){
   await db.query("INSERT INTO pet_collection(jid,species,name,level,xp,energy,hp,max_hp) VALUES($1,$2,'Heroi de Teste',100,9900,100,1800,1800)",[jid,hero]);
   await db.query('INSERT INTO player_hero_mode(jid,hero_species) VALUES($1,$2)',[jid,hero]);
   await db.query('INSERT INTO player_hero_mastery_unlocks(jid,hero_species,stage) VALUES($1,$2,5)',[jid,hero]);
  }
  return jid;
 }
 async function verify(a,b,result){
  assert.equal(result.ok,true);
  assert.ok(result.roundCount>=1&&result.roundCount<=20);
  assert.ok(result.log.some(x=>Number(x.dmg)>=0));
  assert.ok(Number(result.opening.attacker.shieldCritResist)>0);
  assert.ok(Number(result.opening.defender.shieldCritGuard)>0);
  assert.ok(result.opening.attacker.petPvpBonus);
  assert.equal(result.winXpGain,40);
  assert.equal(result.loseXpGain,15);
  assert.ok(result.reward>=600&&result.reward<=1200);
  const stats=(await db.query('SELECT jid,hp,win,loss FROM stats WHERE jid=ANY($1::text[])',[[a,b]])).rows;
  assert.equal(stats.length,2);
  assert.equal(stats.reduce((n,x)=>n+Number(x.win),0),1);
  assert.equal(stats.reduce((n,x)=>n+Number(x.loss),0),1);
  assert.ok(stats.every(x=>Number(x.hp)>0));
  const money=(await db.query('SELECT jid,cash,bank FROM wallets WHERE jid=ANY($1::text[])',[[a,b]])).rows;
  assert.equal(Number(money.find(x=>x.jid===result.winner.jid).cash),250000+result.reward);
  assert.equal(Number(money.find(x=>x.jid===result.loser.jid).cash),250000);
  assert.ok(money.every(x=>Number(x.bank)===100000));
  const tx=await db.query("SELECT to_jid,amount FROM transactions WHERE type='battle_reward' AND to_jid=ANY($1::text[])",[[a,b]]);
  assert.equal(tx.rowCount,1);
  assert.equal(tx.rows[0].to_jid,result.winner.jid);
  assert.equal(Number(tx.rows[0].amount),result.reward);
  const experience=(await db.query('SELECT jid,level,exp FROM users WHERE jid=ANY($1::text[])',[[a,b]])).rows;
  const xpWinner=experience.find(x=>x.jid===result.winner.jid);
  const xpLoser=experience.find(x=>x.jid===result.loser.jid);
  assert.equal(Number(xpWinner.level),Number(result.winExp.level));
  assert.equal(Number(xpWinner.exp),Number(result.winExp.exp));
  assert.equal(Number(xpLoser.level),Number(result.loseExp.level));
  assert.equal(Number(xpLoser.exp),Number(result.loseExp.exp));
  for(const jid of [a,b]){
   const equipped=(await db.query("SELECT item_id,stars,level FROM equipment_star_forges WHERE jid=$1 AND item_id=ANY($2::text[])",[jid,['katana_divina','armadura_divina','escudo_runico']])).rows;
   assert.equal(equipped.length,3);
   assert.ok(equipped.every(x=>Number(x.stars)===5&&Number(x.level)===10));
   const owned=(await db.query("SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[])",[jid,['katana_divina','armadura_divina','escudo_runico']])).rows;
   assert.equal(owned.length,3);
   assert.ok(owned.every(x=>Number(x.quantity)===1));
   const pet=(await db.query('SELECT level,hp,energy FROM pets WHERE jid=$1',[jid])).rows[0];
   assert.equal(Number(pet.level),100);
   assert.equal(Number(pet.hp),1600);
   assert.equal(Number(pet.energy),100);
  }
  const formatted=formatPvpBattleReport(result);
  assert.match(formatted,/BATALHA DO ALPHA BOT/);
  const second=await battle(a,b);
  assert.equal(second.ok,false);
  assert.ok(second.remaining>0);
  const after=await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE type='battle_reward' AND to_jid=ANY($1::text[])",[[a,b]]);
  assert.equal(after.rows[0].n,1,'cooldown prevents double payout');
 }
 try{
  await t.test('initialize production schema on a local throwaway Postgres',async()=>{
   await initDatabase();
   await initCommunityPack();
   await initPlayableHeroes();
   await initAwakening();
   await initEnchantments();
   const migration=readFileSync(new URL('../migrations/20261115_pvp_auto_strategy_NOT_APPLY.sql',import.meta.url),'utf8');
   await db.query(migration);
   const schema=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('stats','users','wallets','pet_collection','pets','player_hero_mode','pvp_auto_strategy_preferences')");
   assert.equal(schema.rowCount,7);
  });
  await t.test('same seeded class battle: flag OFF vs neutral ON, then strategy ON',async()=>{
   const a=await player('off-a','samurai'),b=await player('off-b','paladin');
   process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='0';
   const off=await seededBattle(a,b,932);await verify(a,b,off);
   const c=await player('neutral-a','samurai'),d=await player('neutral-b','paladin');
   process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='1';
   const neutral=await seededBattle(c,d,932);await verify(c,d,neutral);
   assert.deepEqual(off.log.map(x=>({dmg:x.dmg,crit:x.crit,dodged:x.dodged})),
    neutral.log.map(x=>({dmg:x.dmg,crit:x.crit,dodged:x.dodged})));
   const e=await player('strategy-a','samurai'),f=await player('strategy-b','paladin');
   assert.equal((await configureAutoBattleStrategy(e,'agressiva')).posture,'agressiva');
   assert.equal((await configureAutoBattleStrategy(f,'defensiva')).posture,'defensiva');
   assert.equal((await getAutoBattleStrategy(e)).posture,'agressiva');
   const strategic=await seededBattle(e,f,932);await verify(e,f,strategic);
   assert.notDeepEqual(strategic.log.map(x=>x.dmg),neutral.log.map(x=>x.dmg));
   assert.equal(strategic.opening.attacker.atk,neutral.opening.attacker.atk);
   assert.equal(strategic.opening.attacker.maxHp,neutral.opening.attacker.maxHp);
  });
  await t.test('hero mastery V, pet, gear, shield and adaptive posture',async()=>{
   process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='1';
   const a=await player('hero-a','warrior',{hero:'pecado_ban'});
   const b=await player('hero-b','samurai');
   assert.equal((await configureAutoBattleStrategy(a,'adaptativa')).combatant_id,'pecado_ban');
   await configureAutoBattleStrategy(b,'defensiva');
   const r=await seededBattle(a,b,1117);await verify(a,b,r);
   assert.equal(r.opening.attacker.heroId,'pecado_ban');
   assert.equal(Number(r.opening.attacker.heroMasteryStage),5);
   assert.equal(Number((await db.query('SELECT stage FROM player_hero_mastery_unlocks WHERE jid=$1',[a])).rows[0].stage),5);
  });
  await t.test('real !batalhar WhatsApp command branch -> PostgreSQL settlement -> formatted reply',async()=>{
   process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='1';
   const sender=await player('whatsapp-a','samurai');
   const target=await player('whatsapp-b','paladin');
   await configureAutoBattleStrategy(sender,'agressiva');
   await configureAutoBattleStrategy(target,'defensiva');
   const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
   const marker="} else if(['batalhar','batalha','battle','duelo'].includes(cmd)){";
   const start=src.indexOf(marker),end=src.indexOf("} else if(['rankingrpg','rankrpg','toprpg'].includes(cmd)){",start);
   assert.ok(start>0&&end>start);
   const body=src.slice(start+marker.length,end);
   const AsyncFn=Object.getPrototypeOf(async function(){}).constructor;
   const command=new AsyncFn('msg','mentionsOf','chat','sender','sock',
     'resolvePlayerIdentity','consolidateUserIdentity','battle','reply',
     'formatPvpBattleReport','creditDailyActivity','progressGroupMission',
     'isGroup','setQuickFlow','duration',body);
   const output=[];
   const reply=async(message,options)=>{output.push({message,options});return null};
   const mentioned=()=>[target];
   const identity=async()=>({jid:target,aliases:[]});
   const noop=async()=>{};
   const badFlow=()=>{throw new Error('Unexpected interactive flow')};
   const realIdentity=async(jid,aliases)=>{assert.equal(jid,target);assert.deepEqual(aliases,[])};
   const oldRandom=Math.random;Math.random=random(2399);
   try{
    await command({},mentioned,'synthetic-group@g.us',sender,{},identity,
     realIdentity,battle,reply,formatPvpBattleReport,noop,noop,false,badFlow,
     x=>String(x)+'s');
   }finally{Math.random=oldRandom}
   assert.equal(output.length,1);
   assert.match(output[0].message,/BATALHA DO ALPHA BOT/);
   assert.deepEqual(output[0].options.mentions,[target]);
   const rewards=await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE type='battle_reward' AND to_jid=ANY($1::text[])",[[sender,target]]);
   assert.equal(rewards.rows[0].n,1);
   const affected=await db.query('SELECT win,loss FROM stats WHERE jid=ANY($1::text[])',[[sender,target]]);
   assert.equal(affected.rows.reduce((a,x)=>a+Number(x.win),0),1);
   assert.equal(affected.rows.reduce((a,x)=>a+Number(x.loss),0),1);
   output.length=0;
   await command({},mentioned,'synthetic-group@g.us',sender,{},identity,realIdentity,
    battle,reply,formatPvpBattleReport,noop,noop,false,badFlow,x=>String(x)+'s');
   assert.equal(output.length,1);
   assert.match(output[0].message,/poderá batalhar novamente/);
   assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE type='battle_reward' AND to_jid=ANY($1::text[])",[[sender,target]])).rows[0].n,1);
  });
  await t.test('actual WhatsApp strategy command branch with mocked reply, no socket',async()=>{
   process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='1';
   const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
   const prefix="} else if(cmd==='estrategia'){";
   const start=src.indexOf(prefix);
   const end=src.indexOf("} else if(['batalhar','batalha','battle','duelo'].includes(cmd)){",start);
   assert.ok(start>0&&end>start);
   const body=src.slice(start+prefix.length,end);
   const AsyncFn=Object.getPrototypeOf(async function(){}).constructor;
   const invoke=new AsyncFn('args','sender','reply','configureAutoBattleStrategy','getAutoBattleStrategy',body);
   const a=users.find(x=>x.includes('strategy-a'));
   const sent=[];
   const reply=async message=>{sent.push(message);return null};
   await invoke(['adaptativa'],a,reply,configureAutoBattleStrategy,getAutoBattleStrategy);
   assert.match(sent.at(-1),/POSTURA SALVA/);
   assert.match(sent.at(-1),/adaptativa/);
   await invoke(['status'],a,reply,configureAutoBattleStrategy,getAutoBattleStrategy);
   assert.match(sent.at(-1),/ESTRATÉGIA AUTOMÁTICA/);
   assert.equal((await getAutoBattleStrategy(a)).posture,'adaptativa');
  });
 }finally{
  process.env.ALPHA_PVP_AUTO_STRATEGY_ENABLED='0';
  await db.end();
 }
 });
}
