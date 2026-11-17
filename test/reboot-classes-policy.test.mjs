import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  REBOOT_MODE,REBOOT_CLASS_IDS,REBOOT_HERO_MESSAGE,
  classesOnlyRebootEnabled,eligiblePlayableHero,
  assertRebootHeroSelection,raidEnabledInReboot,filterRebootRaidCatalog,
  isRebootCollabItemId,filterRebootStarterItems,assertRebootItemAllowed,
  assertRebootDatabaseTarget,assertRebootWhatsappPermission
} from '../src/neon/reboot-classes-policy.js';

test('modo classes-only exige configuração exata, nunca é ligado acidentalmente',()=>{
  assert.equal(REBOOT_MODE,'classes_only');
  assert.equal(classesOnlyRebootEnabled({}),false);
  assert.equal(classesOnlyRebootEnabled({ALPHA_REBOOT_MODE:'true'}),false);
  assert.equal(classesOnlyRebootEnabled({ALPHA_REBOOT_MODE:'classes_only'}),true);
  assert.deepEqual([...REBOOT_CLASS_IDS],['paladin','necromancer','samurai','berserker']);
});
test('V2 bloqueia conexões com banco de produção e Whatsapp prematuro',()=>{
  const base={ALPHA_REBOOT_MODE:'classes_only',ALPHA_REBOOT_DB_CONFIRMED:'isolated-v2'};
  assert.deepEqual(assertRebootDatabaseTarget({DATABASE_URL:'postgres://u:p@aiven/alpha_prod_v2'}),
    {reboot:false});
  assert.throws(()=>assertRebootDatabaseTarget({...base,DATABASE_URL:'postgres://u:p@aiven/alpha_prod_v2'}),
    /alpha_reboot/);
  assert.throws(()=>assertRebootDatabaseTarget({...base,DATABASE_URL:'postgres://u:p@aiven/defaultdb'}),
    /alpha_reboot/);
  assert.throws(()=>assertRebootDatabaseTarget({ALPHA_REBOOT_MODE:'classes_only',
    DATABASE_URL:'postgres://u:p@aiven/alpha_reboot_nova_era'}),/falta confirmação/);
  assert.throws(()=>assertRebootDatabaseTarget({...base,DATABASE_URL:'not-a-url'}),/inválido/);
  assert.equal(assertRebootDatabaseTarget({...base,
    DATABASE_URL:'postgres://u:p@aiven/alpha_reboot_nova_era'}).databaseName,'alpha_reboot_nova_era');
  assert.equal(assertRebootWhatsappPermission({}),true);
  assert.throws(()=>assertRebootWhatsappPermission({ALPHA_REBOOT_MODE:'classes_only'}),/WhatsApp real proibido/);
  assert.equal(assertRebootWhatsappPermission({ALPHA_REBOOT_MODE:'classes_only',
    ALPHA_REBOOT_ALLOW_WHATSAPP:'cutover-approved'}),true);
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
test('catálogo inicial exclui somente materiais e equipamentos exclusivos da collab',()=>{
  const items=[
    ['espada_eclipse','Espada do Eclipse'],
    ['pecados_courechouse','Arma de Ban'],
    ['pecados_gideon','Arma de Diane'],
    ['chave_raid_75','Chave da collab'],
    ['insignia_sete_pecados','Relíquia exclusiva'],
    ['titulo_conquistador_pecados','Título exclusivo'],
    ['essencia_pecado_ira','Essência exclusiva'],
    ['fragmento_ascensao_pecados_20261024','Material da collab'],
    ['chave_raid_70','Chave Raid normal'],
    ['excalibur','Arma lendária original'],
    ['armadura_eclipse','Armadura épica original']
  ];
  assert.deepEqual(filterRebootStarterItems(items,{enabled:true}).map(x=>x[0]),
    ['espada_eclipse','chave_raid_70','excalibur','armadura_eclipse']);
  assert.deepEqual(filterRebootStarterItems(items,{enabled:false}),items);
  assert.equal(isRebootCollabItemId('pecado_ban'),true);
  assert.equal(isRebootCollabItemId('escudo_eternidade'),false);
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.match(db,/for \(const item of filterRebootStarterItems\(starterItems\)\)/);
});

test('A V2 impede geração, forja, uso e bônus de equipamentos da collab',()=>{
  for(const id of ['pecados_courechouse','pecados_gideon','pecado_ban',
    'chave_raid_75','fragmento_ascensao_pecados_20261024',
    'insignia_sete_pecados','essencia_pecado_ira']){
    assert.throws(()=>assertRebootItemAllowed(id,{enabled:true}),/indisponível/);
    assert.equal(assertRebootItemAllowed(id,{enabled:false}),true);
  }
  for(const id of ['excalibur','armadura_divina','espada_eclipse','chave_raid_70']){
    assert.equal(assertRebootItemAllowed(id,{enabled:true}),true);
  }
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  for(const signature of [
    'buyItem(jid, itemId, qty=1)',
    'forgeEquipmentStar(jid,itemId,expectedStars=null)',
    "upgradeEquipment(jid,itemId,targetLevel=null,sourceLevel=null,sourceKind='normal',payment='cash')",
    'equipItem(jid, itemId)',
    'ownerGrantItem(jid, itemId, qty=1)'
  ])assert.ok(db.includes(signature),'API preservada: '+signature);
  assert.match(db,/export async function equipItem\(jid, itemId\) \{\s*assertRebootItemAllowed\(itemId\)/);
  assert.match(db,/export async function forgeEquipmentStar\(jid,itemId,expectedStars=null\)\{\s*assertRebootItemAllowed\(itemId\)/);
  assert.match(db,/export function equipmentStatsAtLevel\(itemId,level=1,stars=1\)\{\s*if\(classesOnlyRebootEnabled\(\)&&isRebootCollabItemId\(itemId\)\)return null/);
  assert.match(db,/export async function getInventory\(jid\)[\s\S]*?return rows\.filter\(r=>!classesOnlyRebootEnabled\(\)\|\|!isRebootCollabItemId\(r\.item_id\)\)/);
});
test('Eventos dos Pecados não retomam cron, mensagens ou boss antigos na V2',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.match(games,/tickCollabFragmentFarm\(now=Date\.now\(\)\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return \{due:false,disabled:true\}/);
  assert.match(games,/tickSetePecados\(now=Date\.now\(\)\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return \{due:false,disabled:true\}/);
  assert.match(wa,/async function recoverPecadosParticipantsStoppedByOldPhase\(\)\{\s*if\(classesOnlyRebootEnabled\(\)\)return/);
  assert.match(wa,/const setePecadosCorrectionTimer=classesOnlyRebootEnabled\(\)\?null:setInterval/);
  assert.match(wa,/setePecadosCorrectionTimer\?\.unref\?\.\(\)/);
  assert.match(wa,/if\(!classesOnlyRebootEnabled\(\)&&Date\.now\(\)<=PECADOS_EDITIONS/);
});

test('XP de classes, perfil e Boss ignoram heróis antigos preservados em banco ou sessão',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(db,/WHERE p\.jid=\$1 AND \(\$2::boolean OR NOT EXISTS/);
  assert.match(db,/FOR UPDATE OF p`,\[jid,classesOnlyRebootEnabled\(\)\]/);
  assert.match(db,/const activeHeroMode=classesOnlyRebootEnabled\(\)\?\{rows:\[\]\}:await db\.query/);
  assert.match(games,/const heroId=eligiblePlayableHero\(Object\.hasOwn\(existingParticipant,'heroId'\)/);
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
  assert.match(contents['db.js'],/const collab=!classesOnlyRebootEnabled\(\)\&\&!vital/);
  assert.match(contents['index.js'],/classesOnlyRebootEnabled\(\)&&\['7pecados','setepecados','pecados7'\]/);
  assert.match(contents['game-catalog.js'],/classesOnlyRebootEnabled\(\)\?\[\]:PECADOS_HEROES/);
});
