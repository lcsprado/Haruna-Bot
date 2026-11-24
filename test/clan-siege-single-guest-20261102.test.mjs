import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isOnlyMissingSiegeMember,siegeBetaGuestAccess,siegeBetaAuthorizedSet,siegeBetaGuestConfigured
} from '../src/neon/clan-siege-beta-access.js';

const teams=[
  {clan_id:'5',jid:'lp'}, {clan_id:'5',jid:'augusto'},
  {clan_id:'7',jid:'joao'}, {clan_id:'7',jid:'kaique'}
];
const db={async query(sql,params){
  assert.match(sql,/SELECT jid,clan_id FROM clan_members/);
  assert.deepEqual(params,[['5','7']]);
  return {rows:teams};
}};
const allowed=new Set(['lp','augusto','kaique']);
function withinGuestEnv(fn){
  const names=['ALPHA_CLAN_SIEGE_BETA_GUEST','ALPHA_CLAN_SIEGE_GROUP_JID','ALPHA_CLAN_SIEGE_CLAN_IDS','ALPHA_WEB_BETA_JIDS'];
  const prev=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  process.env.ALPHA_CLAN_SIEGE_BETA_GUEST='1';
  process.env.ALPHA_CLAN_SIEGE_GROUP_JID='120363429534634131@g.us';
  process.env.ALPHA_CLAN_SIEGE_CLAN_IDS='5,7';
  process.env.ALPHA_WEB_BETA_JIDS='lp,augusto,kaique';
  return Promise.resolve().then(fn).finally(()=>{
    for(const name of names) if(prev[name]===undefined)delete process.env[name];
    else process.env[name]=prev[name];
  });
}
test('beta convidado: somente 1 membro faltante de 2 clãs completos',()=>{
  assert.equal(isOnlyMissingSiegeMember(teams,['5','7'],allowed,'joao'),true);
  assert.equal(isOnlyMissingSiegeMember(teams,['5','7'],allowed,'estranho'),false);
  assert.equal(isOnlyMissingSiegeMember([...teams,teams[0]],['5','7'],allowed,'joao'),false);
  assert.equal(isOnlyMissingSiegeMember(teams,['5','8'],allowed,'joao'),false);
  assert.equal(isOnlyMissingSiegeMember(teams,['5','7'],new Set(['lp']),'joao'),false);
});
test('beta convidado: apenas no grupo oficial e com configuração exata',()=>withinGuestEnv(async()=>{
  assert.equal(siegeBetaGuestConfigured(),true);
  assert.equal(await siegeBetaGuestAccess(db,{jid:'joao',chat:'120363429534634131@g.us'}),true);
  assert.equal(await siegeBetaGuestAccess(db,{jid:'joao',chat:'120363410230588690@g.us'}),false);
  assert.equal(await siegeBetaGuestAccess(db,{jid:'estranho',chat:'120363429534634131@g.us'}),false);
  const auth=await siegeBetaAuthorizedSet(db);
  assert.equal(auth.size,4);
  assert.equal(auth.has('joao'),true);
  process.env.ALPHA_CLAN_SIEGE_BETA_GUEST='0';
  assert.equal(siegeBetaGuestConfigured(),false);
  assert.equal(await siegeBetaGuestAccess(db,{jid:'joao',chat:'120363429534634131@g.us'}),false);
  assert.equal((await siegeBetaAuthorizedSet(db)).size,3);
}));
test('beta convidado: sessão e troca de código verificam JID E grupo',()=>{
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
  assert.match(api,/await betaWebAccess\(row\.jid,row\.chat_jid,client\)/);
  assert.match(api,/await betaWebAccess\(row\.jid,row\.chat_jid\)/);
  assert.match(api,/if\(!chatJid\)return false/);
  const siege=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
  assert.match(siege,/const approved=await siegeBetaAuthorizedSet\(conn\)/);
  assert.match(siege,/t\.jids\.some\(jid=>!approved\.has\(String\(jid\)\)\)/);
});
