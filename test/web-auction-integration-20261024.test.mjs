import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const auction=read('../src/neon/auction-alpha.js')
const api=read('../src/neon/web-api.js')
const app=read('../web/app.js')

test('interface de leilão web contém incremento rápido de 50 mil e valor direto',()=>{
  assert.doesNotThrow(()=>new Script(app))
  assert.match(app,/\['auction','🔨','Leilão'\]/)
  assert.match(app,/auctionBid\('\+50000'\)/)
  assert.match(app,/data-auction-form/)
  assert.match(app,/data-auction-amount/)
  assert.match(app,/\/api\/v1\/me\/auction/)
  assert.match(app,/\/api\/v1\/action\/auction\.bid/)
})

test('web usa autenticação, identidade do servidor e a mesma rotina do whatsapp',()=>{
  assert.match(api,/getAuctionWebStatus\(\{chat:requireGroup\(session\),sender:session\.jid\}\)/)
  assert.match(api,/if\(name==='auction\.bid'\)return placeAuctionWebBid/)
  assert.match(api,/name:await playerDisplayName\(jid\)/)
  assert.match(api,/if\(actionName!=='auction\.bid'\)await sendWebGroupActivity/)
  assert.match(auction,/await handleAuctionAlphaCommand\(\{cmd:'lance',args:\[raw\],chat,sender,name,web:true/)
  assert.match(auction,/pg_advisory_xact_lock/)
  assert.match(auction,/if\(!Number\.isSafeInteger\(offered\)\|\|offered>2000000000\|\|offered<minimum\)/)
})

test('lance web é público nos grupos, prêmio secreto, mesmo caixa reservado',()=>{
  assert.match(auction,/otherGroups:web\?\[\.\.\.new Set\(state\.groups\)\]/)
  assert.match(auction,/origin:web\?'web':chat/)
  assert.match(auction,/result\.notice\.replace\('LANCE DE OUTRO GRUPO!','LANCE PELO WEB!'\)/)
  assert.match(auction,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/)
  assert.match(auction,/UPDATE wallets SET cash=cash\+\$1,bank=bank\+\$2/)
  assert.match(auction,/extendAuctionDeadline\(state\.ends,state\.extra,Date\.now\(\)\)/)
  assert.match(auction,/entry\.rewards=received/)
  const safe=auction.split('export async function getAuctionWebStatus')[1].split('export async function placeAuctionWebBid')[0]
  assert.doesNotMatch(safe,/prize\s*:/)
  assert.doesNotMatch(safe,/salt\s*:/)
  assert.doesNotMatch(safe,/lots\s*:/)
})
