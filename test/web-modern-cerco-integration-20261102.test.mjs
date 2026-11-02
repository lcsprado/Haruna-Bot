import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const load=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const app=load('web/app.js'),style=load('web/styles.css'),race=load('web/racing-ui.js'),sw=load('web/sw.js');
const clan=app.split('function renderClan(){')[1]?.split('\nfunction gameStatePanel(')[0]||'';
test('Garagem mantém o visual recente e a interface de pintura',()=>{
 assert.match(app,/renderRacing\(ui\)/);
 assert.match(race,/race-car-photo/);
 assert.match(style,/Pintura e peças ilustradas da Garagem Alpha/);
 assert.match(style,/\.race-car-photo/);
});
test('Arte moderna do Work foi transportada com todos os arquivos reais',()=>{
 for(const name of ['pecados-heroes.webp','pecados-weapons.webp','pecados-armors.webp','event-relics.webp','final-items.webp','final-consumables.webp','raid-bosses-60-70.webp','raid-pets-65-70.webp','classes-warrior-archer.webp','classes-paladin-necromancer.webp']){
  assert.equal(existsSync(new URL('../web/assets/'+name,import.meta.url)),true,name+' ausente');
 }
 assert.match(app,/COLLAB_ITEM_ART_SHEETS/);
 assert.match(app,/RAID_PET_SPRITES/);
 assert.match(app,/COLLAB_PET_SPRITES/);
 assert.match(app,/CLASS_PORTRAITS/);
 assert.doesNotMatch(app,/tv-tokyo\.co\.jp/);
});
test('Menu NPC antigo continua removido na interface moderna',()=>{
 assert.doesNotMatch(app,/\['npcs'/);
 assert.doesNotMatch(app,/renderNpcs\(|data-npc-buy|loadNpcShops\(/);
});
test('Clã administra apenas integrantes próprios, não todos os participantes do grupo',()=>{
 assert.match(clan,/Array\.isArray\(ex\.clanMembers\)/);
 assert.match(clan,/Array\.isArray\(ex\.clanInvitable\)/);
 assert.match(clan,/Membros do meu clã/);
 assert.doesNotMatch(clan,/roster\(\)/);
 assert.match(clan,/data-clan-kick/);
 assert.match(clan,/data-clan-transfer/);
 assert.match(app,/data-clan-invite-selected/);
});
test('Cerco da primeira guerra continua na aba Clã com API real',()=>{
 assert.match(app,/renderClanSiegePreview\(ui\)/);
 assert.match(app,/bindClanSiegePreview\(ui,\{render,submit:submitSiege,refresh:loadSiege\}\)/);
 assert.match(app,/api\('\/api\/v1\/me\/clan-siege'/);
 assert.match(app,/data-clan-invite-selected/);
 assert.ok(existsSync(new URL('../web/clan-siege-ui.js',import.meta.url)));
 assert.match(style,/\.siege-prize\{/);
 assert.match(sw,/\/'clan-siege-ui\.js'|\/clan-siege-ui\.js/);
});
test('Sete Pecados continuam jogáveis, com retratos locais novos',()=>{
 assert.match(app,/function activePlayableHero\(/);
 assert.match(app,/function renderPlayableHeroes\(/);
 assert.match(app,/hero\.select/);
 assert.match(app,/hero\.class/);
 assert.match(app,/return petCroppedSprite\(ch\.id/);
});
