import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8')
const bot=read('../src/neon/index.js')
const db=read('../src/neon/db.js')

test('PIX direto resolve mencao LID em identidade canonica antes do pagamento',()=>{
  const start=bot.indexOf("} else if(['pix','transferir','transfer'].includes(cmd)){")
  const end=bot.indexOf("} else if(['emprestimo','emprestar'].includes(cmd))",start)
  assert.ok(start>=0&&end>start)
  const action=bot.slice(start,end)
  assert.match(action,/const target=await resolvePixRecipient\(sock,chat,mention,msg\)/)
  assert.match(action,/if\(!target\) return await reply/)
  assert.ok(action.indexOf('resolvePixRecipient')<action.indexOf('transfer(sender,target,amount)'))
})
test('fluxo PIX e monto numerico tambem protegem o destino',()=>{
  const start=bot.indexOf("if(flow.stage==='pix_target'){")
  const end=bot.indexOf("if(flow.stage==='pix_amount'){",start)
  assert.ok(start>=0&&end>start)
  const action=bot.slice(start,end)
  assert.match(action,/const target=await resolvePixRecipient\(sock,chat,mention,msg\)/)
  assert.match(action,/if\(!target\)/)
  assert.match(action,/setQuickFlow\(chat,sender,'pix_amount',\{target\}/)
})
test('identidade sem telefone nao permite carteira temporaria nem debito',()=>{
  const helper=bot.slice(bot.indexOf('async function resolvePixRecipient('),bot.indexOf('function unwrapMessageContent(',bot.indexOf('async function resolvePixRecipient(')))
  assert.match(helper,/resolvePlayerIdentity/)
  assert.match(helper,/endsWith\('@s.whatsapp.net'\)/)
  const transfer=db.slice(db.indexOf('export async function transfer('),db.indexOf('export async function purchaseService('))
  assert.ok(transfer.indexOf("endsWith('@s.whatsapp.net')")<transfer.indexOf('await ensureUser(toJid)'))
  assert.match(transfer,/ORDER BY jid FOR UPDATE/)
  assert.match(transfer,/UPDATE wallets SET cash=cash-\$1/)
  assert.match(transfer,/UPDATE wallets SET cash=cash\+\$1/)
})
