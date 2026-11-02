import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRaidPlayerHealing} from '../src/neon/raid-healing-summary.js';

test('Ban ativo recebe crédito de cura como herói, não como Paladino',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:'pecado_ban',
    classHealing:173,classHealingActivations:24,classHealingOpportunities:0
  });
  assert.match(text,/Cura recebida: \+173 HP/);
  assert.match(text,/herói Ban \+173/);
  assert.doesNotMatch(text,/Passiva da classe|Bênção Restauradora|0 oportunidade/);
});

test('Paladino sem herói mantém a cura da própria classe',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:null,
    classHealing:750,classHealingActivations:5,classHealingOpportunities:8
  });
  assert.match(text,/Cura recebida: \+750 HP \(classe \+750\)/);
  assert.doesNotMatch(text,/Cura do herói/);
});

test('cura de pet e poções continuam intactas',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'samurai',petSkillHealing:2000,potionHealing:4453,
    potionUses:1,classHealing:0
  });
  assert.match(text,/Cura recebida: \+6\.453 HP/);
  assert.match(text,/skill pet \+2\.000/);
  assert.match(text,/poções \+4\.453 \(1×\)/);
  assert.doesNotMatch(text,/Bênção Restauradora/);
});

test('sem cura não adiciona linhas ao boletim',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:'pecado_meliodas',classHealing:0
  });
  assert.equal(text,'');
  assert.doesNotMatch(text,/Bênção Restauradora|Cura do herói/);
});
