import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatSavedClassStatus} from '../src/neon/character-base-status-format.js'

const base={
  class_id:'paladin',class_applied:true,level:451,
  max_hp:3760,atk:922,def:467,spd:460,
  class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5
}

test('!status classe: ficha real sem equipamentos, sem duplicar Despertar',()=>{
  const result=formatSavedClassStatus(base,4,false)
  assert.match(result,/STATUS DA CLASSE — PALADINO/)
  assert.match(result,/CLASSE ATIVA/)
  assert.match(result,/Nível geral do jogador: \*451\*/)
  assert.match(result,/Despertar: \*IV\/V\*/)
  assert.match(result,/HP base persistente: \*3\.760\* \(3\.630 permanente \+ 130 da classe\)/)
  assert.match(result,/ATK base persistente: \*922\* \(915 permanente \+ 7 da classe\)/)
  assert.match(result,/DEF base persistente: \*467\* \(445 permanente \+ 22 da classe\)/)
  assert.match(result,/VEL base persistente: \*460\* \(455 permanente \+ 5 da classe\)/)
  assert.match(result,/4,8% dano.*9,6% dano recebido/)
  assert.doesNotMatch(result,/arma equipada|armadura equipada|pet principal|selo \+5%/)
  assert.match(result,/O Despertar permanente já está nos atributos acima/)
})

test('classe preservada: ficha pode ser consultada quando herói ativo',()=>{
  const result=formatSavedClassStatus(base,4,true)
  assert.match(result,/CLASSE PRESERVADA — INATIVA/)
  assert.match(result,/herói da collab equipado/)
  assert.match(result,/HP base persistente: \*3\.760\*/)
  assert.doesNotMatch(result,/DIANE/)
})

test('Despertar V apresenta ganho de função atualizado, sem evoluir classe',()=>{
  const result=formatSavedClassStatus({...base,class_id:'samurai',class_hp_bonus:60,class_atk_bonus:18,class_def_bonus:10,class_spd_bonus:14},5,false)
  assert.match(result,/SAMURAI/)
  assert.match(result,/Despertar: \*V\/V\*/)
  assert.match(result,/20% dano.*8% dano recebido/)
  assert.match(result,/Corte da Lua/)
})

test('classe não escolhida: não inventar bônus de Guerreiro',()=>{
  const result=formatSavedClassStatus({...base,class_applied:false,class_id:'warrior'},1,false)
  assert.match(result,/ainda não escolheu uma classe/)
  assert.doesNotMatch(result,/STATUS DA CLASSE/)
})

test('WhatsApp intercepta !status classe antes do !status comum',()=>{
  const handler=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8')
  const router=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(handler,/cmd\|\|''\)\.toLowerCase\(\)==='status'/)
  assert.match(handler,/getSavedClassStatus\(sender\)/)
  assert.ok(router.indexOf('handlePlayableHeroCommand({cmd,args,sender,reply})')>=0)
  assert.ok(router.indexOf('handlePlayableHeroCommand({cmd,args,sender,reply})')<router.indexOf("['status'].includes(cmd)"))
})
