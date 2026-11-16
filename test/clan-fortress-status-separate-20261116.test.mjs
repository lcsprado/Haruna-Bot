import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
const status=code.slice(code.indexOf('export async function clanSiegeStatus(session){'),code.indexOf('export async function clanSiegeFortressUpgrade(session,stat){'));
const upgrade=code.slice(code.indexOf('export async function clanSiegeFortressUpgrade(session,stat){'),code.indexOf('export async function clanSiegeChallenge(session){'));

test('consulta permanente de fortaleza independente de ON e de grupo',()=>{
  assert.match(status,/const fortress=session\?\.jid\?await clanFortressStatus\(session\.jid\):null;/);
  assert.ok(status.indexOf('const fortress=')<status.indexOf('if(!ON())'));
  assert.match(status,/enabled:false,reason,fortress,fortressUpgradesEnabled:false/);
  assert.match(status,/enabled:false,reason:'Vincule o Web ao grupo AlphaBot pelo !web\.',[\s\S]*fortress,fortressUpgradesEnabled:true/);
  assert.match(status,/fortress,fortressUpgradesEnabled:true/);
});

test('upgrade ainda depende de flag geral e validação transacional do líder, não da participação na partida',()=>{
  assert.match(upgrade,/gate\(\);/);
  assert.match(upgrade,/return clanFortressUpgrade\(session\.jid,stat\);/);
  assert.doesNotMatch(upgrade,/group\(session\)/);
});
