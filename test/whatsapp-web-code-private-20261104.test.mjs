import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
const start=source.indexOf("if(cmd==='web'){");
const end=source.indexOf("const carp=await resolvePlayerCarpinar",start);
const block=source.slice(start,end);
const privateFlow=block.slice(block.indexOf('const linkedGroup='));

test('group !web never sends an unsolicited encrypted code or URL',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(isGroup\)\{[\s\S]*?prepareWebGroupLink\(sender,chat\)/);
  assert.doesNotMatch(block,/sock\.sendMessage\(sender,\{text:privateMessage\}\)/);
  assert.doesNotMatch(block,/sock\.sendMessage\(chat,\{text:privateMessage\}\)/);
  assert.match(block,/Nenhum código ou link de acesso será mostrado no grupo/);
});

test('private !web responds to the inbound chat and retains group context',()=>{
  assert.match(privateFlow,/consumePendingWebGroupLink\(sender\)/);
  assert.match(privateFlow,/createWebLinkCode\(sender,linkedGroup\)/);
  assert.match(privateFlow,/await reply\(privateMessage\)/);
  assert.doesNotMatch(privateFlow,/sock\.sendMessage\(sender/);
  assert.match(privateFlow,/const groupLine=link\.chatJid/);
});

test('unknown group sender fails closed, never reveals a token in group',()=>{
  assert.match(block,/if\(!String\(sender\|\|''\)\.endsWith\('@s\.whatsapp\.net'\)\)/);
  assert.match(block,/Nenhum código foi publicado no grupo/);
});

test('pending group binding is scoped by verified phone identity and expires',()=>{
  assert.match(api,/PENDING_WEB_GROUP_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(api,/CREATE TABLE IF NOT EXISTS web_pending_group_links/);
  assert.match(api,/jid TEXT PRIMARY KEY/);
  assert.match(api,/WHERE jid=\$1 AND expires_at>\$2 RETURNING chat_jid/);
  assert.match(api,/if\(!player\.endsWith\('@s\.whatsapp\.net'\)/);
});
