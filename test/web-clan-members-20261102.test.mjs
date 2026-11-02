import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
const section=src.split('async function playerExtras(session)')[1]?.split('async function publicCatalog()')[0]||'';
test('Clã: membro administrativo deve pertencer ao clã autenticado',()=>{
  assert.match(section,/FROM clan_members cm LEFT JOIN users u ON u\.jid=cm\.jid/);
  assert.match(section,/WHERE cm\.clan_id=\$1/);
  assert.match(section,/\[clan\.id\]/);
  assert.match(section,/clanMembers/);
});
test('Clã: convites mostram apenas jogadores sem nenhum clã',()=>{
  assert.match(section,/clan\?\.role==='leader'/);
  assert.match(section,/weeklyActivityLeaderboard\(chatJid,20\)/);
  assert.match(section,/SELECT jid FROM clan_members WHERE jid=ANY/);
  assert.match(section,/recent\.filter\(r=>!occupied\.has\(r\.jid\)\)/);
  assert.match(section,/clanInvitable/);
});
