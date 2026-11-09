import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const a=source.indexOf('export async function buyMarketListing(')
const b=source.indexOf('export async function cancelMarketListing(',a)
assert.ok(a>=0&&b>a)
const body=source.slice(a,b).replace('export async function','async function')

function fixture({price=600,buyerCash=450,buyerBank=250,hasSeller=true,expired=false}={}){
 const wallet=new Map([['A',{jid:'A',cash:buyerCash,bank:buyerBank}],...(hasSeller?[['B',{jid:'B',cash:0,bank:0}]]:[])])
 const listing={id:11,item_id:'pocao_p',seller_jid:'B',status:'active',sellable:true,created_at:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+(expired?-2:3600),price,quantity:1}
 const queries=[],accountMutations=[]
 const client={async query(sql,params=[]){
  const q=String(sql).replace(/\s+/g,' ').trim()
  queries.push({q,params})
  if(q.startsWith('SELECT m.*,i.name,i.sellable FROM market_listings'))return {rows:[{...listing}]}
  if(q.startsWith('SELECT jid,cash,bank FROM wallets WHERE jid=ANY')){
   assert.match(q,/ORDER BY jid FOR UPDATE/)
   const ids=params[0];assert.deepEqual(ids,['A','B'])
   return {rows:ids.filter(jid=>wallet.has(jid)).sort().map(jid=>({...wallet.get(jid)}))}
  }
  if(q.startsWith('UPDATE wallets SET cash=cash-$1,bank=bank-$2')){
   assert.equal(params[2],'A')
   wallet.get('A').cash-=params[0];wallet.get('A').bank-=params[1];accountMutations.push('debit');return {rowCount:1}
  }
  if(q.startsWith('UPDATE wallets SET cash=cash+$1')){
   wallet.get('B').cash+=params[0];accountMutations.push('credit');return {rowCount:1}
  }
  if(q.startsWith('INSERT INTO inventories')){accountMutations.push('inventory');return {rowCount:1}}
  if(q.startsWith('UPDATE market_listings SET status=')){listing.status='sold';accountMutations.push('sold');return {rowCount:1}}
  throw Error('unknown SQL: '+q.slice(0,170))
 }}
 const ctx={ensureUser:async()=>{},expireMarketListings:async()=>{},transaction:async run=>run(client),nowSql:'EXTRACT(EPOCH FROM NOW())::BIGINT',Date}
 const buy=vm.runInNewContext(body+'\nbuyMarketListing',ctx)
 return {buy:()=>buy('A',11),listing,wallet,queries,accountMutations}
}
function conserved(x){let sum=0;for(const wallet of x.wallet.values())sum+=wallet.cash+wallet.bank;return sum}
test('compra trava comprador e vendedor ordenados antes de alterar dinheiro',async()=>{
 const f=fixture()
 const total=conserved(f)
 const result=await f.buy()
 assert.equal(result.id,11)
 assert.equal(f.wallet.get('A').cash,0)
 assert.equal(f.wallet.get('A').bank,100)
 assert.equal(f.wallet.get('B').cash,600)
 assert.equal(f.listing.status,'sold')
 assert.equal(conserved(f),total)
 assert.deepEqual(f.accountMutations,['debit','credit','inventory','sold'])
 const walletLockAt=f.queries.findIndex(x=>x.q.includes('SELECT jid,cash,bank FROM wallets'))
 const debitAt=f.queries.findIndex(x=>x.q.startsWith('UPDATE wallets SET cash=cash-$1'))
 assert.ok(walletLockAt>=0&&walletLockAt<debitAt)
})
test('saldo insuficiente impede qualquer transferência e mantém anúncio ativo',async()=>{
 const f=fixture({price:800,buyerCash:200,buyerBank:100})
 await assert.rejects(f.buy(),/Saldo insuficiente/)
 assert.equal(f.accountMutations.length,0)
 assert.equal(f.listing.status,'active')
})
test('vendedor sem carteira não pode receber crédito invisível',async()=>{
 const f=fixture({hasSeller:false})
 await assert.rejects(f.buy(),/Carteira do comprador ou vendedor indisponível/)
 assert.equal(f.accountMutations.length,0)
})
test('não permite comprar anúncio próprio, expirado nem preço impossível',async()=>{
 const expired=fixture({expired:true})
 await assert.rejects(expired.buy(),/anúncio expirou/)
 assert.equal(expired.accountMutations.length,0)
 const invalid=fixture({price:0})
 await assert.rejects(invalid.buy(),/Preço inválido/)
 assert.equal(invalid.accountMutations.length,0)
})
test('contrato SQL de duas carteiras é idêntico ao ordenamento seguro do PIX',()=>{
 assert.match(body,/SELECT jid,cash,bank FROM wallets WHERE jid=ANY\(\$1::text\[\]\) ORDER BY jid FOR UPDATE/)
 assert.match(source,/SELECT jid,cash FROM wallets WHERE jid=ANY\(\$1::text\[\]\) ORDER BY jid FOR UPDATE/)
 assert.doesNotMatch(body,/SELECT cash,bank FROM wallets WHERE jid=\$1 FOR UPDATE/)
})
