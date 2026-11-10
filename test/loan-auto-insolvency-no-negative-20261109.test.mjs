import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'

const text=readFileSync(new URL('../src/neon/loans.js',import.meta.url),'utf8')
const block=text.slice(text.indexOf('function totalDue('),text.indexOf('async function expirePending('))+
 text.slice(text.indexOf('async function applyPayment('),text.indexOf('export async function initLoans('))
assert.match(block,/async function applyPayment/)

function fixture({borrowerCash=0,borrowerBank=0,lenderCash=0,principal=100000,interest=0}={}){
 const wallets={borrower:{jid:'borrower',cash:borrowerCash,bank:borrowerBank},lender:{jid:'lender',cash:lenderCash,bank:0}}
 let loan={id:42,borrower_jid:'borrower',lender_jid:'lender',principal_remaining:principal,interest_due:interest,status:'active'}
 const writes=[],client={async query(sql,params=[]){
  const q=String(sql).replace(/\s+/g,' ').trim()
  if(q.startsWith('SELECT jid,cash,bank FROM wallets')){
    assert.match(q,/ORDER BY jid FOR UPDATE/)
    return {rows:[wallets.borrower,wallets.lender].map(w=>({...w}))}
  }
  if(q.startsWith('UPDATE wallets SET cash=cash-$1,bank=bank-$2')){
   const [cash,bank]=params;wallets.borrower.cash-=cash;wallets.borrower.bank-=bank;writes.push({type:'borrower',cash,bank});return {rowCount:1,rows:[]}
  }
  if(q.startsWith('UPDATE wallets SET cash=cash+$1')){
   wallets.lender.cash+=params[0];writes.push({type:'lender',cash:params[0]});return {rowCount:1,rows:[]}
  }
  if(q.startsWith('UPDATE player_loans SET interest_due=')){
   loan={...loan,interest_due:params[0],principal_remaining:params[1],status:params[2]?'paid':loan.status}
   writes.push({type:'loan',loan:{...loan}});return {rows:[{...loan}],rowCount:1}
  }
  if(q.startsWith('INSERT INTO transactions')){
   writes.push({type:'transaction',amount:params[2]});return {rows:[],rowCount:1}
  }
  throw Error('unexpected SQL: '+q.slice(0,200))
 }}
 const applyPayment=vm.runInNewContext(block+'\napplyPayment',{Math,Number})
 return {client,wallets,writes,getLoan:()=>({...loan}),apply:async(mode='automatic',amount=9999999)=>applyPayment(client,loan,amount,mode)}
}
const total=f=>Object.values(f.wallets).reduce((sum,w)=>sum+w.cash+w.bank,0)
test('cobrança automática sem saldo não gera débito negativo, crédito nem liquida dívida',async()=>{
 const f=fixture()
 const before=total(f),r=await f.apply()
 assert.equal(r.paid,0)
 assert.equal(f.wallets.borrower.bank,0)
 assert.equal(f.wallets.lender.cash,0)
 assert.equal(total(f),before)
 assert.equal(f.getLoan().principal_remaining,100000)
 assert.equal(f.getLoan().status,'active')
 assert.equal(f.writes.length,0)
})
test('saldo parcial paga só o disponível e mantém a dívida em aberto',async()=>{
 const f=fixture({borrowerCash:200,borrowerBank:300,principal:1000})
 const before=total(f)
 const r=await f.apply()
 assert.equal(r.paid,500)
 assert.equal(r.principalPaid,500)
 assert.equal(f.wallets.borrower.cash,0)
 assert.equal(f.wallets.borrower.bank,0)
 assert.equal(f.wallets.lender.cash,500)
 assert.equal(f.getLoan().principal_remaining,500)
 assert.equal(f.getLoan().status,'active')
 assert.equal(total(f),before)
 assert.equal(f.writes.filter(w=>w.type==='transaction').length,1)
 const second=await f.apply()
 assert.equal(second.paid,0)
 assert.equal(f.writes.filter(w=>w.type==='transaction').length,1)
})
test('liquidação integral prioriza juros e fecha o empréstimo sem saldos negativos',async()=>{
 const f=fixture({borrowerCash:200,borrowerBank:1000,principal:1000,interest:100})
 const before=total(f)
 const r=await f.apply()
 assert.equal(r.paid,1100)
 assert.equal(r.interestPaid,100)
 assert.equal(r.principalPaid,1000)
 assert.equal(r.settled,true)
 assert.equal(f.getLoan().status,'paid')
 assert.equal(f.wallets.borrower.cash,0)
 assert.equal(f.wallets.borrower.bank,100)
 assert.equal(f.wallets.lender.cash,1100)
 assert.equal(total(f),before)
})
test('saldo bancário negativo legado não é agravado para creditar novo dinheiro',async()=>{
 const f=fixture({borrowerCash:100,borrowerBank:-200,principal:1000})
 const before=total(f),r=await f.apply()
 assert.equal(r.paid,0)
 assert.equal(f.wallets.borrower.bank,-200)
 assert.equal(f.wallets.lender.cash,0)
 assert.equal(total(f),before)
 assert.equal(f.getLoan().principal_remaining,1000)
})
test('cobrança automática e manual respeitam exatamente o mesmo limite disponível',async()=>{
 for(const mode of ['manual','automatic']){
  const f=fixture({borrowerCash:400,borrowerBank:0,principal:600})
  const r=await f.apply(mode)
  assert.equal(r.paid,400)
  assert.equal(f.wallets.borrower.bank,0)
  assert.equal(f.getLoan().principal_remaining,200)
 }
})
test('não altera limites contratuais, esquema SQL ou rotina de cobrança',()=>{
 assert.match(text,/interest_hours=\$2/)
 assert.match(text,/return applyPayment\(client,loan,totalDue\(loan\),'automatic'\)/)
 assert.match(text,/const paid=Math\.min\(amount,due,available\)/)
 assert.doesNotMatch(text,/forceDebit\?Number\.MAX_SAFE_INTEGER/)
})
