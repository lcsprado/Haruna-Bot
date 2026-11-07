import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_CLASSES} from '../src/neon/game-catalog.js';
import {classCombatStats,classCombatGrowth} from '../src/neon/class-combat-balance.js';
import {classComparisonBonuses,classComparisonLevel} from '../src/neon/hero-class-comparison.js';

test('Samurai Lv100 inclui atributos originais e crescimento da nova regra',()=>{
  assert.deepEqual(classCombatGrowth('samurai',100),{hp:220,atk:30,def:12,spd:18});
  assert.deepEqual(classComparisonBonuses('samurai',100),{hp:280,atk:48,def:22,spd:32});
});

test('A comparação usa a mesma soma que o combate real sem equipamentos',()=>{
  for(const id of ['samurai','paladin','berserker','necromancer']){
    const old=PLAYER_CLASSES[id];
    for(const level of [1,25,50,75,100]){
      const neutral={hp:3000,atk:700,def:400,spd:390};
      const persistent={
        max_hp:neutral.hp+old.hp,atk:neutral.atk+old.atk,
        def:neutral.def+old.def,spd:neutral.spd+old.spd
      };
      const combat=classCombatStats(persistent,id,level,true);
      const compared=classComparisonBonuses(id,level);
      assert.deepEqual(compared,{
        hp:combat.maxHp-neutral.hp,atk:combat.atk-neutral.atk,
        def:combat.def-neutral.def,spd:combat.spd-neutral.spd
      },id+' Lv'+level);
    }
  }
});

test('Classe ainda não registrada é comparada no nível do herói',()=>{
  assert.deepEqual(classComparisonLevel({heroLevel:100}),{level:100,source:'referencia'});
  assert.deepEqual(classComparisonLevel({heroLevel:35}),{level:35,source:'referencia'});
});

test('Classe existente usa nível real e simulação explícita não altera o registro',()=>{
  assert.deepEqual(classComparisonLevel({heroLevel:100,recordedClassLevel:24}),{level:24,source:'registrado'});
  assert.deepEqual(classComparisonLevel({heroLevel:100,recordedClassLevel:24,overrideLevel:100}),{level:100,source:'selecionado'});
  assert.throws(()=>classComparisonLevel({overrideLevel:101}),RangeError);
  assert.throws(()=>classComparisonLevel({overrideLevel:0}),RangeError);
});
