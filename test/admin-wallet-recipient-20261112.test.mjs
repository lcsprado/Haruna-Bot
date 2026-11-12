import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireVerifiedAdminWalletJid} from '../src/neon/admin-wallet-identity.js';

const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');

test('validates only canonical WhatsApp phone JIDs: raw LIDs are never a wallet target',()=>{
  assert.equal(requireVerifiedAdminWalletJid('5511999999999@s.whatsapp.net'),'5511999999999@s.whatsapp.net');
  for(const jid of ['182080927494206@lid','user@lid','group@g.us','owner','',null,'5511999999999:1@s.whatsapp.net']){
    assert.throws(()=>requireVerifiedAdminWalletJid(jid),/Destinatário sem número de WhatsApp verificado/,String(jid));
  }
});

test('all owner wallet operations validate target before ensuring any user',()=>{
  for(const method of ['ownerAddBalance','ownerRemoveBalance','ownerSetBalance','ownerResetBalance']){
    const start=db.indexOf('export async function '+method+'(');
    assert.ok(start>0,method+' not found');
    const end=db.indexOf('export async function ',start+20);
    const body=db.slice(start,end<0?undefined:end);
    assert.ok(body.includes('jid=requireVerifiedAdminWalletJid(jid)'),method+' does not reject @lid');
    assert.ok(body.indexOf('jid=requireVerifiedAdminWalletJid(jid)')<body.indexOf('await ensureUser(jid)'),method+' creates phantom user before checking');
  }
});

test('admin menus resolve mentions to verified recipient before opening confirmation',()=>{
  assert.match(index,/async function resolveVerifiedAdminTarget\(sock,chat,mention,msg\)/);
  assert.match(index,/await resolvePlayerIdentity\(sock,chat,mention,msg\)/);
  assert.match(index,/await consolidateUserIdentity\(jid,identity.aliases\)/);
  assert.match(index,/async function handleQuickGameFlow\(\{sock,chat,sender/);
  assert.match(index,/await handleQuickGameFlow\(\{sock,chat,sender/);
  assert.match(index,/const target=input==='1'\?sender:mentioned\?await resolveVerifiedAdminTarget\(sock,chat,mentioned,msg\):null/);
  assert.doesNotMatch(index,/const target=input==='1'\?sender:mentioned\s/);
  assert.match(index,/Nenhuma alteração realizada/);
});

test('direct owner commands use verified identities, not raw mention IDs',()=>{
  assert.match(index,/ownerTarget=await resolveVerifiedAdminTarget\(sock,chat,ownerMention,msg\)/);
  assert.match(index,/\['reset','resetsaldo','resetxp','resetinventario','resettotal','set','setsaldo','addsaldo','remsaldo','addexp','setnivel'\]/);
  assert.doesNotMatch(index,/const ownerTarget=mentionsOf\(msg\)\[0\] \|\| sender/);
});

test('credit transaction reports the actual updated wallet and ledger commits together',()=>{
  const start=db.indexOf('export async function ownerAddBalance(');
  const end=db.indexOf('export async function ownerRemoveBalance(',start);
  const body=db.slice(start,end);
  assert.match(body,/RETURNING cash,bank/);
  assert.match(body,/if\(r.rowCount!==1\)throw/);
  assert.match(body,/VALUES\('owner',\$1,\$2,'owner_credit','admin'\)/);
  assert.match(body,/return \{cash:Number\(r.rows\[0\]\.cash\),bank:Number\(r.rows\[0\]\.bank\),jid\}/);
  assert.doesNotMatch(body,/return getProfile\(jid\)/);
  assert.match(index,/CRÉDITO ADMINISTRATIVO CONFIRMADO/);
  assert.match(index,/Destino:.*sua conta.*jogador marcado/);
  assert.match(index,/Carteira após o crédito/);
});
