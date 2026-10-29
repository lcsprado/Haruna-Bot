import test from 'node:test'
import assert from 'node:assert/strict'
import {gearStatsWithEnchants} from '../src/neon/equipment-enchant-view.js'
test('precision stones',()=>assert.equal(gearStatsWithEnchants({crit:0.0875},[{stone_id:'x',quantity:2}],{x:{stat:'crit',value:0.01}}).crit,0.1075))
