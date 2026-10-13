import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const body=src.slice(src.indexOf('export function cltDriverTradeInValue'),src.indexOf('const driverFromId')).replace(/^export /gm,'')
const credit=new Function(body+'return cltDriverTradeInValue')()
test('Motoristas devolvem 70% exatos do preço pago',()=>{
 assert.equal(credit(25000),17500)
 assert.equal(credit(75000),52500)
 assert.equal(credit(200000),140000)
 assert.throws(()=>credit(-1))
})
test('Salva custo pago e migra motoristas existentes',()=>{
 assert.match(src,/ALTER TABLE clt_uber_drivers ADD COLUMN IF NOT EXISTS price_paid BIGINT/)
 assert.match(src,/UPDATE clt_uber_drivers SET price_paid=CASE driver_type/)
 assert.match(src,/INSERT INTO clt_uber_drivers\(jid,driver_type,price_paid\)/)
})
test('Venda e troca protegem turnos e saldo pendente',()=>{
 for(const fn of ['sellCltUberDriver','tradeCltUberDriver']){
  const st=src.indexOf('export async function '+fn)
  const body=src.slice(st,src.indexOf('\n}\n',st)+2)
  assert.match(body,/return tx\(async client=>/)
  assert.match(body,/await accrueCltUber\(client,jid\)/)
  assert.match(body,/shift_ends_at/)
  assert.match(body,/row\.accrued/)
  assert.match(body,/FOR UPDATE/)
 }
})
test('Troca mantém slot, não cria dinheiro e confirma diferença',()=>{
 const body=src.slice(src.indexOf('export async function tradeCltUberDriver'),src.indexOf('export async function hireCltUberDriver'))
 assert.match(body,/target\.price<=type\.price/)
 assert.match(body,/difference=target\.price-resale/)
 assert.match(body,/cash<difference/)
 assert.match(body,/UPDATE clt_uber_drivers SET driver_type=\$1,price_paid=\$2/)
 assert.match(body,/UPDATE wallets SET cash=cash-\$1/)
 assert.doesNotMatch(body,/UPDATE wallets SET cash=cash\+\$1/)
})
test('Menu aceita seleção, venda, troca, confirmação e cancelamento',()=>{
 for(const stage of ['driver_sale_select','driver_sale_action','driver_trade_select','driver_sale_confirm','driver_trade_confirm'])
  assert.ok(app.includes(stage))
 assert.match(app,/vendermotorista/)
})
