import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const boot=app.slice(app.indexOf('(async function boot(){'));
const sync=app.slice(app.indexOf('async function sync(silent,force=false){'),app.indexOf('// Lightweight HP/status delta'));

test('a one-time !web URL is cleared before an exchange request can be retried by PWA reload',()=>{
  const begin=boot.indexOf('if(linked){');
  assert.ok(begin>=0);
  const branch=boot.slice(begin,boot.indexOf('if(ui.token){',begin));
  assert.ok(branch.indexOf("history.replaceState({},document.title,'/rpg')") < branch.indexOf('await exchange(linked)'));
  assert.match(branch,/ui\.token='';[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\)/);
});
test('previous account bootstrap cannot overwrite the identity of a newly linked player',()=>{
  assert.match(app,/syncingToken: ''/);
  assert.match(sync,/const activeToken=ui\.token/);
  assert.match(sync,/ui\.syncing && ui\.syncingToken===activeToken/);
  assert.match(sync,/const values=await Promise\.all\(jobs\);\s*if\(ui\.token!==activeToken\) return/);
  assert.match(sync,/catch\(err\)\{\s*if\(ui\.token!==activeToken\) return/);
  assert.match(sync,/finally\{[\s\S]*?if\(ui\.syncingToken===activeToken\)/);
});
test('legacy URL bearer tokens remain rejected; failed links cannot reuse an older account',()=>{
  assert.match(boot,/if\(tokenFromLink\)\{[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(boot,/if\(linked\)\{[\s\S]*?catch\(err\)\{[\s\S]*?showLogin\(err\.message/);
  assert.doesNotMatch(boot,/ui\.token=tokenFromLink/);
});
