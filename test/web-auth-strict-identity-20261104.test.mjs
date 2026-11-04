import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const login=code.slice(code.indexOf('(async function boot(){'));

test('legacy URL tokens never authenticate a browser',()=>{
  assert.match(login,/if\(tokenFromLink\)\{[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\);[\s\S]*?showLogin\([\s\S]*?return;/);
  assert.doesNotMatch(login,/ui\.token=tokenFromLink/);
});
test('using a !web code clears prior account identity before exchange',()=>{
  assert.match(login,/if\(linked\)\{[\s\S]*?ui\.token='';[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\);[\s\S]*?await exchange\(linked\)/);
});
test('failed !web code cannot silently reopen prior player session',()=>{
  const from=login.indexOf('if(linked){');
  const to=login.indexOf('if(ui.token){',from+10);
  const branch=login.slice(from,to);
  assert.match(branch,/catch\(err\)\{[\s\S]*?ui\.token='';[\s\S]*?showLogin\(/);
  assert.doesNotMatch(branch,/showApp\(/);
  assert.doesNotMatch(branch,/await sync\(true\)/);
});
