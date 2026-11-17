import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  REBOOT_CLASS_IDS,rebootTableDecision,classifyRebootTables,
  readSelectableClassIds,verifyFourClasses
} from '../scripts/reboot-reset-manifest.mjs';

test('reboot inclui exatamente as 4 classes atuais, sem heróis de collab',()=>{
  assert.deepEqual([...REBOOT_CLASS_IDS],['paladin','necromancer','samurai','berserker']);
  const catalog=readFileSync(new URL('../src/neon/game-catalog.js',import.meta.url),'utf8');
  assert.deepEqual(readSelectableClassIds(catalog),[...REBOOT_CLASS_IDS]);
  assert.equal(verifyFourClasses(catalog).valid,true);
  assert.equal(verifyFourClasses("export const SELECTABLE_PLAYER_CLASS_IDS=Object.freeze(['paladin'])").valid,false);
});

test('autenticação, licenças e direitos jamais entram em reset de gameplay',()=>{
  assert.equal(rebootTableDecision('auth_creds'),'auth_cutover_only');
  assert.equal(rebootTableDecision('auth_keys'),'auth_cutover_only');
  assert.equal(rebootTableDecision('users'),'selective_migration');
  assert.equal(rebootTableDecision('group_licenses'),'selective_migration');
  assert.equal(rebootTableDecision('subscription_orders'),'selective_migration');
  assert.equal(rebootTableDecision('web_sessions'),'selective_migration');
  assert.equal(rebootTableDecision('support_tickets'),'selective_migration');
  assert.equal(rebootTableDecision('transactions'),'manual_review');
  assert.equal(rebootTableDecision('trevo_settings'),'manual_review');
});

test('ativos e progresso iniciam limpos; catálogo de itens é reconstruído',()=>{
  for(const table of ['stats','wallets','user_businesses','user_cars','pet_collection',
    'player_hero_mastery','equipment_star_forges','player_loans','clan_donations',
    'clt_uber_drivers','daily_missions']){
    assert.equal(rebootTableDecision(table),'fresh_gameplay',table);
  }
  assert.equal(rebootTableDecision('items'),'reseed_catalog');
});

test('tabela desconhecida bloqueia migração; jamais inventar comandos SQL',()=>{
  assert.equal(rebootTableDecision('future_new_feature'),'unclassified_blocker');
  assert.throws(()=>rebootTableDecision('wallets; DELETE FROM users'),TypeError);
  const manifest=classifyRebootTables(['auth_creds','wallets','wallets',
    'future_new_feature','trevo_games','items']);
  assert.equal(manifest.total,5);
  assert.equal(manifest.blocked,true);
  assert.deepEqual(manifest.groups.unclassified_blocker,['future_new_feature']);
  assert.deepEqual(manifest.groups.manual_review,['trevo_games']);
  assert.deepEqual(manifest.groups.auth_cutover_only,['auth_creds']);
});

test('classificador é puro: sem acesso a banco, SQL de atualização ou uso de credenciais',()=>{
  const source=readFileSync(new URL('../scripts/reboot-reset-manifest.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:pg|DATABASE_URL|db\.query|client\.query|TRUNCATE TABLE|DELETE FROM|UPDATE users)\b/);
});
