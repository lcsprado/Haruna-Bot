import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 V2_GROUP_FLASH,v2GroupFlashCash,v2GroupFlashBudgetRemaining
} from '../src/neon/reboot-economy-policy.js'

const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const spawn=source.slice(source.indexOf('export async function maybeSpawnGroupEvent('),
 source.indexOf('export async function claimGroupEvent('))
const claim=source.slice(source.indexOf('export async function claimGroupEvent('),
 source.indexOf('/**\n * Contratos Alpha:',source.indexOf('export async function claimGroupEvent(')))

test('V2: premiações por tipo entre R$ 300 e R$ 1.000, inclusive no fim do orçamento',()=>{
 assert.deepEqual({min:V2_GROUP_FLASH.minCash,max:V2_GROUP_FLASH.maxCash,daily:V2_GROUP_FLASH.dailyCashCap},
  {min:300,max:1000,daily:12000})
 const ranges={maleta:[400,850],pix:[600,1000],tesouro:[300,650]}
 for(const [kind,[min,max]] of Object.entries(ranges)){
  assert.equal(v2GroupFlashCash(kind,12000,0),min)
  assert.equal(v2GroupFlashCash(kind,12000,.9999999),max)
  assert.equal(v2GroupFlashCash(kind,350,.9999),350)
  assert.equal(v2GroupFlashCash(kind,299,.5),0)
 }
 assert.throws(()=>v2GroupFlashCash('invalid',1000,.5),/desconhecido/)
 assert.throws(()=>v2GroupFlashCash('pix',1000,1),RangeError)
})

test('V2: orçamento é único para grupos e reserva eventos não resgatados',()=>{
 assert.equal(v2GroupFlashBudgetRemaining(1000,2000),9000)
 assert.equal(v2GroupFlashBudgetRemaining(11300,400),300)
 assert.equal(v2GroupFlashBudgetRemaining(11300,700),0)
 assert.equal(v2GroupFlashBudgetRemaining(0,0),12000)
 assert.throws(()=>v2GroupFlashBudgetRemaining(-1,0),RangeError)
 assert.match(spawn,/if\(old && Number\(old\.spawned_at\)>now-1800\) return null/)
 assert.match(spawn,/expiresAt:now\+120/)
 assert.match(spawn,/if\(budget\.remaining<V2_GROUP_FLASH\.minCash\)return null/)
 assert.match(spawn,/v2GroupFlashCash\(e\.type,budget\.remaining\)/)
 assert.match(source,/from_jid='system' AND type='group_event'/)
 assert.match(source,/America\/Sao_Paulo/)
 assert.match(source,/claimed_by IS NULL AND expires_at > \$1/)
})

test('V2: mesmo jogador pode pegar eventos seguidos; pagamento mantém guarda transacional',()=>{
 assert.doesNotMatch(claim,/claimCooldown|24\*60\*60|v2:group-event:/)
 assert.match(claim,/V2_GROUP_FLASH_LOCK/)
 assert.match(spawn,/V2_GROUP_FLASH_LOCK/)
 assert.ok(claim.indexOf('V2_GROUP_FLASH_LOCK') < claim.indexOf('FOR UPDATE'))
 assert.ok(spawn.indexOf('V2_GROUP_FLASH_LOCK') < spawn.indexOf('FOR UPDATE'))
 assert.match(claim,/budget\.paid\+rewardCash>V2_GROUP_FLASH\.dailyCashCap/)
 assert.match(claim,/UPDATE group_events SET claimed_by=\$1/)
 assert.match(claim,/INSERT INTO transactions\(from_jid,to_jid,amount,type,note\)/)
 assert.match(claim,/e\.claimed_by \|\| Number\(e\.expires_at\)<now/)
 assert.match(spawn,/if\(Math\.random\(\)>.035\) return null/)
})
