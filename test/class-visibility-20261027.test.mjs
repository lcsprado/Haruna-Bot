import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PLAYER_CLASSES, SELECTABLE_PLAYER_CLASSES, SELECTABLE_PLAYER_CLASS_IDS,
  isSelectablePlayerClass, getPlayerClass, getClassPassive, getAwakeningSkillDescriptions
} from '../src/neon/game-catalog.js';

test('as quatro classes confirmadas seguem disponíveis na ordem esperada',()=>{
  const chosen=['paladin','necromancer','samurai','berserker'];
  assert.deepEqual([...SELECTABLE_PLAYER_CLASS_IDS],chosen);
  assert.deepEqual(SELECTABLE_PLAYER_CLASSES.map(c=>c.id),chosen);
  for(const id of chosen)assert.equal(isSelectablePlayerClass(id),true);
});

test('seis classes ocultas não são excluídas do catálogo nem perdem passivas/despertares',()=>{
  const old=['warrior','assassin','mage','archer','monk','druid'];
  assert.equal(Object.keys(PLAYER_CLASSES).length,10);
  for(const id of old){
    assert.equal(isSelectablePlayerClass(id),false,id);
    assert.equal(getPlayerClass(id).id,id);
    assert.ok(getClassPassive(id),id);
    assert.equal(getAwakeningSkillDescriptions(id).length,5,id);
  }
});

test('WhatsApp e Web usam apenas lista pública filtrada',()=>{
  const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
  const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  assert.match(bot,/const classes=Object.values\(SELECTABLE_PLAYER_CLASSES\)/);
  assert.match(api,/classes:Object.values\(SELECTABLE_PLAYER_CLASSES\)/);
  assert.ok(!bot.includes('const classes=Object.values(PLAYER_CLASSES)'));
  assert.ok(!api.includes('classes:Object.values(PLAYER_CLASSES)'));
  assert.match(web,/CHARACTER_ART\.filter\(ch=>Boolean\(classRule\(ch\.id\)\)\|\|\(applied&&ch\.id===selected\.id\)\)/);
});

test('API de troca bloqueia escolha nova de classe oculta antes de consumir pergaminho',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  const start=db.indexOf('export async function setPlayerClass(');
  const end=db.indexOf('export async function claimCooldown(',start);
  assert.ok(start>=0 && end>start);
  const body=db.slice(start,end);
  const sameClass=body.indexOf('if(applied&&String(st.class_id)===next.id)');
  const blocked=body.indexOf('if(!isSelectablePlayerClass(next.id))');
  const spent=body.indexOf('UPDATE inventories SET quantity=quantity-1');
  assert.ok(sameClass>=0&&blocked>sameClass,'consulta da classe legada atual deve permanecer sem efeito');
  assert.ok(spent>blocked,'não gastar pergaminho em tentativa bloqueada');
  assert.ok(body.includes('checkpointAwakeningAfterClassChange(client,jid)'));
});
