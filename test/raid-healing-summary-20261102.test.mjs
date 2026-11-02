import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRaidPlayerHealing} from '../src/neon/raid-healing-summary.js';

test('Ban ativo recebe crédito de cura como herói, não como Paladino',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:'pecado_ban',
    classHealing:173,classHealingActivations:24,classHealingOpportunities:0
  });
  assert.match(text,/Cura recebida: \+173 HP/);
  assert.match(text,/Cura do herói Ban: \+173 HP \(24 ativações\)/);
  assert.doesNotMatch(text,/Passiva da classe|Bênção Restauradora|0 oportunidade/);
});

test('Paladino sem herói mantém a cura da própria classe',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:null,
    classHealing:750,classHealingActivations:5,classHealingOpportunities:8
  });
  assert.match(text,/Passiva da classe: \+750 HP/);
  assert.match(text,/Bênção Restauradora: \*5 ativação\(ões\)\* \/ 8 oportunidade/);
  assert.doesNotMatch(text,/Cura do herói/);
});

test('cura de pet e poções continuam intactas',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'samurai',petSkillHealing:2000,potionHealing:4453,
    potionUses:1,classHealing:0
  });
  assert.match(text,/Cura recebida: \+6\.453 HP/);
  assert.match(text,/Skill do pet: \+2\.000 HP/);
  assert.match(text,/Poções: \+4\.453 HP \(1 uso\(s\)\)/);
  assert.doesNotMatch(text,/Bênção Restauradora/);
});

test('sem cura exibe zero sem atribuir cura ao herói',()=>{
  const text=formatRaidPlayerHealing({
    playerClassId:'paladin',activeHeroId:'pecado_meliodas',classHealing:0
  });
  assert.match(text,/0 HP.*nenhuma cura ativada/);
  assert.doesNotMatch(text,/Bênção Restauradora|Cura do herói/);
});
