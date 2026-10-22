import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const loanFile=readFileSync(new URL('../src/neon/loans.js',import.meta.url),'utf8')
const start=loanFile.indexOf('export async function collectOverdueLoansForBorrower(')
const stop=loanFile.indexOf('\nexport async function collectOverdueLoans()',start)
assert.ok(start>=0 && stop>start,'Loan function must exist')
const fnSource=loanFile.slice(start,stop).trim().replace(/^export\s+/,'')
function mockedLoanCollector({due=false}={}){
 let preflights=0,transactions=0,rowLocks=0,accruals=0,payments=0
 const context={
 db:{query:async(sql,values)=>{
   assert.match(sql,/SELECT 1 FROM player_loans/)
   assert.match(sql,/due_at</)
   assert.deepEqual(Array.from(values),['player'])
   preflights++
   return {rowCount:due?1:0}
 }},
 tx:async(callback)=>{
   transactions++
   return callback({query:async(sql,values)=>{
     assert.match(sql,/FOR UPDATE/)
     assert.deepEqual(Array.from(values),['player'])
     rowLocks++
     return {rows:due?[{id:42,due_at:0}]:[]}
   }})
 },
 accrueInterest:async(_client,row)=>{accruals++;return row},
 applyPayment:async(_client,row,amount,method)=>{payments++;assert.equal(method,'automatic');assert.equal(amount,999);return {paid:amount,loan:row}},
 totalDue:()=>999,
 }
 const fn=vm.runInNewContext('('+fnSource+')',context)
 return {run:()=>fn('player'),stats:()=>({preflights,transactions,rowLocks,accruals,payments})}
}
test('all ordinary commands skip transaction when there is no overdue loan',async()=>{
 const m=mockedLoanCollector()
 for(let n=0;n<3;n++)assert.equal((await m.run()).paid,0)
 assert.deepEqual(m.stats(),{preflights:3,transactions:0,rowLocks:0,accruals:0,payments:0})
})
test('overdue loan still accrues and pays under existing exclusive row lock and transaction',async()=>{
 const m=mockedLoanCollector({due:true})
 const a=await m.run()
 assert.equal(a.paid,999)
 assert.equal(a.loan.id,42)
 assert.deepEqual(m.stats(),{preflights:1,transactions:1,rowLocks:1,accruals:1,payments:1})
})
test('ensureUser may parallelize only independent idempotent wallet/stats inserts',()=>{
 const s=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const part=s.slice(s.indexOf('export async function ensureUser'),s.indexOf('export async function consolidateUserIdentity'))
 assert.match(part,/INSERT INTO users[\s\S]*?ON CONFLICT\(jid\)/)
 assert.match(part,/await Promise\.all\(\[\s*db\.query\('INSERT INTO wallets/)
 assert.match(part,/db\.query\('INSERT INTO stats/)
 assert.match(part,/ON CONFLICT\(jid\) DO NOTHING/)
})
test('slow command instrumentation excludes body, chat and identity from logging',()=>{
 const s=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(s,/\[CommandLatency\]/)
 const lines=s.split('\n').filter(line=>line.includes('[CommandLatency]'))
 assert.equal(lines.length,2)
 for(const line of lines){assert.doesNotMatch(line,/sender|\bchat\b|text:|body:|msg\.key/)}
})
