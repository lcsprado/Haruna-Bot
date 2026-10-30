import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {weeklyGolemLegendaryBoxCount,weeklyGolemPayoutIncrease} from '../src/neon/weekly-golem-payouts.js'
const award=(position,damage,weekendKey='2026-10-30')=>
  weeklyGolemLegendaryBoxCount({position,damage,weekendKey})
test('lendarias do Golem exigem pelo menos 500 mil de dano para cada Top 3',()=>{
  for(const rank of [1,2,3]){
    assert.equal(award(rank,499_999),0)
    assert.equal(award(rank,500_000),[3,2,1][rank-1])
    assert.equal(award(rank,800_000),[3,2,1][rank-1])
  }
  assert.equal(award(4,800_000),0)
  assert.equal(award(0,800_000),0)
  assert.equal(award(3,NaN),0)
  assert.equal(award(3,-5),0)
  assert.equal(award(2,500_000,'2026-10-23'),0)
  assert.equal(award(2,500_000,'unknown'),0)
  assert.equal(award(2,500_000,'2026-11-06'),2)
})
test('minimo de 500k so para lendarias, nao remove XP e dinheiro de participacao',()=>{
  assert.deepEqual(weeklyGolemPayoutIncrease({weekendKey:'2026-10-30',position:2,damage:100_000}),{cash:3_250_000,xp:56_000})
  assert.deepEqual(weeklyGolemPayoutIncrease({weekendKey:'2026-10-30',position:8,damage:100_000}),{cash:600_000,xp:12_000})
})
test('inventario de caixas atualizado apenas na liquidação semanal de HP zero',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.match(games,/if\(s\.hp<=0\)\{\s*const entries=Object\.entries\(s\.participants\)/)
  assert.match(games,/const legendaryBoxes=weekly\?weeklyGolemLegendaryBoxCount/)
  assert.match(games,/VALUES\(\$1,'caixa_lendaria',\$2\)/)
  assert.match(games,/ON CONFLICT\(jid,item_id\) DO UPDATE SET quantity=inventories\.quantity\+EXCLUDED\.quantity/)
  assert.match(games,/if\(legendaryBoxes>0\)/)
})
