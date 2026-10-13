import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const raid=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
test('Cura na Raid registra HP recuperado efetivamente, sem excesso',()=>{
  assert.match(raid,/p\.classHealing=Number\(p\.classHealing\|\|0\)\+Math\.max\(0,Number\(p\.hp\)-hpBefore\)/)
  assert.match(raid,/p\.potionHealing=Number\(p\.potionHealing\|\|0\)\+Math\.max\(0,Number\(p\.hp\)-beforePotionHeal\)/)
  assert.match(raid,/p\.petPotionHealing=Number\(p\.petPotionHealing\|\|0\)\+Math\.max\(0,Number\(p\.pet\.hp\)-beforePetHeal\)/)
  assert.match(raid,/p\.petSkillHealing=Number\(p\.petSkillHealing\|\|0\)\+healed/)
})
test('Relatório inclui todas as fontes de cura e informa zero',()=>{
  for(const field of ['petSkillHealing','classHealing','potionHealing','potionUses','petPotionHealing','petPotionUses']){
    assert.ok(raid.includes(field+':Number(p.'),'sem recompensa: '+field)
    assert.ok(index.includes('x.'+field),'sem visualização: '+field)
  }
  assert.match(index,/Cura recebida: \*0 HP\* \(nenhuma cura ativada\)/)
})
test('Não altera fórmulas de XP, dinheiro, drops ou condição de ativação da cura',()=>{
  assert.match(raid,/10:\[\[5,7\],\[1,3\],\[1,2\]\]/)
  assert.match(raid,/const collaborationBonus=Math\.floor\(cfg\.cashPool\*\(\.04\+\.12\*share\)\)/)
  assert.match(raid,/Number\(p\.hp\)\/Number\(p\.maxHp\)<\.70/)
})
