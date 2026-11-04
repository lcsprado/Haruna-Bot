import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const start=source.indexOf("if(cmd==='web'){");
const end=source.indexOf("const carp=await resolvePlayerCarpinar",start);
const block=source.slice(start,end);
test('group !web credentials are sent only via direct message',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(isGroup\)\{[\s\S]*?await sock\.sendMessage\(sender,\{text:privateMessage\}\)/);
  assert.match(block,/else await reply\(privateMessage\)/);
});
test('failure to resolve or deliver private chat fails closed',()=>{
  assert.match(block,/if\(isGroup && !String\(sender\|\|''\)\.endsWith\('@s\.whatsapp\.net'\)\)/);
  assert.match(block,/catch\(err\)\{[\s\S]*?Nenhum código foi publicado no grupo/);
});
