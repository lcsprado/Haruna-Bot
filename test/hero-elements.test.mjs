import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PECADOS_HEROES} from '../src/neon/sete-pecados-catalog.js';
import {
  HERO_ELEMENTS,SEVEN_SINS_ELEMENT_IDS,heroElement,heroElementLabel,
  elementalMatchup,elementalDamageMultiplier,applyElementalDamage
} from '../src/neon/hero-elements.js';

test('exatamente cinco elementos e sete Pecados com afinidade fixa',()=>{
  assert.deepEqual(Object.keys(HERO_ELEMENTS).sort(),['dark','fire','light','water','wind']);
  const registered=PECADOS_HEROES.map(h=>h.species);
  assert.equal(registered.length,7);
  assert.deepEqual(Object.keys(SEVEN_SINS_ELEMENT_IDS).sort(),registered.sort());
  for(const id of registered){
    assert.ok(heroElement(id),'afinidade ausente: '+id);
    assert.ok(heroElementLabel(id).includes(heroElement(id).name));
  }
});

test('trocar Pecado troca o elemento derivado, sem salvar progresso novo',()=>{
  const owned={pecado_ban:{level:100,mastery:5},pecado_meliodas:{level:98,mastery:3}};
  const snapshot=structuredClone(owned);
  assert.equal(heroElement('pecado_ban').id,'fire');
  assert.equal(heroElement('pecado_meliodas').id,'dark');
  assert.equal(heroElement(null),null);
  assert.equal(heroElement('class'),null);
  assert.deepEqual(owned,snapshot);
});

test('vantagens cíclicas Fogo > Vento > Água > Fogo',()=>{
  assert.equal(elementalMatchup('pecado_ban','pecado_king'),'advantage');
  assert.equal(elementalMatchup('pecado_king','pecado_diane'),'advantage');
  assert.equal(elementalMatchup('pecado_diane','pecado_ban'),'advantage');
  assert.equal(elementalMatchup('pecado_king','pecado_ban'),'disadvantage');
  assert.equal(elementalMatchup('pecado_ban','pecado_diane'),'disadvantage');
});

test('Luz e Escuridão têm confronto recíproco; outros pares são neutros',()=>{
  assert.equal(elementalMatchup('pecado_escanor','pecado_meliodas'),'clash');
  assert.equal(elementalMatchup('pecado_meliodas','pecado_escanor'),'clash');
  assert.equal(elementalMatchup('pecado_meliodas','pecado_gowther'),'neutral');
  assert.equal(elementalMatchup('pecado_escanor','pecado_diane'),'neutral');
  assert.equal(elementalMatchup('pecado_ban','pecado_ban'),'neutral');
  assert.equal(elementalMatchup('pecado_ban','paladin'),'neutral');
});

test('sem ativação a camada elemental não altera dano nem HP existente',()=>{
  assert.equal(applyElementalDamage({damage:1000,attackerHeroId:'pecado_ban',defenderHeroId:'pecado_king'}),1000);
  assert.equal(applyElementalDamage({damage:0}),0);
  assert.equal(elementalDamageMultiplier('pecado_ban','pecado_king'),1.06);
  assert.equal(elementalDamageMultiplier('pecado_king','pecado_ban'),1);
  assert.equal(applyElementalDamage({damage:1000,attackerHeroId:'pecado_ban',defenderHeroId:'pecado_king',enabled:true}),1060);
  assert.equal(applyElementalDamage({damage:1000,attackerHeroId:'pecado_meliodas',defenderHeroId:'pecado_escanor',enabled:true}),1060);
  assert.equal(applyElementalDamage({damage:1000,attackerHeroId:'pecado_meliodas',defenderHeroId:null,enabled:true}),1000);
});

test('integração não muda inventário, classes nem progressão ao trocar herói',()=>{
  const source=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(source,/getActivePlayableHero/);
  assert.match(source,/player_hero_mode/);
  assert.match(source,/Você está em combate ativo/);
  assert.match(source,/Nenhum UPDATE\/DELETE em pets, classe, stats, pet_team ou awakening/);
  assert.match(source,/heroElementLabel/);
  assert.match(source,/elementos/);
});
