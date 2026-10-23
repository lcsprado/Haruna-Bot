import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PIX_LIMIT_PER_TRANSFER,PIX_LIMIT_PER_DAY,checkPixLimits} from '../src/neon/pix-limits.js'

test('PIX: limite por operação e valor inteiro positivo',()=>{
 assert.equal(PIX_LIMIT_PER_TRANSFER,5_000_000)
 assert.equal(PIX_LIMIT_PER_DAY,10_000_000)
 for(const value of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>checkPixLimits(value))
 }
 assert.deepEqual(checkPixLimits(5_000_000),{remaining:5_000_000})
 assert.throws(()=>checkPixLimits(5_000_001),/Limite por PIX/)
})

test('PIX: teto diário acumulado inclui valores de transferências anteriores',()=>{
 assert.deepEqual(checkPixLimits(5_000_000,5_000_000),{remaining:0})
 assert.deepEqual(checkPixLimits(1,9_999_999),{remaining:0})
 assert.throws(()=>checkPixLimits(1,10_000_000),/Limite diário/)
 assert.throws(()=>checkPixLimits(2_000_000,9_000_000),/Disponível: R\\$ 1\\.000\\.000/)
 assert.throws(()=>checkPixLimits(1,-1),/limite diário/)
 assert.throws(()=>checkPixLimits(1,Infinity),/limite diário/)
})

test('PIX: checagem no débito de produção, serializada por lock de carteira',()=>{
 const src=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const start=src.indexOf('export async function transfer(')
 const end=src.indexOf('export async function purchaseService(',start)
 assert.ok(start>=0 && end>start)
 const body=src.slice(start,end)
 const walletLock=body.indexOf('ORDER BY jid FOR UPDATE')
 const usage=body.indexOf("FROM transactions\nWHERE from_jid=$1 AND type='transfer'")
 const dailyCheck=body.indexOf('checkPixLimits(amount,Number(daily.rows[0]?.sent_today||0))')
 const debit=body.indexOf("SET cash=cash-$1")
 const credit=body.indexOf("SET cash=cash+$1")
 const insert=body.indexOf('INSERT INTO transactions')
 assert.ok(walletLock>=0 && usage>walletLock && dailyCheck>usage && debit>dailyCheck && credit>debit && insert>credit)
 assert.match(body,/America\\/Sao_Paulo/)
 assert.match(body,/DATE_TRUNC\\('day', NOW\\(\\) AT TIME ZONE/)
 assert.match(body,/return transaction\\(async client =>/)
})
