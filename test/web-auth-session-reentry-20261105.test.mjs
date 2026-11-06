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

test('API descarta respostas de token anterior antes de atualizar a conta',()=>{
  const fn=app.slice(app.indexOf('async function api(path, options){'),app.indexOf('async function syncAvatar(force=false){'));
  assert.match(fn,/const requestToken=ui\.token/);
  assert.match(fn,/if\(requestToken && ui\.token!==requestToken\)/);
  assert.match(fn,/if\(res\.status===401 && requestToken\)/);
});
test('foto do perfil não é substituída por resposta atrasada de outro token',()=>{
  const fn=app.slice(app.indexOf('async function syncAvatar(force=false){'),app.indexOf('async function exchange(code){'));
  assert.match(fn,/const requestToken=ui\.token/);
  assert.match(fn,/if\(ui\.token!==requestToken\) return/g);
});
test('troca de conta limpa estado anterior antes de persistir o novo token',()=>{
  const fn=app.slice(app.indexOf('async function exchange(code){'),app.indexOf('async function sync(silent,force=false){'));
  assert.match(fn,/stopRaidAuto\(\)/);
  assert.match(fn,/ui\.token='';[\s\S]*localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(fn,/ui\.petTeamDraft=null; ui\.petTeamPreview=null/);
});
