import test from 'node:test'
import assert from 'node:assert/strict'
import {unlockedLevelMilestones,levelRewardHistoryProblem} from '../src/neon/level-reward-safety.js'

test('a recovered player with missing claims cannot receive old rewards again',()=>{
  assert.deepEqual(unlockedLevelMilestones(120,[]).slice(-2),[110,120])
  assert.match(levelRewardHistoryProblem({level:120,claimedMilestones:[],auditedMilestones:[],recoveryActive:true}),/não comprova/)
})

test('a missing claim in the independent audit record blocks repayment',()=>{
  assert.match(levelRewardHistoryProblem({level:15,claimedMilestones:[5,10],auditedMilestones:[5,10,15],recoveryActive:false}),/desapareceu/)
})

test('a gap below a later claim blocks repayment',()=>{
  assert.match(levelRewardHistoryProblem({level:20,claimedMilestones:[5,15,20],auditedMilestones:[],recoveryActive:false}),/lacunas/)
})

test('a new milestone after intact history remains payable',()=>{
  const history=Array.from({length:20},(_,i)=>(i+1)*5)
  assert.deepEqual(unlockedLevelMilestones(110,history),[110])
  assert.equal(levelRewardHistoryProblem({level:110,claimedMilestones:history,auditedMilestones:history,recoveryActive:true}),null)
})
