import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import pg from 'pg'

const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const open=source.match(/^const raidIsOpen=.*$/m)?.[0]
const fn=source.match(/^async function resolveGlobalPlayerRaid\(c,jid\)\{[\s\S]*?^\}/m)?.[0]
assert.ok(open && fn)
const resolveGlobalPlayerRaid=new Function(open+'\n'+fn+'\nreturn resolveGlobalPlayerRaid')()

test('global raid lookup preserves membership and does not lock unrelated rows',{skip:!process.env.ALPHA_RAID_SCOPE_TEST_URL},async()=>{
  const url=process.env.ALPHA_RAID_SCOPE_TEST_URL
  assert.ok(url && new URL(url).hostname==='127.0.0.1' && new URL(url).pathname==='/raid_scope_ci','disposable local DB required')
  const pool=new pg.Pool({connectionString:url})
  const a=await pool.connect(), b=await pool.connect()
  try {
    await a.query('CREATE TABLE trevo_games(chat_jid text,game_type text,state jsonb,updated_at bigint,PRIMARY KEY(chat_jid,game_type))')
    const now=Date.now()
    for(const [chat,type,state,updated] of [
      ['mine','raid:30',{status:'active',players:{alice:{name:'Alice'}}},now],
      ['other','raid:30',{status:'active',players:{bob:{name:'Bob'}}},now+1],
      ['old','raid:25',{status:'finished',players:{alice:{}}},now+2],
      ['expired','raid:40',{status:'lobby',expiresAt:now-10000,players:{alice:{}}},now+3],
      ['legacy','raid',{status:'lobby',expiresAt:now+600000,players:{carol:{}}},now],
      ['not-raid','boss',{status:'active',players:{alice:{}}},now+4]
    ]) await a.query('INSERT INTO trevo_games VALUES($1,$2,$3,$4)',[chat,type,JSON.stringify(state),updated])
    await a.query('BEGIN')
    assert.equal((await resolveGlobalPlayerRaid(a,'alice')).chatJid,'mine')
    await b.query('BEGIN')
    await b.query("SET LOCAL lock_timeout='300ms'")
    await b.query("SELECT 1 FROM trevo_games WHERE chat_jid IN ('other','old','not-raid') FOR UPDATE")
    await assert.rejects(b.query("SELECT 1 FROM trevo_games WHERE chat_jid='mine' FOR UPDATE"),e=>e.code==='55P03')
    await b.query('ROLLBACK')
    await a.query('ROLLBACK')
    assert.equal((await resolveGlobalPlayerRaid(a,'carol')).chatJid,'legacy')
    assert.equal(await resolveGlobalPlayerRaid(a,'missing'),null)
  } finally {
    await a.query('ROLLBACK').catch(()=>{})
    await b.query('ROLLBACK').catch(()=>{})
    a.release();b.release();await pool.end()
  }
})
