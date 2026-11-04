import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');

const start=app.indexOf('function duelClassPortrait(ch){');
const end=app.indexOf('\nfunction renderDuelArena(members){',start);
assert.ok(start>0 && end>start,'helpers de retrato de duelo encontrados');

const ctx={
  CLASS_ART_SHEETS:['warrior.webp','paladin.webp','samurai.webp'],
  CLASS_PORTRAITS:{
    'char-paladin':[1,0,0,512,768],
    'char-berserker':[1,512,0,512,768],
    'char-samurai':[2,512,768,512,768]
  },
  esc(value){return String(value).replaceAll('&','&amp;').replaceAll('"','&quot;');},
  characterVisual(ch){return 'COLLAB:'+ch.id;}
};
runInNewContext(app.slice(start,end)+'\nglobalThis.duelClassPortrait=duelClassPortrait;globalThis.duelFighterPortrait=duelFighterPortrait;',ctx);

test('cada classe mostra apenas a sua célula, sem SVG da folha completa',()=>{
  const pal=ctx.duelClassPortrait({sprite:'char-paladin',name:'Paladino'});
  const ber=ctx.duelClassPortrait({sprite:'char-berserker',name:'Berserker'});
  const sam=ctx.duelClassPortrait({sprite:'char-samurai',name:'Samurai'});
  assert.match(pal,/duel-class-portrait/);
  assert.match(pal,/paladin.webp/);
  assert.match(pal,/background-position:0% 0%/);
  assert.match(ber,/background-position:100% 0%/);
  assert.match(sam,/background-position:100% 100%/);
  assert.doesNotMatch(pal,/<svg|<image/);
  assert.match(css,/\.duel-character-art \.duel-class-portrait\s*\{[^}]*background-size:200% 200%/);
  assert.match(css,/aspect-ratio:2 \/ 3/);
});

test('personagem ativo da colaboração usa retrato próprio e classe continua disponível',()=>{
  assert.equal(ctx.duelFighterPortrait({id:'pecado_diane',name:'Diane',isHero:true}),'COLLAB:pecado_diane');
  assert.match(ctx.duelFighterPortrait({sprite:'char-paladin',name:'Paladino'}),/duel-class-portrait/);
  const duelCode=app.slice(app.indexOf('function renderDuelArena(members){'),app.indexOf('\nfunction renderDuels(){'));
  assert.match(duelCode,/const hero=activePlayableHero\(\)/);
  assert.match(duelCode,/COLLAB_PET_SPRITES\[hero\.id\]/);
  assert.match(duelCode,/duelFighterPortrait\(mine\)/);
  assert.match(duelCode,/duelFighterPortrait\(enemy\)/);
});

test('PWA usa nova versão de CSS, JS e cache após a correção',()=>{
  assert.match(html,/styles\.css\?v=20261104-duel-portrait-v1/);
  assert.match(html,/app\.js\?v=20261104-duel-portrait-v1/);
  assert.match(sw,/duel-portrait-v1/);
});
