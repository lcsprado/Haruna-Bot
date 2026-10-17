import test from 'node:test'
import assert from 'node:assert/strict'
import {scaleRaidHpOnLateJoin} from '../src/neon/raid-hp-scaling.js'

const join=(state,count)=>scaleRaidHpOnLateJoin({
  baseHp:540000,
  currentHp:state.hp,
  currentMaxHp:state.maxHp,
  playersAfterJoin:count
})

test('first late join scales HP by 12 percent',()=>{
  assert.deepEqual(join({hp:500000,maxHp:604800},3),{
    hp:564800,maxHp:669600,addedHp:64800
  })
})

test('leaving and rejoining cannot inflate boss HP',()=>{
  let state={hp:633610,maxHp:734400}
  for(let i=0;i<20;i++){
    const next=join(state,3)
    assert.deepEqual(next,{...state,addedHp:0})
    state={hp:next.hp,maxHp:next.maxHp}
  }
})

test('a larger simultaneous party still scales, once',()=>{
  const current={hp:500000,maxHp:669600}
  const four=join(current,4)
  assert.deepEqual(four,{hp:564800,maxHp:734400,addedHp:64800})
  assert.deepEqual(join(four,4),{...four,addedHp:0})
  assert.deepEqual(join(four,3),{...four,addedHp:0})
  const five=join(four,5)
  assert.deepEqual(five,{hp:629600,maxHp:799200,addedHp:64800})
})

test('raid solo remains unchanged and lost HP is not reset',()=>{
  assert.deepEqual(join({hp:250000,maxHp:540000},1),{
    hp:250000,maxHp:540000,addedHp:0
  })
  assert.deepEqual(join({hp:250000,maxHp:799200},3),{
    hp:250000,maxHp:799200,addedHp:0
  })
})
