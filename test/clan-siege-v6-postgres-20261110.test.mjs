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
 CREATE TABLE IF NOT EXISTS users(jid TEXT PRIMARY KEY,push_name TEXT NOT NULL DEFAULT 'Teste',level INT NOT NULL DEFAULT 1,exp INT NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS clans(id BIGINT PRIMARY KEY,name TEXT NOT NULL,owner_jid TEXT,treasury BIGINT NOT NULL DEFAULT 0,xp BIGINT NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS clan_members(jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member');
 CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,chat_jid TEXT,expires_at BIGINT NOT NULL);
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
