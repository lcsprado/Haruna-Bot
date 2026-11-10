import test,{after} from 'node:test'
import assert from 'node:assert/strict'

const url='postgresql://postgres:postgres@127.0.0.1:5432/alpha_siege_test'
if(process.env.DATABASE_URL!==url)throw new Error('Cerco V6: PostgreSQL descartável obrigatório; conexão externa proibida.')
process.env.ALPHA_CLAN_SIEGE_ENABLED='1'
process.env.ALPHA_SIEGE_V6_ROSTER_ENABLED='1'
process.env.ALPHA_CLAN_SIEGE_GROUP_JID='123456789123@g.us'
process.env.ALPHA_WEB_BETA_JIDS=''
const {db}=await import('../src/neon/db.js')
const {ensureClanSiegeSchema,startDailyClanSiege,clanSiegeStatus,clanSiegeMove,settleClanSiege}=await import('../src/neon/clan-siege.js')
const {siegeV6ActivePlayers}=await import('../src/neon/clan-siege-v6-roster.js')
const GROUP=process.env.ALPHA_CLAN_SIEGE_GROUP_JID
const opening=Date.parse('2026-11-14T21:30:05-03:00')
after(async()=>{await db.end()})

async function schema(){
 await db.query(`
 CREATE TABLE IF NOT EXISTS users(jid TEXT PRIMARY KEY,push_name TEXT NOT NULL DEFAULT 'Teste',level INT NOT NULL DEFAULT 1,exp INT NOT NULL DEFAULT 0,updated_at BIGINT NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS clans(id BIGINT PRIMARY KEY,name TEXT NOT NULL,owner_jid TEXT,treasury BIGINT NOT NULL DEFAULT 0,xp BIGINT NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS clan_members(jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member');
 CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,chat_jid TEXT,expires_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS stats(
  jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
  max_hp INT NOT NULL DEFAULT 100,hp INT NOT NULL DEFAULT 100,
  atk INT NOT NULL DEFAULT 10,def INT NOT NULL DEFAULT 10,spd INT NOT NULL DEFAULT 10,
  weapon_id TEXT,armor_id TEXT,helmet_id TEXT,updated_at BIGINT NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS equipment_upgrades(jid TEXT,item_id TEXT,level INT);
 CREATE TABLE IF NOT EXISTS equipment_star_forges(jid TEXT,item_id TEXT,level INT,stars INT);
 CREATE TABLE IF NOT EXISTS items(
   id TEXT PRIMARY KEY,name TEXT,description TEXT,category TEXT,
   price BIGINT NOT NULL DEFAULT 0,rarity TEXT,sellable BOOLEAN NOT NULL DEFAULT false,
   stackable BOOLEAN NOT NULL DEFAULT true
 );
 CREATE TABLE IF NOT EXISTS inventories(
   jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
   item_id TEXT NOT NULL REFERENCES items(id),quantity INT NOT NULL DEFAULT 0,
   PRIMARY KEY(jid,item_id)
 );
 CREATE TABLE IF NOT EXISTS bound_inventory_items(
   jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
   item_id TEXT NOT NULL REFERENCES items(id),
   source_key TEXT NOT NULL,quantity INT NOT NULL DEFAULT 1,
   PRIMARY KEY(jid,item_id,source_key)
 );

 `)
 await ensureClanSiegeSchema()
}
async function reset(){
 await db.query(`TRUNCATE TABLE alpha_siege_matches,alpha_siege_roster,alpha_siege_moves,
 alpha_siege_weekly_xp,alpha_web_action_outbox,alpha_clan_fortresses,
 clan_members,web_sessions,clans,users RESTART IDENTITY CASCADE`)
}
async function seed(blueCount,redCount){
 await db.query("INSERT INTO clans(id,name) VALUES(10,'Alpha'),(20,'Rivais')")
 const teams={blue:[],red:[]}
 for(const [color,clanId,count] of [['blue',10,blueCount],['red',20,redCount]]){
  for(let i=0;i<count;i++){
   const jid=color+'-'+i+'@s.whatsapp.net'
   teams[color].push(jid)
   await db.query('INSERT INTO users(jid) VALUES($1)',[jid])
   await db.query('INSERT INTO clan_members(jid,clan_id) VALUES($1,$2)',[jid,clanId])
   await db.query('INSERT INTO web_sessions(token_hash,jid,chat_jid,expires_at) VALUES($1,$2,$3,$4)',
    [color+'-'+i,jid,GROUP,opening+86400000])
  }
 }
 return teams
}
test('AB-07: PostgreSQL descartável aceita 2x6, 3x5, 6x6, rodízio, disputa e idempotência',async()=>{
 const originalNow=Date.now
 try{
  await schema()
  for(const [blueCount,redCount] of [[2,6],[3,5],[6,6]]){
   await reset()
   const teams=await seed(blueCount,redCount)
   let tick=opening
   Date.now=()=>tick
   const first=await startDailyClanSiege(tick)
   assert.equal(first.started,true,JSON.stringify({blueCount,redCount,first}))
   const repeat=await startDailyClanSiege(tick)
   assert.equal(repeat.started,false,'início idempotente')
   const rows=(await db.query('SELECT status,rules_version,round FROM alpha_siege_matches')).rows
   assert.equal(rows.length,1)
   assert.equal(Number(rows[0].rules_version),6)
   assert.equal(rows[0].status,'active')
   const opened=(await db.query("SELECT payload->>'text' AS notice FROM alpha_web_action_outbox WHERE kind='message' ORDER BY id ASC LIMIT 1")).rows[0]?.notice||''
   assert.match(opened,/CERCO V6:/,'V6 anunciado corretamente no grupo')
   assert.doesNotMatch(opened,/CERCO V5:/,'não anunciar regras V5 após criar V6')
   assert.match(opened,/150\.000 para vencedores/,'XP declarado somente no novo V6')
   const roster=(await db.query('SELECT jid,clan_id FROM alpha_siege_roster ORDER BY jid')).rows
   assert.equal(roster.length,blueCount+redCount)
   const blueTurn=siegeV6ActivePlayers(teams.blue,1)
   const redTurn=siegeV6ActivePlayers(teams.red,1)
   const reserve=teams.red.find(jid=>!redTurn.includes(jid))
   const view=await clanSiegeStatus({jid:reserve,chatJid:GROUP})
   assert.equal(view.match.rulesVersion,6)
   assert.equal(view.nextRulesVersion,6,'a prévia da PWA precisa refletir a regra da próxima guerra')
   assert.equal(view.match.myTurn,false)
   assert.ok(view.match.nextTurns.length>=2,'todos recebem pelo menos 2 turnos')
   await assert.rejects(
    clanSiegeMove({jid:reserve,chatJid:GROUP},'attack','castle'),
    /Sua vez ainda não chegou/
   )
   const participating=[...blueTurn,...redTurn]
   const results=await Promise.all(participating.map(jid=>
    clanSiegeMove({jid,chatJid:GROUP},'attack','castle')))
   assert.equal(results.filter(x=>x.registered).length,4)
   await assert.rejects(
    clanSiegeMove({jid:participating[0],chatJid:GROUP},'attack','castle'),
    /Ação já registrada/
   )
   const firstRoundMoves=(await db.query('SELECT jid FROM alpha_siege_moves WHERE round=1')).rows
   assert.equal(firstRoundMoves.length,4,'duas vagas exclusivas por clã')
   tick+=300001
   await settleClanSiege(GROUP)
   const next=(await db.query('SELECT status,round,history FROM alpha_siege_matches')).rows[0]
   assert.equal(next.status,'active')
   assert.equal(Number(next.round),2)
   assert.equal(next.history.length,1)
   for(let round=2;round<=6;round++){
    tick+=300001
    await settleClanSiege(GROUP)
   }
   const done=(await db.query('SELECT status,round,history FROM alpha_siege_matches')).rows[0]
   assert.equal(done.status,'completed')
   assert.equal(done.history.length,6)
   assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM alpha_siege_weekly_xp')).rows[0].n),0,'sem XP para quem atuou somente uma rodada')
   const actions=(await db.query('SELECT count(*)::int AS n FROM alpha_siege_moves')).rows[0].n
   await settleClanSiege(GROUP)
   assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM alpha_siege_moves')).rows[0].n),Number(actions),'settlement idempotente')
   const outbox=(await db.query('SELECT count(*)::int AS n FROM alpha_web_action_outbox')).rows[0].n
   assert.equal(Number(outbox),7,'1 aviso de abertura + 6 avisos de rodada, sem envio externo')
  }
 }finally{Date.now=originalNow}
})

test('AB-07: PostgreSQL real credita XP por 2 turnos e não duplica pagamento em novas leituras ou concorrência',async()=>{
 const originalNow=Date.now
 try{
  await schema()
  await reset()
  const teams=await seed(6,6)
  await db.query('UPDATE users SET level=500,exp=0')
  const t0=opening
  let tick=t0
  Date.now=()=>tick
  const opened=await startDailyClanSiege(t0)
  assert.equal(opened.started,true)
  const bad=await Promise.all([startDailyClanSiege(t0),startDailyClanSiege(t0)])
  assert.equal(bad.filter(x=>x.started).length,0,'abertura concorrente nunca duplica partida')
  for(let round=1;round<=6;round++){
   const active=[...siegeV6ActivePlayers(teams.blue,round),...siegeV6ActivePlayers(teams.red,round)]
   const sent=await Promise.all(active.map(jid=>clanSiegeMove(
    {jid,chatJid:GROUP},jid.startsWith('blue')?(round===6?'attack':'supply'):'spy',
    jid.startsWith('blue')?(round===6?'castle':'depot'):'castle'
   )))
   assert.equal(sent.filter(x=>x.registered).length,4)
   tick+=300001
   await Promise.all([settleClanSiege(GROUP),settleClanSiege(GROUP)])
  }
  const match=(await db.query('SELECT id,status,round,history,winner_clan_id,blue_clan_id,red_clan_id FROM alpha_siege_matches')).rows[0]
  assert.equal(match.status,'completed')
  assert.equal(match.history.length,6)
  assert.notEqual(match.winner_clan_id,null,'última rodada cria vencedor para testar escudo exclusivo')
  const shieldClaims=(await db.query('SELECT jid,match_id,item_id FROM alpha_siege_shield_rewards_20261114 ORDER BY jid')).rows
  assert.equal(shieldClaims.length,6,'cada um dos seis campeões V6 recebe um Bastião')
  assert.ok(shieldClaims.every(x=>x.item_id==='bastiao_eclipse'&&String(x.match_id)===String(match.id)))
  const shieldItems=(await db.query("SELECT jid,quantity FROM inventories WHERE item_id='bastiao_eclipse'")).rows
  const shieldBound=(await db.query("SELECT jid,source_key,quantity FROM bound_inventory_items WHERE item_id='bastiao_eclipse'")).rows
  assert.equal(shieldItems.length,6)
  assert.ok(shieldItems.every(x=>Number(x.quantity)===1))
  assert.equal(shieldBound.length,6)
  assert.ok(shieldBound.every(x=>x.source_key.includes('v6:20261114')))
  const actions=(await db.query('SELECT jid,COUNT(DISTINCT round)::int AS n FROM alpha_siege_moves GROUP BY jid')).rows
  assert.equal(actions.length,12)
  assert.ok(actions.every(x=>x.n===2),'cada um dos 12 jogadores atua duas vezes')
  const awards=(await db.query('SELECT jid,xp FROM alpha_siege_weekly_xp ORDER BY jid')).rows
  assert.equal(awards.length,12,'todos os participantes elegíveis recebem apenas uma linha')
  for(const award of awards){
   const side=award.jid.startsWith('blue')?'blue':'red'
   const winner=match.winner_clan_id===null?null:String(match.winner_clan_id)
   const expected=winner===null?100000:winner===String(side==='blue'?match.blue_clan_id:match.red_clan_id)?150000:70000
   assert.equal(Number(award.xp),expected)
  }
  const people=(await db.query('SELECT jid,level,exp FROM users ORDER BY jid')).rows
  assert.equal(people.length,12)
  for(const person of people){
   const xp=Number(awards.find(x=>x.jid===person.jid).xp)
   const after500=xp-50000
   const expected=after500>=50100?{level:502,exp:after500-50100}:{level:501,exp:after500}
   assert.deepEqual({level:Number(person.level),exp:Number(person.exp)},expected)
  }
  const outboxBefore=Number((await db.query('SELECT COUNT(*)::int AS n FROM alpha_web_action_outbox')).rows[0].n)
  await Promise.all([settleClanSiege(GROUP),settleClanSiege(GROUP)])
  const post=(await db.query('SELECT COUNT(*)::int AS n FROM alpha_siege_weekly_xp')).rows[0]
  assert.equal(Number(post.n),12,'encerramento repetido não paga XP novamente')
  assert.equal(Number((await db.query('SELECT COUNT(*)::int AS n FROM alpha_siege_shield_rewards_20261114')).rows[0].n),6,
    'encerramento concorrente não entrega um segundo Bastião')
  const outboxAfter=Number((await db.query('SELECT COUNT(*)::int AS n FROM alpha_web_action_outbox')).rows[0].n)
  assert.equal(outboxBefore,outboxAfter,'resultado não é publicado duas vezes')
  assert.equal(outboxAfter,7,'somente aviso inicial + seis rodadas')
 }finally{Date.now=originalNow}
})
