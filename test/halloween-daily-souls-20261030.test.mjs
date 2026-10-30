import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {HALLOWEEN_CORCEL_COST,HALLOWEEN_SOUL_ID} from '../src/neon/halloween-rules.js'

const code=readFileSync(new URL('../src/neon/halloween-alpha.js',import.meta.url),'utf8')

test('Halloween distinguishes today's earned souls from inventory balance',()=>{
 assert.match(code,/SELECT COALESCE\(SUM\(amount\),0\) AS earned_today FROM halloween_rewards_2026 WHERE day=\$1 AND jid=\$2 AND item_id=\$3/)
 assert.match(code,/soulsToday:Number\(earned\.rows\[0\]\?\.earned_today\|\|0\)/)
 assert.match(code,/Almas coletadas hoje/)
 assert.match(code,/Seu saldo de Almas/)
 assert.match(code,/Restantes no dia: \*ilimitadas\*/)
 assert.equal(HALLOWEEN_SOUL_ID,'alma_amaldicoada_20261026')
})
test('Halloween Corcel progress uses remaining inventory and respects prior claim',()=>{
 assert.equal(HALLOWEEN_CORCEL_COST,100)
 assert.match(code,/corcelClaimed:Boolean\(corcel\.rowCount\)/)
 assert.match(code,/Math\.max\(0,HALLOWEEN_CORCEL_COST-s\.souls\)/)
 assert.match(code,/já resgatado/)
})
test('30 minute bulletin includes earned soul totals per player for the correct day',()=>{
 assert.match(code,/SUM\(amount\) AS souls_today FROM halloween_rewards_2026/)
 assert.match(code,/WHERE day=\$1 AND item_id=\$2 GROUP BY jid/)
 assert.match(code,/WHERE p\.active=TRUE AND p\.day=\$1/)
 assert.match(code,/fmt\(p\.souls_today\)\+' Almas hoje'/)
})
