import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const from=src.indexOf('const materialRanges={',src.indexOf('async function finishRaidRewards'))
const to=src.indexOf('\n    const weightedRange=',from)
assert.ok(from>0&&to>from)
const materialRanges=new Function(src.slice(from,to)+';return materialRanges')()
test('Raid 1 (nível 10) dá de 5 a 7 fragmentos ao campeão',()=>{
  assert.deepEqual(materialRanges[10][0],[5,7])
  assert.deepEqual(materialRanges[10].slice(1),[[1,3],[1,2]])
})
test('Faixas das outras raids permanecem iguais',()=>{
  assert.deepEqual(Object.keys(materialRanges).map(Number),[10,15,20,25,30,40,50,60,65,70])
  assert.deepEqual(materialRanges[15],[[3,5],[2,4],[1,2]])
  assert.deepEqual(materialRanges[20],[[4,6],[2,4],[1,3]])
  assert.deepEqual(materialRanges[25],[[5,7],[3,5],[1,3]])
  assert.deepEqual(materialRanges[30],[[6,9],[4,6],[2,3]])
  assert.deepEqual(materialRanges[40],[[8,11],[5,7],[2,4]])
  assert.deepEqual(materialRanges[50],[[9,12],[6,8],[3,5]])
  assert.deepEqual(materialRanges[60],[[10,13],[7,9],[4,6]])
  assert.deepEqual(materialRanges[65],[[11,14],[8,10],[5,7]])
  assert.deepEqual(materialRanges[70],[[12,15],[9,11],[6,8]])
})
test('Colocação exige participação real e respeita eventos sem somar múltiplos',()=>{
  assert.match(src,/share>=\.02/)
  assert.match(src,/baseQty\*\(raidEventActive\?3:\(doubleRaidFragments\?2:1\)\)/)
})
