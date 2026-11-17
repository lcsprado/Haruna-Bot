import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  REBOOT_MODE,REBOOT_CLASS_IDS,REBOOT_HERO_MESSAGE,
  classesOnlyRebootEnabled,eligiblePlayableHero,
  assertRebootHeroSelection,raidEnabledInReboot,filterRebootRaidCatalog
} from '../src/neon/reboot-classes-policy.js';

test('modo classes-only exige configuração exata, nunca é ligado acidentalmente',()=>{
  assert.equal(REBOOT_MODE,'classes_only');
  assert.equal(classesOnlyRebootEnabled({}),false);
  assert.equal(classesOnlyRebootEnabled({ALPHA_REBOOT_MODE:'true'}),false);
  assert.equal(classesOnlyRebootEnabled({ALPHA_REBOOT_MODE:'classes_only'}),true);
  assert.deepEqual([...REBOOT_CLASS_IDS],['paladin','necromancer','samurai','berserker']);
});
test('nenhum herói da collab pode ocupar o combatente na V2',()=>{
  assert.equal(eligiblePlayableHero('pecado_ban',{enabled:true}),null);
  assert.equal(eligiblePlayableHero('pecado_meliodas',{enabled:true}),null);
  assert.equal(eligiblePlayableHero('pecado_ban',{enabled:false}),'pecado_ban');
  assert.throws(()=>assertRebootHeroSelection('pecado_ban',{enabled:true}),/classes/);
  assert.equal(assertRebootHeroSelection('pecado_ban',{enabled:false}),true);
  assert.equal(assertRebootHeroSelection(null,{enabled:true}),true);
  assert.equal(assertRebootHeroSelection('class',{enabled:true}),true);
  assert.ok(REBOOT_HERO_MESSAGE.includes('Paladino'));
});
test('Raid 75 ou qualquer Raid marcada como collab é excluída apenas na V2',()=>{
  const raids=[{level:10,name:'Guardião de Pedra'},{level:70,name:'Deus do Eclipse'},
    {level:75,name:'7 Pecados',collab:true},{level:80,name:'Collab desconhecida',collab:true}];
  assert.deepEqual(filterRebootRaidCatalog(raids,{enabled:true}).map(r=>r.level),[10,70]);
  assert.deepEqual(filterRebootRaidCatalog(raids,{enabled:false}).map(r=>r.level),[10,70,75,80]);
  assert.equal(raidEnabledInReboot({level:75},{enabled:true}),false);
  assert.equal(raidEnabledInReboot({level:75},{enabled:false}),true);
  assert.equal(raidEnabledInReboot(null,{enabled:true}),false);
});
test('fluxos de combate e entrada de herói estão protegidos no modo V2',()=>{
  const contents=Object.fromEntries([
    'playable-heroes.js','games.js','db.js','index.js','game-catalog.js'
  ].map(name=>[name,readFileSync(new URL('../src/neon/'+name,import.meta.url),'utf8')]));
  assert.match(contents['playable-heroes.js'],/getActivePlayableHero\(client,jid\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return null/);
  assert.match(contents['playable-heroes.js'],/listPlayableHeroes\(jid\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return \[\]/);
  assert.match(contents['playable-heroes.js'],/setPlayableHeroMode\(jid,heroId=null\)\{\s*assertRebootHeroSelection\(heroId\)/);
  assert.match(contents['playable-heroes.js'],/awardPlayableHeroMastery\(client,[\s\S]{0,130}if\(classesOnlyRebootEnabled\(\)\)return false/);
  assert.match(contents['games.js'],/const raidConfig=level=>RAID_CONFIGS\.find\(r=>r\.level===Number\(level\)&&raidEnabledInReboot\(r\)\)/);
  assert.match(contents['games.js'],/getRaidCatalog\(\)\{ return filterRebootRaidCatalog\(RAID_CONFIGS\)/);
  assert.match(contents['db.js'],/const heroModes=classesOnlyRebootEnabled\(\)\?\[\]:\(await client\.query/);
  assert.match(contents['index.js'],/classesOnlyRebootEnabled\(\)&&\['7pecados','setepecados','pecados7'\]/);
  assert.match(contents['game-catalog.js'],/classesOnlyRebootEnabled\(\)\?\[\]:PECADOS_HEROES/);
});
