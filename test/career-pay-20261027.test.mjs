import test from 'node:test'
import assert from 'node:assert/strict'
import {careerGrossFromLevelCap} from '../src/neon/career-pay.js'

test('Gerente mantém bruto anterior, Diretor e CEO recebem aumento real',()=>{
  assert.equal(careerGrossFromLevelCap(15000,2.4),15000)
  assert.equal(careerGrossFromLevelCap(15000,3),18750)
  assert.equal(careerGrossFromLevelCap(15000,4),25000)
})
test('não reduz salários dos cargos anteriores ao Gerente',()=>{
  for(const mult of [1,1.12,1.25,1.45,1.7,2]){
    assert.equal(careerGrossFromLevelCap(15000,mult),15000)
  }
})
test('escala com o nível do personagem sem mudar a progressão existente',()=>{
  assert.equal(careerGrossFromLevelCap(7500,2.4),7500)
  assert.equal(careerGrossFromLevelCap(7500,3),9375)
  assert.equal(careerGrossFromLevelCap(7500,4),12500)
})
test('bônus 50% e evento 2x afetam valores sem serem anulados pelo teto',()=>{
  assert.equal(careerGrossFromLevelCap(15000,3,{performanceFactor:1.5}),28125)
  assert.equal(careerGrossFromLevelCap(15000,3,{eventMoneyMultiplier:2}),37500)
  assert.equal(careerGrossFromLevelCap(15000,4,{performanceFactor:.85}),21250)
  assert.equal(careerGrossFromLevelCap(15000,3,{performanceFactor:1.5,eventMoneyMultiplier:2}),56250)
})
test('TAXADE conserva 10% sobre o bruto',()=>{
  const gross=careerGrossFromLevelCap(15000,3)
  const tax=Math.floor(gross*.1)
  assert.deepEqual({gross,tax,net:gross-tax},{gross:18750,tax:1875,net:16875})
})
test('não aceita multiplicadores e limites inválidos',()=>{
  for(const args of [[0,3],[15000,0],[15000,Number.NaN],[Number.POSITIVE_INFINITY,3]]){
    assert.throws(()=>careerGrossFromLevelCap(...args),/inválidos/)
  }
})
