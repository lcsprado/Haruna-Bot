import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const exists=p=>existsSync(join(root,p));
const sheets=[
  'classes-druid-samurai.webp','classes-paladin-necromancer.webp',
  'classes-warrior-archer.webp','event-gear.webp','event-pets.webp',
  'event-relics.webp','final-collection-pets.webp','final-consumables.webp',
  'final-items.webp','pecados-armors.webp','pecados-heroes.webp',
  'pecados-weapons.webp','raid-armors.webp','raid-bosses-60-70.webp',
  'raid-keys.webp','raid-pets-10-30.webp','raid-pets-30-65.webp',
  'raid-pets-65-70.webp','raid-weapons.webp'
];
const parts=['motor','cambio','pneus','suspensao','freios','turbo'];
const models=['gol','uno','corsa','palio'];
const paint=['prata','branco','preto','cinza','vermelho','azul','verde',
  'amarelo','laranja','roxo','rosa','dourado'];

test('all 19 original hero, Raid, inventory and event sheets remain deployed',()=>{
  for(const asset of sheets)
    assert.ok(exists('web/assets/'+asset),'Lost essential art sheet: '+asset);
  for(const source of ['web/app.js','web/styles.css','web/racing-ui.js','web/sw.js','web/index.html']){
    const text=read(source);
    for(const m of text.matchAll(/\/assets\/[\w./-]+\.(?:webp|jpe?g|png|svg)/g)){
      const src=m[0].slice(1);
      assert.ok(exists('web/'+src),'Broken static asset from '+source+': '+m[0]);
    }
  }
});

test('garage includes complete race photos, 6 upgrade SVGs and 8 original overlays',()=>{
  for(const part of parts)assert.ok(exists('web/assets/racing/'+part+'.svg'),'Missing race upgrade icon '+part);
  for(const model of models){
    assert.ok(exists('web/assets/racing/'+model+'.webp'),'Missing source car photo '+model);
    assert.ok(exists('web/assets/racing/'+model+'-mask.webp'),'Missing paint mask '+model);
    for(const color of paint)assert.ok(exists('web/assets/racing/'+model+'-'+color+'.webp'),'Missing car photo '+model+'-'+color);
  }
  assert.equal(readdirSync(join(root,'web/assets/racing')).length,62,
    'Garage asset set unexpectedly lost files');
});

test('pets preserve original and updated portrait variants',()=>{
  for(const name of ['fenix-celestial-v2.webp','grifo-celestial-v2.webp'])
    assert.ok(exists('web/assets/pets/'+name),'Missing updated pet portrait '+name);
  assert.ok(exists('web/assets/pecados-heroes.webp'),'Ban hero portrait must exist');
});

test('PWA and Web update together without removing rich game modules or login',()=>{
  const app=read('web/app.js'),sw=read('web/sw.js'),html=read('web/index.html');
  const version=JSON.parse(read('web/version.json'));
  assert.equal(version.assetVersion,'alpha-rich-phone-20261114-v6');
  assert.match(app,/WEB_ASSET_ID='alpha-rich-phone-20261114-v6'/);
  assert.match(sw,/alpha-rpg-pwa-20261114-restore-all-art-v6/);
  assert.match(html,/app\.js\?v=20261114-art-v6/);
  for(const keep of ["['racing','🏎️','Garagem Alpha']","['npcs','🏘️','NPCs / Comerciantes']",
    "['character','🧙','Personagem']","['pets','🐾','Pets']",
    'racing:()=>renderRacing(ui)','npcs:renderNpcs'])
    assert.ok(app.includes(keep),'RPG module regressed: '+keep);
});
