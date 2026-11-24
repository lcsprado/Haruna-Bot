import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const extras=api.slice(api.indexOf('async function playerExtras(session){'),api.indexOf('async function publicCatalog(){'))
test('clã da sessão possui integrantes reais por clan_id e líder primeiro',()=>{
 assert.match(extras,/const clanMembers=clan\?\(await db\.query\(/)
 assert.match(extras,/FROM clan_members cm LEFT JOIN users u ON u\.jid=cm\.jid/)
 assert.match(extras,/WHERE cm\.clan_id=\$1/)
 assert.match(extras,/CASE WHEN cm\.role='leader' THEN 0 ELSE 1 END/)
 assert.match(extras,/\[clan\.id\]/)
 assert.match(extras,/clanMembers,clanInvitable/)
 assert.match(web,/Array\.isArray\(ex\.clanMembers\)/)
})
test('convites só a candidatos do grupo e apenas para líder sem clã',()=>{
 assert.match(extras,/clan\?\.role==='leader'&&chatJid/)
 assert.match(extras,/weeklyActivityLeaderboard\(chatJid,20\)/)
 assert.match(extras,/SELECT jid FROM clan_members WHERE jid=ANY\(\$1::text\[\]\)/)
 assert.match(extras,/!occupied\.has\(String\(row\.jid\)\)/)
 assert.match(web,/Array\.isArray\(ex\.clanInvitable\)/)
})
test('jamais publicar JID privado sem sanitização e exigir autenticacao',()=>{
 assert.match(api,/data:sanitizePrivateRefs\(data,session\)/)
 assert.match(api,/function memberRef\(scope,jid\)/)
 assert.match(api,/if\(isPrivateJid\(value\) && String\(value\)!==String\(session\?\.jid\|\|''\)\)/)
 assert.match(api,/const member=await groupTarget\(session,body\.targetJid\)/)
})
