import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const from=src.indexOf('const materialRanges={',src.indexOf('async function finishRaidRewards'))
const to=src.indexOf('\n    const weightedRange=',from)
assert.ok(from>0&&to>from)
const materialRanges=new Function(src.slice(from,to)+';return materialRanges')()
test('Raid 1 (nível 10) dá de 6 a 8 fragmentos ao campeão',()=>{
  assert.deepEqual(materialRanges[10][0],[6,8])
  assert.deepEqual(materialRanges[10].slice(1),[[2,4],[2,3]])
})
test('Faixas das outras raids são ampliadas em +1 fragmento por colocação',()=>{
  assert.deepEqual(Object.keys(materialRanges).map(Number),[10,15,20,25,30,40,50,60,65,70])
  assert.deepEqual(materialRanges[15],[[4,6],[3,5],[2,3]])
  assert.deepEqual(materialRanges[20],[[5,7],[3,5],[2,4]])
  assert.deepEqual(materialRanges[25],[[6,8],[4,6],[2,4]])
  assert.deepEqual(materialRanges[30],[[7,10],[5,7],[3,4]])
  assert.deepEqual(materialRanges[40],[[9,12],[6,8],[3,5]])
  assert.deepEqual(materialRanges[50],[[10,13],[7,9],[4,6]])
  assert.deepEqual(materialRanges[60],[[11,14],[8,10],[5,7]])
  assert.deepEqual(materialRanges[65],[[12,15],[9,11],[6,8]])
  assert.deepEqual(materialRanges[70],[[13,16],[10,12],[7,9]])
})
test('Colocação exige participação real e respeita eventos sem somar múltiplos',()=>{
  assert.match(src,/share>=\.02/)
  assert.match(src,/baseQty\*Math\.max\(raidEventActive\?3:\(doubleRaidFragments\?2:1\),ownerFragments\)/)
})
