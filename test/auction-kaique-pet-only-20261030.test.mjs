import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8')
const src=read('../src/neon/auction-kaique-pet-only-20261030.js')
const entry=read('../src/neon/index.js')

test('corrige apenas Guaxinim ID77 do Kaique, com prova da transferência',()=>{
  assert.match(src,/const PET_ID=77/)
  assert.match(src,/const SPECIES='guaxinim_errante_20261027'/)
  assert.match(src,/const KAIQUE='5511939089695@s\.whatsapp\.net'/)
  assert.match(src,/const AUCTION_KEY='leilao_quatro_destinos_20261029_1900_v1'/)
  assert.match(src,/transfer\.originalWinner!==PRIOR_OWNER/)
  assert.match(src,/transfer\.newWinner!==KAIQUE/)
  assert.match(src,/Number\(transfer\.petId\)!==PET_ID/)
  assert.match(src,/Number\(transfer\.newBid\)!==47000000/)
})

test('não duplica reembolso nem altera economias, caixas e outros pets',()=>{
  assert.doesNotMatch(src,/UPDATE\s+wallets|INSERT\s+INTO\s+transactions|UPDATE\s+inventories|DELETE\s+FROM\s+inventories/i)
  assert.doesNotMatch(src,/sendMessage|notifyGroup|announce|queueAuctionBidNotices/)
  assert.match(src,/DELETE FROM pet_collection WHERE id=\$1 AND jid=\$2 AND species=\$3 AND active=FALSE RETURNING id/)
  assert.match(src,/\[PET_ID,KAIQUE,SPECIES\]/)
  assert.match(src,/cashChanged:false,boxesChanged:false/)
})

test('bloqueia exclusão de pet evoluído ou integrante de equipe e expedições',()=>{
  assert.match(src,/Boolean\(p\.active\)\|\|Number\(p\.level\)!==1\|\|Number\(p\.xp\)!==0/)
  assert.match(src,/SELECT slot FROM pet_team WHERE pet_id=\$1 LIMIT 1/)
  assert.match(src,/SELECT id FROM pet_expeditions WHERE pet_id=\$1 LIMIT 1/)
  assert.match(src,/if\(team\.rowCount\|\|exped\.rowCount\)/)
})

test('opera em transação idempotente e registra conclusão antes de retornar',()=>{
  assert.match(src,/BEGIN/)
  assert.match(src,/pg_advisory_xact_lock/)
  assert.match(src,/SELECT value FROM trevo_settings WHERE key=\$1 FOR UPDATE/)
  assert.match(src,/KAIQUE_PET_REMOVAL_MARKER/)
  assert.match(src,/INSERT INTO trevo_settings\(key,value,updated_at\)/)
  assert.match(src,/COMMIT/)
  assert.match(src,/ROLLBACK/)
  assert.match(src,/finally\s*\{\s*c\.release\(\)/)
  assert.match(entry,/removeKaiqueGuaxinimId77\(\{apply:true\}\)/)
  assert.match(entry,/\[AUCTION KAIQUE PET 30\/10\]/)
})
