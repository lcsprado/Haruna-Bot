import test from 'node:test'
import assert from 'node:assert/strict'
import {reconcileLegacyCompanionFragments} from '../src/neon/collab-fragment-refund-policy.js'
test('Ban has six unlogged upgrades',()=>{
 const r=reconcileLegacyCompanionFragments({raidEarned:110,currentBalance:38,companionUpgradeCap:144})
 assert.equal(r.refund,72)
 assert.equal(r.uses,6)
})
test('No phantom refunds',()=>assert.equal(reconcileLegacyCompanionFragments({raidEarned:90,currentBalance:90,companionUpgradeCap:0}).refund,0))
